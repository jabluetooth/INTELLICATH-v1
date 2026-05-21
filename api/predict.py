import json
import logging
from datetime import datetime
from http.server import BaseHTTPRequestHandler

from api.db import (
    check_auth,
    check_rate_limit,
    get_model,
    save_data_to_firestore,
    validate_sensor_data,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _send_json(handler, status, body):
    payload = json.dumps(body).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(payload)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        client_ip = self.client_address[0]

        if not check_auth(self.headers):
            _send_json(self, 401, {"error": "Unauthorized"})
            return

        if not check_rate_limit(client_ip):
            _send_json(self, 429, {"error": "Too many requests"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            data = json.loads(raw) if raw else None
        except (ValueError, UnicodeDecodeError):
            _send_json(self, 400, {"error": "Invalid JSON body"})
            return

        if not data:
            _send_json(self, 400, {"error": "No data received"})
            return

        cleaned, err = validate_sensor_data(data)
        if err:
            _send_json(self, 400, {"error": err})
            return

        try:
            model, scaler = get_model()
            features = [[cleaned["remaining_volume"], cleaned["urine_flow_rate"]]]
            scaled = scaler.transform(features)
            minutes = model.predict(scaled)[0]
            hours = int(minutes // 60)
            mins  = int(minutes % 60)
            predicted_time = f"{hours:02} hours and {mins:02} minutes"
            logger.info("Predicted time: %s", predicted_time)

            actual_time = (
                datetime.now().strftime("%H:%M")
                if cleaned["catheter_bag_volume"] >= 800 else None
            )

            device_id = self.headers.get("X-Device-Id")
            record = {**cleaned, "predicted_time": predicted_time, "actual_time": actual_time}
            if device_id:
                record["device_id"] = device_id

            save_data_to_firestore(record)

            _send_json(self, 200, {
                "status": "success",
                "predicted_time": predicted_time,
                "actual_time": actual_time,
            })

        except Exception as exc:
            logger.error("Prediction error: %s", exc, exc_info=True)
            _send_json(self, 500, {"error": "An internal error occurred. Please try again."})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, X-Device-Id")
        self.end_headers()
