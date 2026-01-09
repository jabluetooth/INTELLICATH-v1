import os
import json
import logging
import numpy as np
import joblib
from datetime import datetime
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

def save_data_to_firestore(data):
    """Saves the latest data to Firestore if there is a significant change."""
    try:
        db = get_firestore_client()
        collection = db.collection("intellicath_data")

        # Get the last entry
        last_docs = collection.order_by("timestamp", direction=firestore.Query.DESCENDING).limit(1).stream()
        last_entry = None
        for doc in last_docs:
            last_entry = doc.to_dict()
            break

        if last_entry:
            # Check if there's a significant change
            if abs(last_entry.get("urine_output", 0) - data["urine_output"]) <= 2 and \
               abs(last_entry.get("urine_flow_rate", 0) - data["urine_flow_rate"]) <= 0.1 and \
               abs(last_entry.get("catheter_bag_volume", 0) - data["catheter_bag_volume"]) <= 2:
                logger.debug("No significant change in data. Skipping insert.")
                return True

        # Add timestamp
        data["timestamp"] = firestore.SERVER_TIMESTAMP

        # Add new document
        collection.document().set(data)
        logger.info("Data inserted into Firestore successfully.")
        return True

    except Exception as e:
        logger.error(f"Firestore Insert Failed: {e}")
        return False

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body) if body else None

            if not data:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "No data received"}).encode())
                return

            urine_output = data.get("urine_output")
            urine_flow_rate = data.get("urine_flow_rate")
            catheter_bag_volume = data.get("catheter_bag_volume")
            remaining_volume = data.get("remaining_volume")

            if urine_flow_rate is None or remaining_volume is None:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Missing input values"}).encode())
                return

            actual_time = datetime.now().strftime("%H:%M") if catheter_bag_volume >= 800 else None
            features = np.array([[remaining_volume, urine_flow_rate]])

            # Load models from models directory
            model_path = os.path.join(BASE_DIR, "models", "decision_tree.pkl")
            scaler_path = os.path.join(BASE_DIR, "models", "scaler.pkl")

            model = joblib.load(model_path)
            scaler = joblib.load(scaler_path)

            scaled_features = scaler.transform(features)
            predicted_time_minutes = model.predict(scaled_features)[0]
            hours = int(predicted_time_minutes // 60)
            minutes = int(predicted_time_minutes % 60)
            predicted_time = f"{hours:02} hours and {minutes:02} minutes"
            logger.info(f"Predicted Time: {predicted_time}")

            save_data_to_firestore({
                "urine_output": urine_output,
                "urine_flow_rate": urine_flow_rate,
                "catheter_bag_volume": catheter_bag_volume,
                "remaining_volume": remaining_volume,
                "predicted_time": predicted_time,
                "actual_time": actual_time
            })

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "success",
                "predicted_time": predicted_time,
                "actual_time": actual_time
            }).encode())

        except Exception as e:
            logger.error(f"Prediction Error: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
