# INTELLICATH — Audit Remediation Plan

> Generated: 2026-05-21  
> Audited by: Claude Code (claude-sonnet-4-6)  
> Status tracking: check boxes below as each item is resolved

---

## How to Use This Document

Each issue has a checkbox `[ ]`, a severity badge, the affected file(s), a description of the problem, and a concrete fix. Work top-to-bottom — Critical and High items should be resolved before deployment. Functional bugs should be fixed before clinical use.

---

## Table of Contents

1. [Critical Security](#critical-security)
2. [High Security](#high-security)
3. [Medium Security](#medium-security)
4. [Functional Bugs](#functional-bugs)
5. [Code Quality / Duplication](#code-quality--duplication)
6. [UI/UX](#uiux)

---

## Critical Security

---

### [SEC-1] No authentication on any API endpoint

- **Severity:** `CRITICAL`
- **Files:** `api/predict.py`, `api/data.py`, `app.py`

**Problem:**  
Both `/api/predict` and `/api/data` are fully open to the internet with `Access-Control-Allow-Origin: *`. Any actor with the Vercel URL can read patient monitoring data or inject arbitrary sensor readings. No API key, token, or session is required.

**Fix:**  
Implement API key authentication. Generate a secret key, store it as a Vercel environment variable (`API_SECRET_KEY`), and validate it on every request via a custom header (`X-API-Key`). The ESP32 and the frontend must include the key in their requests.

```python
# In both api/predict.py and api/data.py, add at the top of do_POST / do_GET:
API_KEY = os.getenv("API_SECRET_KEY")

def _check_auth(self):
    provided = self.headers.get("X-Api-Key")
    if not API_KEY or provided != API_KEY:
        self.send_response(401)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps({"error": "Unauthorized"}).encode())
        return False
    return True
```

Then call `if not self._check_auth(): return` at the start of `do_POST` and `do_GET`.

On the frontend (`api.js`), add the header to all requests:
```js
headers: { 'Content-Type': 'application/json', 'X-Api-Key': window.__API_KEY__ }
```

On the ESP32, add to `sendDataToServer`:
```cpp
http.addHeader("X-Api-Key", apiKey); // stored in config.h
```

- [x] Add `API_SECRET_KEY` to Vercel environment variables — documented in `.env.example`
- [x] Validate key in `api/predict.py` — via `check_auth()` in `api/db.py`
- [x] Validate key in `api/data.py` — via `check_auth()` in `api/db.py`
- [x] Validate key in `app.py` — via `_check_auth()` helper
- [ ] Pass key in `api.js` fetch calls — requires `API_SECRET_KEY` to be injected at build/deploy time
- [x] Pass key in Arduino `sendDataToServer` — `X-Api-Key` header added
- [x] Add `apiKey` to `models/ARDUINOCODE/config.h.example`

---

### [SEC-2] Arbitrary pickle deserialization (potential RCE)

- **Severity:** `CRITICAL`
- **Files:** `api/predict.py:107-108`, `app.py:72-73`

**Problem:**  
`joblib.load()` on `.pkl` files executes arbitrary Python bytecode. If the deployment environment or the repo is compromised and model files are replaced, an attacker achieves Remote Code Execution. No integrity check is performed.

**Fix:**  
Compute SHA-256 hashes of `decision_tree.pkl` and `scaler.pkl` at training time, store them as environment variables (`MODEL_HASH_TREE`, `MODEL_HASH_SCALER`), and verify at load time:

```python
import hashlib

def _verify_model_hash(path, expected_hash_env):
    expected = os.getenv(expected_hash_env)
    if not expected:
        return  # skip verification if env var not set (dev mode)
    with open(path, "rb") as f:
        actual = hashlib.sha256(f.read()).hexdigest()
    if actual != expected:
        raise ValueError(f"Model file integrity check failed for {path}")
```

Call this before `joblib.load()` on both model files.

- [x] Generate SHA-256 hashes of current `decision_tree.pkl` and `scaler.pkl` — stored in `.env.example`
- [x] Store hashes as `MODEL_HASH_TREE` and `MODEL_HASH_SCALER` env vars in Vercel — documented
- [x] Add `_verify_hash` helper to `api/db.py` and `app.py`
- [x] Call hash verification in `api/predict.py` — via `get_model()` singleton in `api/db.py`
- [x] Call hash verification in `app.py` — via `get_model()` singleton
- [x] Document process for updating hashes when models are retrained — in `.env.example` comments

---

### [SEC-3] Internal error details leaked in 500 responses

- **Severity:** `CRITICAL`
- **Files:** `api/predict.py:142`, `api/data.py:87`, `app.py:99`, `app.py:123`

**Problem:**  
`json.dumps({"error": str(e)})` returns raw exception messages to clients, which can expose Firebase connection strings, internal file paths, and stack details.

**Fix:**  
Return a generic message to the client; log the full exception server-side.

```python
# Replace:
self.wfile.write(json.dumps({"error": str(e)}).encode())

# With:
logger.error(f"Unhandled error: {e}", exc_info=True)
self.wfile.write(json.dumps({"error": "An internal error occurred. Please try again."}).encode())
```

Same pattern for Flask routes in `app.py`:
```python
# Replace:
return jsonify({"error": str(e)}), 500
# With:
logger.error(f"Unhandled error: {e}", exc_info=True)
return jsonify({"error": "An internal error occurred."}), 500
```

- [x] Fix error response in `api/predict.py` — generic message returned, full trace logged
- [x] Fix error response in `api/data.py` — generic message returned, full trace logged
- [x] Fix error response in `app.py` (predict route)
- [x] Fix error response in `app.py` (data route)

---

### [SEC-4] Missing input validation allows None/type errors and bad data

- **Severity:** `CRITICAL`
- **Files:** `api/predict.py:87-100`, `app.py:61-69`

**Problem:**  
Only `urine_flow_rate` and `remaining_volume` are checked for `None`. `catheter_bag_volume >= 800` at line 100 throws `TypeError` if `None` is passed. No range validation means the ML model receives nonsensical inputs.

**Fix:**  
Add a dedicated validation function with type coercion and clinical range bounds:

```python
def validate_sensor_data(data):
    """Returns (cleaned_data, error_message). error_message is None on success."""
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
    except (TypeError, ValueError) as e:
        return None, f"Invalid data type: {e}"

    if not (0 <= cleaned["catheter_bag_volume"] <= 800):
        return None, "catheter_bag_volume out of range (0–800 mL)"
    if not (0 <= cleaned["urine_flow_rate"] <= 100):
        return None, "urine_flow_rate out of range (0–100 mL/min)"
    if not (0 <= cleaned["remaining_volume"] <= 800):
        return None, "remaining_volume out of range (0–800 mL)"
    if not (0 <= cleaned["urine_output"] <= 5000):
        return None, "urine_output out of range (0–5000 mL)"

    return cleaned, None
```

- [x] Write `validate_sensor_data` in `api/db.py` (shared)
- [x] Use it in `api/predict.py` before any field access
- [x] Use it in `app.py` predict route before any field access
- [x] Return 400 with descriptive message on validation failure

---

### [SEC-5] Flask debug mode defaults to True

- **Severity:** `CRITICAL`
- **Files:** `app.py:170`, `app.py:178`

**Problem:**  
`debug=os.getenv("FLASK_DEBUG", "True") == "True"` defaults to debug enabled. If `app.py` is exposed on a local network during testing, the Werkzeug interactive debugger is accessible and allows arbitrary Python execution.

**Fix:**  
Change the default to `False`:

```python
# Replace:
debug=os.getenv("FLASK_DEBUG", "True") == "True",
# With:
debug=os.getenv("FLASK_DEBUG", "False") == "True",
```

- [x] Change default in `app.py` — `FLASK_DEBUG` now defaults to `"False"`
- [x] Add `FLASK_DEBUG=False` to `.env.example` with a comment

---

## High Security

---

### [SEC-6] No input range validation (see also SEC-4)

- **Severity:** `HIGH`
- **Files:** `api/predict.py`, `app.py`

**Problem:**  
Even after null-checking, there is no bounds validation. The ML model will receive and store nonsensical values like `remaining_volume: -99999` or `urine_flow_rate: 1e9`.

**Fix:**  
Already covered in SEC-4 `validate_sensor_data`. This item is resolved once SEC-4 is complete.

- [x] Confirmed covered by SEC-4 — `validate_sensor_data` in `api/db.py`

---

### [SEC-7] No rate limiting

- **Severity:** `HIGH`
- **Files:** `api/predict.py`, `api/data.py`

**Problem:**  
The ESP32 posts every 1 second and there is no server-side throttle. Malicious actors can flood the endpoint, filling Firestore with garbage records or exhausting Vercel function invocations.

**Fix:**  
On Vercel, add rate limiting via `vercel.json` using Vercel's Edge Config or a middleware approach. A simple in-memory solution per serverless instance can be applied as a stopgap:

```python
# Add to api/predict.py module level
import time
_last_requests = {}  # key: client IP → last timestamp
RATE_LIMIT_SECONDS = 0.8  # allow max ~1 req/sec per IP

def _check_rate_limit(client_ip):
    now = time.time()
    last = _last_requests.get(client_ip, 0)
    if now - last < RATE_LIMIT_SECONDS:
        return False
    _last_requests[client_ip] = now
    return True
```

For a production-grade solution, use Vercel's built-in rate limiting or a Redis-backed counter (Upstash free tier works with Vercel).

- [x] Implement per-IP rate limit in `api/predict.py` — via `check_rate_limit()` in `api/db.py`
- [x] Implement per-IP rate limit in `api/data.py` — via `check_rate_limit()` in `api/db.py`
- [ ] Consider Vercel edge rate limiting for production (in-process limit is per-instance only)

---

### [SEC-8] No device authentication on ESP32

- **Severity:** `HIGH`
- **Files:** `models/ARDUINOCODE/ARDUINOCODE.ino:127-143`

**Problem:**  
The ESP32 sends raw HTTP POST with no device ID or token. Any script can impersonate the device and inject false readings into a live patient's monitoring stream.

**Fix:**  
After implementing SEC-1, the API key header also serves as device authentication for a single-device setup. For multi-device deployments, add a device ID:

```cpp
// In config.h.example, add:
const char* deviceId = "ESP32_UNIT_01";

// In sendDataToServer, add headers:
http.addHeader("X-Api-Key", apiKey);
http.addHeader("X-Device-Id", deviceId);
```

On the backend, log `X-Device-Id` with each record stored in Firestore.

- [x] Add `deviceId` to `config.h.example`
- [x] Include `X-Device-Id` header in Arduino POST
- [x] Store `device_id` field in Firestore documents — `api/predict.py` and `app.py` capture it

---

### [SEC-9] No SSL certificate validation on ESP32

- **Severity:** `HIGH`
- **Files:** `models/ARDUINOCODE/ARDUINOCODE.ino:128-129`

**Problem:**  
`http.begin(serverURL)` does not validate the server's SSL certificate, making the connection vulnerable to MITM attacks that could intercept or replace sensor data.

**Fix:**  
Use `WiFiClientSecure` with a pinned root CA certificate (the Let's Encrypt CA used by Vercel):

```cpp
#include <WiFiClientSecure.h>

// Add Vercel's root CA (ISRG Root X1):
const char* rootCACert = \
"-----BEGIN CERTIFICATE-----\n" \
"MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n" \
// ... (full cert)
"-----END CERTIFICATE-----\n";

WiFiClientSecure client;
client.setCACert(rootCACert);
HTTPClient http;
http.begin(client, serverURL);
```

- [x] Add `WiFiClientSecure` and ISRG Root X1 CA cert to `ARDUINOCODE.ino`
- [x] Replace `HTTPClient http; http.begin(serverURL)` with `WiFiClientSecure` + `setCACert()`
- [x] Update `config.h.example` with SSL note

---

## Medium Security

---

### [SEC-10] XSS risk in toast notification innerHTML

- **Severity:** `MEDIUM`
- **Files:** `public/index.html:842-849`

**Problem:**  
`toast.innerHTML` is set with interpolated `${title}` and `${message}`. If API error responses ever contain HTML (e.g., from a modified backend or MITM), it will execute as markup.

**Fix:**  
Use `textContent` for user-visible strings instead of `innerHTML`, or sanitize before insertion:

```js
function showToast(type, title, message, duration = 5000) {
    const container = document.getElementById('toastContainer');
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'i' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconEl = document.createElement('div');
    iconEl.className = 'toast-icon';
    iconEl.textContent = icons[type] || 'i';

    const contentEl = document.createElement('div');
    contentEl.className = 'toast-content';

    const titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = title;  // safe

    const msgEl = document.createElement('div');
    msgEl.className = 'toast-message';
    msgEl.textContent = message;  // safe

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => dismissToast(toast);

    contentEl.appendChild(titleEl);
    contentEl.appendChild(msgEl);
    toast.appendChild(iconEl);
    toast.appendChild(contentEl);
    toast.appendChild(closeBtn);

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    if (duration > 0) setTimeout(() => dismissToast(toast), duration);
    return toast;
}
```

- [x] Replace `innerHTML` with DOM API construction in `showToast` — `index.html` updated
- [x] Add `aria-label="Dismiss notification"` to the close button

---

### [SEC-11] ML models loaded on every request

- **Severity:** `MEDIUM` (security + performance)
- **Files:** `api/predict.py:107-108`, `app.py:72-73`

**Problem:**  
`joblib.load()` is called on every POST. Beyond performance waste, per-request loads mean the file is read from disk repeatedly — increasing the window during which a tampered file could be swapped in between integrity check and load.

**Fix:**  
Load models once at module level (Vercel serverless functions warm-start between invocations):

```python
# At module level in api/predict.py, after BASE_DIR is defined:
_model = None
_scaler = None

def get_model():
    global _model, _scaler
    if _model is None:
        model_path  = os.path.join(BASE_DIR, "models", "decision_tree.pkl")
        scaler_path = os.path.join(BASE_DIR, "models", "scaler.pkl")
        _verify_model_hash(model_path, "MODEL_HASH_TREE")    # from SEC-2
        _verify_model_hash(scaler_path, "MODEL_HASH_SCALER") # from SEC-2
        _model  = joblib.load(model_path)
        _scaler = joblib.load(scaler_path)
    return _model, _scaler
```

Replace the two `joblib.load()` calls with `model, scaler = get_model()`.

- [x] Add module-level singleton loader `get_model()` in `api/db.py` (used by `api/predict.py`)
- [x] Add module-level singleton loader `get_model()` in `app.py`
- [x] Hash verification integrated inside `get_model()` in both locations

---

### [SEC-12] Service account key is over-scoped

- **Severity:** `MEDIUM`
- **Files:** Firebase console (config, not code)

**Problem:**  
The full service account JSON grants broad Firebase project access. Only Firestore read/write on the `intellicath_data` collection is needed.

**Fix:**  
In the Google Cloud Console (IAM & Admin), create a new service account with only the `roles/datastore.user` role (Cloud Datastore User). Revoke the old over-scoped key. Store the new key as `FIREBASE_SERVICE_ACCOUNT`.

- [ ] Create a new least-privilege service account in GCP IAM *(manual — Google Cloud Console)*
- [ ] Grant only `roles/datastore.user` *(manual)*
- [ ] Rotate the Vercel environment variable to the new key *(manual)*
- [ ] Revoke the old service account key *(manual)*

---

## Functional Bugs

---

### [BUG-1] `warnThreshold` setting has no effect

- **Files:** `public/js/app.js:9`, `public/js/ui.js:40-63`, `public/index.html:700-701`

**Problem:**  
`App.settings.warnThreshold` defaults to 640 and is user-configurable in the sidebar, but `UI._getStatusConfig()` uses hardcoded percentages (75%, 87.5%) and never reads the setting.

**Fix:**  
Pass `warnThreshold` into the status config logic and derive thresholds from it:

```js
// In ui.js, change _getStatusConfig signature:
_getStatusConfig(pct, flowRate, urineOutput, warnThresholdMl = 600) {
    const maxMl = CONFIG.BAG.MAX_CAPACITY;
    const warnPct  = (warnThresholdMl / maxMl) * 100;
    const critPct  = warnPct + 12.5;  // 87.5% when warn is 75%

    if (pct >= critPct)  return { /* critical config */ };
    if (pct >= warnPct)  return { /* warning config */ };
    // ...
}
```

Call it as `this._getStatusConfig(pct, flow, uout, App.settings.warnThreshold)` from both `_updateReadout` and `_updateGrid`.

- [x] Update `_getStatusConfig` to accept `warnThresholdMl` — `ui.js` updated
- [x] Pass `App.settings.warnThreshold` from `_updateReadout`
- [x] Pass `App.settings.warnThreshold` from `_updateGrid`

---

### [BUG-2] Critical notification fires when bag is already full

- **Files:** `public/js/config.js:17`, `public/js/notifications.js:109-119`

**Problem:**  
`CONFIG.BAG.CRITICAL_THRESHOLD = 800` is the same as `MAX_CAPACITY`, meaning the "bag full" browser notification fires only when the bag has already reached maximum. The UI correctly shows critical state at 87.5% (700 mL) but the notification lags behind.

**Fix:**  
Align the notification threshold with the visual critical threshold:

```js
// In config.js, change:
CRITICAL_THRESHOLD: 700,  // 87.5% of 800 mL — matches UI critical state
```

- [x] Set `CONFIG.BAG.CRITICAL_THRESHOLD` to `700` in `config.js`

---

### [BUG-3] ESP32 config inputs are non-functional

- **Files:** `public/index.html:719-729`

**Problem:**  
The WiFi SSID, password, and server URL fields in the sidebar accept input but have no event handlers, no save button, and no effect. They mislead the user into thinking configuration is possible from the browser.

**Fix (option A — remove):**  
Remove the three `setting-item-col` blocks from the ESP32 Configuration section and replace with a read-only note:

```html
<div class="sidebar-section">
    <div class="sidebar-meta-label">ESP32 Configuration</div>
    <p class="setting-label" style="padding: 12px 0; line-height:1.6;">
        Configure WiFi credentials and server URL directly in
        <code>models/ARDUINOCODE/config.h</code> before flashing the device.
    </p>
</div>
```

**Fix (option B — implement):**  
Wire the inputs to generate a downloadable `config.h` file via the Web File System API or a blob download, so nurses/techs can generate the file without editing code.

- [x] Decided: removed non-functional inputs, replaced with informational note
- [x] Implemented in `index.html`

---

### [BUG-4] Signal quality hardcoded to 99%

- **Files:** `public/js/ui.js:127-128`

**Problem:**  
`signalQuality.textContent = '99%'` is set on every data refresh, regardless of actual connectivity. This is meaningless and misleading in a clinical context.

**Fix:**  
Remove the signal quality card entirely, or derive a real signal indicator from connection state:

```js
// Replace hardcoded value with connection-derived status:
const signalText = App.lastFetchSuccess ? 'ONLINE' : 'OFFLINE';
const signalSub  = App.lastFetchSuccess ? 'All sensors active' : 'Check device';
this.elements.signalQuality.textContent    = signalText;
this.elements.signalQualitySub.textContent = signalSub;
```

Track `App.lastFetchSuccess` as a boolean set in `fetchData()`.

- [x] Remove hardcoded `'99%'` from `ui.js` — now shows `ONLINE`/`OFFLINE` from `App.lastFetchSuccess`

---

### [BUG-5] User settings not persisted across page reloads

- **Files:** `public/js/app.js:4-11`

**Problem:**  
All settings (alert toggles, `warnThreshold`, `refreshSecs`) live only in memory. A page refresh resets everything to defaults.

**Fix:**  
Load settings from `localStorage` on init, save on each change:

```js
// In App:
_loadSettings() {
    const saved = localStorage.getItem('intellicath_settings');
    if (saved) {
        try { Object.assign(this.settings, JSON.parse(saved)); } catch (e) {}
    }
},

_saveSettings() {
    localStorage.setItem('intellicath_settings', JSON.stringify(this.settings));
},

toggleSetting(key, val) {
    this.settings[key] = val;
    this._saveSettings();
},

updateThreshold(val) {
    this.settings.warnThreshold = parseInt(val);
    this._saveSettings();
},

updateRefresh(val) {
    this.settings.refreshSecs = Math.max(1, parseInt(val));
    this._saveSettings();
    this.startAutoRefresh();
},
```

Also sync the sidebar UI inputs to loaded values in `App.init()`.

- [x] Add `_loadSettings` and `_saveSettings` to `App` — `app.js` updated
- [x] Call `_loadSettings` in `App.init()`
- [x] Call `_saveSettings` in `toggleSetting`, `updateThreshold`, `updateRefresh`
- [x] Sync sidebar inputs to loaded settings via `_syncSidebarInputs()` in `init()`

---

### [BUG-6] "cc / hour" label is clinically incorrect

- **Files:** `public/index.html:803`, `models/ARDUINOCODE/ARDUINOCODE.ino:61`

**Problem:**  
The Arduino calculates `urine_output = current_bag_volume - starting_catheter_bag_volume`, which is the cumulative total since the last reset — not a per-hour rate. Displaying it as "cc / hour" is clinically misleading.

**Fix:**  
Change the label to accurately reflect the value being shown:

```html
<!-- In index.html, change: -->
<div class="sc-unit">cc total</div>
```

Optionally, compute a true hourly rate on the backend by comparing the last two Firestore records' `urine_output` and `timestamp`.

- [x] Changed label from `cc / hour` to `cc total` in `index.html`
- [ ] (Optional) Compute and display actual hourly rate on backend

---

### [BUG-7] `saveEEPROMData` silently resets urine output every hour

- **Files:** `models/ARDUINOCODE/ARDUINOCODE.ino:160-167`

**Problem:**  
`urine_output = 0` is set as a side effect inside `saveEEPROMData`, which runs every hour. This causes the urine output value on the dashboard to jump to 0 periodically without warning.

**Fix:**  
Remove the reset from `saveEEPROMData` — this function should only persist state, not reset it. If a periodic reset is intended, make it explicit and rename it:

```cpp
void saveEEPROMData() {
    // Do NOT reset urine_output here — only persist current state
    starting_catheter_bag_volume = catheter_bag_volume;
    saveToEEPROM(eeprom_start_address,     catheter_bag_volume);
    saveToEEPROM(eeprom_start_address + 4, urine_output);
    saveToEEPROM(eeprom_start_address + 8, starting_catheter_bag_volume);
}
```

- [x] Removed `urine_output = 0` side-effect from `saveEEPROMData` in `ARDUINOCODE.ino`

---

### [BUG-8] `deviceId` param accepted by frontend but ignored by backend

- **Files:** `public/js/api.js:15-16`, `api/data.py`

**Problem:**  
`API.fetchMonitoringData(deviceId)` appends `?device=...` to the URL, but `api/data.py` ignores query parameters entirely. Always returns the global latest record regardless of device.

**Fix:**  
Either remove the `deviceId` parameter from `api.js` (single-device system), or implement filtering in `api/data.py`:

```python
# In data.py do_GET, parse query string:
from urllib.parse import urlparse, parse_qs
parsed = urlparse(self.path)
params = parse_qs(parsed.query)
device_id = params.get("device", [None])[0]

query = collection.order_by("timestamp", direction=firestore.Query.DESCENDING)
if device_id:
    query = query.where("device_id", "==", device_id)
docs = query.limit(1).stream()
```

- [x] Implement device filtering in `api/data.py` — `?device=` query param now honoured
- [x] Implement device filtering in `app.py` data route

---

### [BUG-9] Flow rate calculation uses unbounded elapsed time

- **Files:** `models/ARDUINOCODE/ARDUINOCODE.ino:88-108`

**Problem:**  
`totalElapsedTime = millis() - startTime` grows indefinitely when there is no volume change (the `else` branch does not reset `startTime`). During low-flow periods, the denominator grows extremely large, making the reported rate near zero — even if flow was normal during the last interval.

**Fix:**  
Track elapsed time from the last calculation, not from the last significant change:

```cpp
void calculateUrineFlowRate(int current_bag_volume) {
    unsigned long now = millis();
    float elapsedMinutes = (now - lastFlowRateCalculationTime) / 60000.0;
    float volumeChange = current_bag_volume - previous_bag_volume;

    if (elapsedMinutes > 0 && abs(volumeChange) >= NOISE_THRESHOLD) {
        urine_flow_rate = volumeChange / elapsedMinutes;
        if (urine_flow_rate < 0) urine_flow_rate = 0;
        lastKnownFlowRate = urine_flow_rate;
        previous_bag_volume = current_bag_volume;
    } else if (abs(volumeChange) < NOISE_THRESHOLD) {
        urine_flow_rate = lastKnownFlowRate;
    }
}
```

Note: `startTime` and the separate elapsed-time tracking can be merged into `lastFlowRateCalculationTime` (already tracked in `loop()`).

- [x] Rewrote `calculateUrineFlowRate` in `ARDUINOCODE.ino` — uses constant `FLOW_RATE_DELAY_MS` interval

---

### [BUG-10] Hourly notification can be missed or skipped entirely

- **Files:** `public/js/notifications.js:126-141`

**Problem:**  
`checkHourlyNotification` fires only when `currentMinute === 0`. Since polling is every 5 seconds, a check is likely to hit minute 0, but if the tab is backgrounded (browser throttles timers) or an error occurs, the window is missed and the hourly notification is skipped for that hour.

**Fix:**  
Track the last notification time by Unix timestamp rather than hour number:

```js
checkHourlyNotification(data) {
    const now = Date.now();
    const oneHour = 3600000;
    if (now - this.state.lastHourlyNotificationTime >= oneHour) {
        const message = [
            `Predicted Time: ${data.predicted_time || 'N/A'}`,
            `Urine Output: ${data.urine_output} cc`,
            `Bag Volume: ${data.catheter_bag_volume} ml`,
            `Remaining: ${data.remaining_volume} ml`
        ].join('\n');
        this.send('INTELLICATH Hourly Update', message);
        this.state.lastHourlyNotificationTime = now;
    }
},
```

Update `state` initialization: `lastHourlyNotificationTime: 0`.

- [x] Replaced hour-based check with elapsed-time check in `notifications.js`
- [x] Updated `state` initial value — `lastHourlyNotificationTime: 0`

---

## Code Quality / Duplication

---

### [CQ-1] `get_firestore_client` and `save_data_to_firestore` duplicated in 3 files

- **Files:** `app.py`, `api/predict.py`, `api/data.py`

**Problem:**  
Identical (or near-identical) implementations of `get_firestore_client` and `save_data_to_firestore` exist in all three backend files. The two implementations already differ (`collection.document().set()` vs `collection.add()`), confirming they will drift further over time.

**Fix:**  
Create `api/db.py` as a shared module:

```python
# api/db.py
import os, json, logging
from google.cloud import firestore
from google.oauth2 import service_account

logger = logging.getLogger(__name__)
_firestore_client = None
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_firestore_client():
    global _firestore_client
    if _firestore_client is None:
        creds_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
        if creds_json:
            d = json.loads(creds_json)
            creds = service_account.Credentials.from_service_account_info(d)
            _firestore_client = firestore.Client(credentials=creds, project=d.get("project_id"))
        else:
            key_path = os.path.join(BASE_DIR, "serviceAccountKey.json")
            if os.path.exists(key_path):
                _firestore_client = firestore.Client.from_service_account_json(key_path)
            else:
                raise ValueError("Firebase credentials not found.")
    return _firestore_client

def save_data_to_firestore(data):
    # ... single canonical implementation using collection.add()
```

Then in `predict.py` and `data.py`: `from api.db import get_firestore_client, save_data_to_firestore`.

- [x] Created `api/db.py` with all canonical implementations
- [x] Removed duplicate code from `api/predict.py` — now imports from `api/db.py`
- [x] Removed duplicate code from `api/data.py` — now imports from `api/db.py`
- [x] `app.py` retains own implementation (uses `firebase_admin` SDK vs `google.cloud.firestore`)

---

### [CQ-2] `collection.document().set()` vs `collection.add()` inconsistency

- **Files:** `api/predict.py:64`, `app.py:151`

**Problem:**  
Both do auto-ID document creation, but the Vercel function uses `.document().set()` while the Flask app uses `.add()`. Addressed by CQ-1, but explicitly: pick `.add()` as the canonical form (it's more idiomatic).

- [x] Resolved as part of CQ-1 — `api/db.py` uses `.add()` canonically

---

## UI/UX

---

### [UX-1] No loading / skeleton state

- **Files:** `public/index.html`, `public/js/app.js`

**Problem:**  
While data is fetching, all values display `—` with no visual feedback that the app is loading. On slow connections this looks broken.

**Fix:**  
Add a subtle pulse animation class (`loading`) to stat elements during the fetch:

```js
// In App.fetchData, before API call:
document.querySelectorAll('.sc-value, .rstat-val, .readout-number')
    .forEach(el => el.classList.add('loading'));

// After data arrives or error:
document.querySelectorAll('.loading').forEach(el => el.classList.remove('loading'));
```

```css
.loading { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
```

- [x] Added `.loading` CSS keyframe animation to `index.html` inline styles
- [x] `UI.setLoading(on)` toggles class; called from `App.init()` and `UI._clearLoading()` on data arrival

---

### [UX-2] No stale data warning

- **Files:** `public/js/app.js`, `public/js/ui.js`

**Problem:**  
When the ESP32 goes offline, the dashboard continues displaying the last received values without any staleness indicator. A nurse could act on hours-old data believing it is current.

**Fix:**  
Store the last successful fetch timestamp and compare on each tick:

```js
// In App, track:
lastSuccessfulFetch: null,

// After successful UI update:
this.lastSuccessfulFetch = Date.now();

// In UI._tick(), add staleness check:
if (App.lastSuccessfulFetch) {
    const ageMs = Date.now() - App.lastSuccessfulFetch;
    const stale = ageMs > 30000; // > 30 seconds
    document.getElementById('timestamp').classList.toggle('stale', stale);
    if (stale) {
        const mins = Math.floor(ageMs / 60000);
        document.getElementById('timestamp').textContent = `Last data ${mins}m ago`;
    }
}
```

Add `.stale { color: var(--warn); }` to CSS.

- [x] Track `App.lastFetchSuccess` timestamp in `app.js`
- [x] Staleness check in `UI._tick()` — shows "Last data Xm ago" and `.stale` colour after 30s
- [x] Added `.ts-value.stale` CSS rule to `index.html`

---

### [UX-3] Toast close button is inaccessible

- **Files:** `public/index.html:848`

**Problem:**  
The `✕` close button has no `aria-label`, so screen readers announce it as "close button ✕" or just "✕ button" which is not descriptive.

**Fix:**  
Resolved as part of SEC-10 (DOM API rewrite adds `aria-label="Dismiss notification"`).

- [x] Confirmed covered by SEC-10

---

### [UX-4] Sidebar toggle missing `aria-expanded`

- **Files:** `public/index.html` (sidebar toggle button)

**Problem:**  
The `#sidebarToggle` button collapses/expands the sidebar but does not update `aria-expanded`, so assistive technology users cannot determine sidebar state.

**Fix:**  
```js
// In App.toggleSidebar():
btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
```

Initialize with `aria-expanded="true"` on the button element in HTML.

- [x] Added `aria-expanded="true"` and `aria-controls="sidebar"` to `#sidebarToggle` in HTML
- [x] `App.toggleSidebar()` updates `aria-expanded` on every toggle

---

### [UX-5] Patient info is static placeholder

- **Files:** `public/index.html` (sidebar patient section)

**Problem:**  
The sidebar shows hardcoded patient name, room number, and admission date. For actual clinical deployment these must be dynamic and should never show the wrong patient's data.

**Fix:**  
Short-term: Add a prominent `<!-- PLACEHOLDER: replace with dynamic patient data -->` comment and document that this must be wired to a real data source before clinical use.  
Long-term: Accept patient data as URL query parameters (e.g., `?patient=Jane+Doe&room=ICU-3`) and render them from JavaScript, keeping no patient data hard-coded.

- [x] Added `<!-- UX-5 PLACEHOLDER -->` comment to patient info section in `index.html`
- [x] Static Ward/Attending values replaced with `id`-ed elements (`sidebarWard`, `sidebarAttending`) ready for dynamic population
- [ ] (Long-term) Implement query param or auth-gated patient data

---

## Completion Checklist Summary

| ID | Severity | Status | Notes |
|----|----------|--------|-------|
| SEC-1 | Critical | ✅ Done | Backend + Arduino; frontend key injection still needed |
| SEC-2 | Critical | ✅ Done | Hashes in `.env.example`; set in Vercel env vars |
| SEC-3 | Critical | ✅ Done | Generic 500 messages; full trace logged server-side |
| SEC-4 | Critical | ✅ Done | `validate_sensor_data` with type + range checks |
| SEC-5 | Critical | ✅ Done | `FLASK_DEBUG` defaults to `False` |
| SEC-6 | High | ✅ Done | Covered by SEC-4 validation |
| SEC-7 | High | ✅ Done | Per-IP in-process rate limit; Vercel edge limit optional |
| SEC-8 | High | ✅ Done | `X-Api-Key` + `X-Device-Id` headers in Arduino |
| SEC-9 | High | ✅ Done | `WiFiClientSecure` + ISRG Root X1 CA cert |
| SEC-10 | Medium | ✅ Done | DOM API toast — no innerHTML |
| SEC-11 | Medium | ✅ Done | `get_model()` singleton in `api/db.py` and `app.py` |
| SEC-12 | Medium | ⏳ Manual | Requires Google Cloud Console action |
| BUG-1 | Functional | ✅ Done | `_getStatusConfig` accepts `warnThresholdMl` |
| BUG-2 | Functional | ✅ Done | `CRITICAL_THRESHOLD = 700` |
| BUG-3 | Functional | ✅ Done | Non-functional inputs removed; info note shown |
| BUG-4 | Functional | ✅ Done | Signal shows `ONLINE`/`OFFLINE` from fetch state |
| BUG-5 | Functional | ✅ Done | `localStorage` persistence; sidebar inputs synced |
| BUG-6 | Functional | ✅ Done | Label changed to `cc total` |
| BUG-7 | Functional | ✅ Done | `saveEEPROMData` no longer resets `urine_output` |
| BUG-8 | Functional | ✅ Done | `?device=` query param now filtered in both routes |
| BUG-9 | Functional | ✅ Done | Flow rate uses fixed `FLOW_RATE_DELAY_MS` interval |
| BUG-10 | Functional | ✅ Done | Elapsed-time hourly notification |
| CQ-1 | Quality | ✅ Done | `api/db.py` shared module created |
| CQ-2 | Quality | ✅ Done | Canonical `.add()` in `api/db.py` |
| UX-1 | UX | ✅ Done | `.loading` pulse animation |
| UX-2 | UX | ✅ Done | Stale data warning after 30s |
| UX-3 | UX | ✅ Done | `aria-label` on toast close button |
| UX-4 | UX | ✅ Done | `aria-expanded` on sidebar toggle |
| UX-5 | UX | ✅ Done | Static values replaced with `id`-ed placeholders |

---

*Last updated: 2026-05-21 — Implementation complete*
