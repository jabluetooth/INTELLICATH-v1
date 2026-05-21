import os
import json
import time
import hashlib
import logging
import joblib
from google.cloud import firestore
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Firestore singleton ────────────────────────────────────────────────────────

_firestore_client = None

def get_firestore_client():
    global _firestore_client
    if _firestore_client is None:
        creds_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
        if creds_json:
            d = json.loads(creds_json)
            creds = service_account.Credentials.from_service_account_info(d)
            _firestore_client = firestore.Client(
                credentials=creds, project=d.get("project_id")
            )
        else:
            key_path = os.path.join(BASE_DIR, "serviceAccountKey.json")
            if os.path.exists(key_path):
                _firestore_client = firestore.Client.from_service_account_json(key_path)
            else:
                raise ValueError(
                    "Firebase credentials not found. "
                    "Set FIREBASE_SERVICE_ACCOUNT env var or provide serviceAccountKey.json"
                )
    return _firestore_client


# ── ML model singleton ─────────────────────────────────────────────────────────

_model = None
_scaler = None

def _verify_hash(path, env_var):
    expected = os.getenv(env_var)
    if not expected:
        return
    with open(path, "rb") as f:
        actual = hashlib.sha256(f.read()).hexdigest()
    if actual != expected:
        raise ValueError(f"Integrity check failed for {os.path.basename(path)}")

def get_model():
    global _model, _scaler
    if _model is None:
        model_path  = os.path.join(BASE_DIR, "models", "decision_tree.pkl")
        scaler_path = os.path.join(BASE_DIR, "models", "scaler.pkl")
        _verify_hash(model_path,  "MODEL_HASH_TREE")
        _verify_hash(scaler_path, "MODEL_HASH_SCALER")
        _model  = joblib.load(model_path)
        _scaler = joblib.load(scaler_path)
    return _model, _scaler


# ── Input validation ───────────────────────────────────────────────────────────

def validate_sensor_data(data):
    """Returns (cleaned_data, error_str). error_str is None on success."""
    required = ["urine_output", "urine_flow_rate", "catheter_bag_volume", "remaining_volume"]
    for field in required:
        if data.get(field) is None:
            return None, f"Missing required field: {field}"
    try:
        cleaned = {
            "urine_output":        float(data["urine_output"]),
            "urine_flow_rate":     float(data["urine_flow_rate"]),
            "catheter_bag_volume": float(data["catheter_bag_volume"]),
            "remaining_volume":    float(data["remaining_volume"]),
        }
    except (TypeError, ValueError) as exc:
        return None, f"Invalid data type: {exc}"

    bounds = [
        ("catheter_bag_volume", 0, 800),
        ("remaining_volume",    0, 800),
        ("urine_flow_rate",     0, 100),
        ("urine_output",        0, 5000),
    ]
    for field, lo, hi in bounds:
        if not (lo <= cleaned[field] <= hi):
            return None, f"{field} out of acceptable range ({lo}–{hi})"

    return cleaned, None


# ── API key authentication ─────────────────────────────────────────────────────

_API_KEY = None

def _get_api_key():
    global _API_KEY
    if _API_KEY is None:
        _API_KEY = os.getenv("API_SECRET_KEY")
    return _API_KEY

def check_auth(headers):
    """Skips auth when API_SECRET_KEY is not set (local dev mode)."""
    key = _get_api_key()
    if not key:
        return True
    provided = headers.get("X-Api-Key") or headers.get("x-api-key")
    return provided == key


# ── Rate limiting (per-IP, in-process) ────────────────────────────────────────

_rate_store = {}
RATE_WINDOW_S = 1.0

def check_rate_limit(client_ip):
    now = time.monotonic()
    last = _rate_store.get(client_ip, 0)
    if now - last < RATE_WINDOW_S:
        return False
    _rate_store[client_ip] = now
    return True


# ── Firestore helpers ──────────────────────────────────────────────────────────

def save_data_to_firestore(data):
    try:
        db  = get_firestore_client()
        col = db.collection("intellicath_data")

        last_docs = (
            col.order_by("timestamp", direction=firestore.Query.DESCENDING)
               .limit(1)
               .stream()
        )
        last = None
        for doc in last_docs:
            last = doc.to_dict()
            break

        if last:
            no_change = (
                abs(last.get("urine_output",        0) - data["urine_output"])        <= 2   and
                abs(last.get("urine_flow_rate",     0) - data["urine_flow_rate"])     <= 0.1 and
                abs(last.get("catheter_bag_volume", 0) - data["catheter_bag_volume"]) <= 2
            )
            if no_change:
                logger.debug("No significant change — skipping insert.")
                return True

        data["timestamp"] = firestore.SERVER_TIMESTAMP
        col.add(data)
        logger.info("Record saved to Firestore.")
        return True

    except Exception as exc:
        logger.error("Firestore save failed: %s", exc)
        return False


def get_latest_data(device_id=None):
    try:
        db    = get_firestore_client()
        col   = db.collection("intellicath_data")
        query = col.order_by("timestamp", direction=firestore.Query.DESCENDING)
        if device_id:
            query = query.where("device_id", "==", device_id)

        for doc in query.limit(1).stream():
            record = doc.to_dict()
            if record.get("timestamp"):
                record["timestamp"] = str(record["timestamp"])
            record["id"] = doc.id
            return record

        return None

    except Exception as exc:
        logger.error("Firestore fetch failed: %s", exc)
        return None
