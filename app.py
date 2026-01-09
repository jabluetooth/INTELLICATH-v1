import ssl
import os
import json
import logging
import numpy as np
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import joblib
from datetime import datetime
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__, template_folder='public', static_folder='public', static_url_path='')
CORS(app)

# Initialize Firebase Admin SDK
def get_firestore_client():
    """Initialize and return Firestore client."""
    if not firebase_admin._apps:
        # Check for service account JSON in environment variable
        firebase_creds = os.getenv("FIREBASE_SERVICE_ACCOUNT")
        if firebase_creds:
            cred_dict = json.loads(firebase_creds)
            cred = credentials.Certificate(cred_dict)
        else:
            # Fallback to file-based credentials for local development
            cred_path = "serviceAccountKey.json"
            if os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
            else:
                raise ValueError("Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT env var or provide serviceAccountKey.json")

        firebase_admin.initialize_app(cred)

    return firestore.client()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/predict-post", methods=["POST"])
@app.route("/api/predict", methods=["POST"])
def predict():
    """Receives data, processes it, and stores predictions in Firestore."""
    data = request.get_json()

    if not data:
        return jsonify({"error": "No data received"}), 400
    try:
        urine_output = data.get("urine_output")
        urine_flow_rate = data.get("urine_flow_rate")
        catheter_bag_volume = data.get("catheter_bag_volume")
        remaining_volume = data.get("remaining_volume")

        if urine_flow_rate is None or remaining_volume is None:
            return jsonify({"error": "Missing input values"}), 400

        actual_time = datetime.now().strftime("%H:%M") if catheter_bag_volume >= 800 else None
        features = np.array([[remaining_volume, urine_flow_rate]])

        model = joblib.load("models/decision_tree.pkl")
        scaler = joblib.load("models/scaler.pkl")

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

        return jsonify({
            "status": "success",
            "predicted_time": predicted_time,
            "actual_time": actual_time
        })

    except Exception as e:
        logger.error(f"Prediction Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/data", methods=["GET"])
def get_data():
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
            return jsonify(data)

        return jsonify({"status": "no_data", "message": "No data available"})

    except Exception as e:
        logger.error(f"Data Fetch Error: {e}")
        return jsonify({"status": "error", "error": str(e)}), 500


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
        collection.add(data)
        logger.info("Data inserted into Firestore successfully.")
        return True

    except Exception as e:
        logger.error(f"Firestore Insert Failed: {e}")
        return False

if __name__ == "__main__":
    # SSL configuration from environment
    ssl_cert = os.getenv("SSL_CERT_PATH", "localhost.pem")
    ssl_key = os.getenv("SSL_KEY_PATH", "localhost-key.pem")

    # Check if SSL certificates exist
    if os.path.exists(ssl_cert) and os.path.exists(ssl_key):
        context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        context.load_cert_chain(certfile=ssl_cert, keyfile=ssl_key)
        logger.info(f"Starting Flask app with SSL on port {os.getenv('FLASK_PORT', 5001)}")
        app.run(
            debug=os.getenv("FLASK_DEBUG", "True") == "True",
            host=os.getenv("FLASK_HOST", "0.0.0.0"),
            port=int(os.getenv("FLASK_PORT", 5001)),
            ssl_context=context
        )
    else:
        logger.warning(f"SSL certificates not found. Starting without SSL.")
        app.run(
            debug=os.getenv("FLASK_DEBUG", "True") == "True",
            host=os.getenv("FLASK_HOST", "0.0.0.0"),
            port=int(os.getenv("FLASK_PORT", 5001))
        )
