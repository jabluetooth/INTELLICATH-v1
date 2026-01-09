import os
import json
import logging
from http.server import BaseHTTPRequestHandler
from google.cloud import firestore
from google.oauth2 import service_account

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get the directory where this file is located
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Firestore client singleton
_firestore_client = None

def get_firestore_client():
    """Initialize and return Firestore client."""
    global _firestore_client
    if _firestore_client is None:
        firebase_creds = os.getenv("FIREBASE_SERVICE_ACCOUNT")
        if firebase_creds:
            cred_dict = json.loads(firebase_creds)
            credentials_obj = service_account.Credentials.from_service_account_info(cred_dict)
            _firestore_client = firestore.Client(credentials=credentials_obj, project=cred_dict.get("project_id"))
        else:
            # Fallback to file-based credentials for local development
            cred_path = os.path.join(BASE_DIR, "serviceAccountKey.json")
            if os.path.exists(cred_path):
                _firestore_client = firestore.Client.from_service_account_json(cred_path)
            else:
                raise ValueError("Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT env var or provide serviceAccountKey.json")
    return _firestore_client

def get_latest_data():
    """Fetch the latest data from Firestore."""
    try:
        db = get_firestore_client()
        collection = db.collection("intellicath_data")

        # Get the most recent document
        docs = collection.order_by("timestamp", direction=firestore.Query.DESCENDING).limit(1).stream()

        for doc in docs:
            data = doc.to_dict()
            # Convert timestamp to string if present
            if data.get("timestamp"):
                data["timestamp"] = str(data["timestamp"])
            data["id"] = doc.id
            return data

        return None

    except Exception as e:
        logger.error(f"Firestore Fetch Failed: {e}")
        return None

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            data = get_latest_data()

            if data is None:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "no_data",
                    "message": "No data available"
                }).encode())
                return

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

        except Exception as e:
            logger.error(f"Data Fetch Error: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "error": str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
