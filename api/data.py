import json
import logging
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from db import check_auth, check_rate_limit, get_latest_data

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
    def do_GET(self):
        client_ip = self.client_address[0]

        if not check_auth(self.headers):
            _send_json(self, 401, {"error": "Unauthorized"})
            return

        if not check_rate_limit(client_ip):
            _send_json(self, 429, {"error": "Too many requests"})
            return

        try:
            params    = parse_qs(urlparse(self.path).query)
            device_id = params.get("device", [None])[0]
            data      = get_latest_data(device_id=device_id)

            if data is None:
                _send_json(self, 200, {"status": "no_data", "message": "No data available"})
                return

            _send_json(self, 200, data)

        except Exception as exc:
            logger.error("Data fetch error: %s", exc, exc_info=True)
            _send_json(self, 500, {"error": "An internal error occurred. Please try again."})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, X-Device-Id")
        self.end_headers()
