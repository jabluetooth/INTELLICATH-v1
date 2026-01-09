# INTELLICATH
## OVERVIEW
INTELLICATH is an intelligent catheter bag monitoring system designed to prevent **Catheter-Associated Urinary Tract Infections (CAUTI)** by using **real-time data collection, predictive analytics, and machine learning**.
This project integrates **sensor-based monitoring, data analysis, and web-based visualization** to help healthcare professionals manage catheter usage efficiently.

---

## FEATURES
- **Real-Time Monitoring** - Uses **ESP32 & Load Cell Sensors** to track fluid levels in catheter bags.
- **Predictive Analytics** - Implements **Decision Tree Regression** to estimate when the catheter bag will reach full capacity.
- **Web-Based Dashboard** - Built with **HTML, CSS, JavaScript** for real-time data visualization.
- **Serverless API** - Uses **Python serverless functions** deployed on **Vercel** with **Firebase Firestore**.
- **Alerts & Notifications** - Provides **early warnings** to reduce infection risks.

---

## TECH STACK
- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Python Serverless Functions (Vercel)
- **Database:** Firebase Firestore
- **Hardware:** ESP32, Load Cell Sensor (HX711)
- **Machine Learning:** Decision Tree Regression, NumPy, Scikit-learn
- **Deployment:** Vercel

---

## PROJECT STRUCTURE
```
INTELLICATH/
├── api/
│   ├── predict.py           # POST /api/predict - ML predictions
│   └── data.py              # GET /api/data - fetch latest data
├── public/
│   └── index.html           # Web dashboard
├── models/
│   ├── ARDUINOCODE/         # ESP32 sensor code
│   │   ├── ARDUINOCODE.ino  # Main Arduino sketch
│   │   └── config.h.example # Config template
│   ├── decision_tree.pkl    # Active ML model
│   └── scaler.pkl           # Feature scaler
├── _archive/                # Archived files (gitignored)
├── vercel.json              # Vercel configuration
├── requirements.txt         # Python dependencies
├── .env.example             # Environment template
├── .gitignore               # Git ignore rules
├── app.py                   # Local development server
└── README.md                # This file
```

---

## DEPLOYMENT (Vercel + Firebase)

### Step 1: Firebase Setup

1. **Create a Firebase project:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Click "Add project" and follow the setup wizard

2. **Enable Firestore:**
   - In Firebase Console, go to "Firestore Database"
   - Click "Create database"
   - Choose "Start in production mode"
   - Select your preferred region

3. **Create Firestore Index:**
   - Go to Firestore > Indexes
   - Add a composite index for the `intellicath_data` collection:
     - Field: `timestamp` (Descending)

4. **Generate Service Account Key:**
   - Go to Project Settings > Service Accounts
   - Click "Generate new private key"
   - Save the JSON file (keep it secure!)

### Step 2: Deploy to Vercel

1. **Push code to GitHub**

2. **Import to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository

3. **Add Environment Variable:**
   - In Vercel project settings, go to "Environment Variables"
   - Add variable:
     - Name: `FIREBASE_SERVICE_ACCOUNT`
     - Value: Paste the entire contents of your service account JSON file as a single line

4. **Deploy!**

### Step 3: Update ESP32 Configuration

Update `models/ARDUINOCODE/config.h` with your Vercel URL:
```cpp
const char* serverURL = "https://your-project.vercel.app/api/predict";
```

---

## LOCAL DEVELOPMENT

### Prerequisites
- **Python 3.9+**
- **Firebase Project** (with Firestore enabled)
- **ESP32 Development Board** (for hardware integration)

### Setup

```bash
# Clone repository
git clone <repository-url>
cd INTELLICATH

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt
pip install flask flask-cors python-dotenv

# Add Firebase credentials
# Download serviceAccountKey.json from Firebase Console
# Place it in the project root directory

# Run server
python app.py
```

Server runs at: `http://localhost:5001`

---

## API ENDPOINTS

### `POST /api/predict`
Receives sensor data and returns ML prediction.

**Request:**
```json
{
  "urine_output": 50.0,
  "urine_flow_rate": 0.83,
  "catheter_bag_volume": 200.0,
  "remaining_volume": 600.0
}
```

**Response:**
```json
{
  "status": "success",
  "predicted_time": "12 hours and 05 minutes",
  "actual_time": null
}
```

### `GET /api/data`
Fetch latest monitoring data from Firestore.

**Response:**
```json
{
  "id": "abc123",
  "urine_output": 50.0,
  "urine_flow_rate": 0.83,
  "catheter_bag_volume": 200.0,
  "remaining_volume": 600.0,
  "predicted_time": "12 hours and 05 minutes",
  "actual_time": null,
  "timestamp": "2025-01-09 10:30:00"
}
```

---

## FIRESTORE DATA STRUCTURE

**Collection:** `intellicath_data`

**Document Fields:**
| Field | Type | Description |
|-------|------|-------------|
| urine_output | number | Current urine output (ml) |
| urine_flow_rate | number | Flow rate (ml/min) |
| catheter_bag_volume | number | Current bag volume (ml) |
| remaining_volume | number | Remaining capacity (ml) |
| predicted_time | string | Time until full |
| actual_time | string | Actual time when full (if applicable) |
| timestamp | timestamp | Server timestamp |

---

## HARDWARE SETUP

### ESP32 Configuration

1. **Copy configuration template:**
```bash
cd models/ARDUINOCODE
cp config.h.example config.h
```

2. **Edit `config.h`:**
```cpp
// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server Configuration (use your Vercel URL)
const char* serverURL = "https://your-project.vercel.app/api/predict";
```

3. **Upload to ESP32:**
   - Open `ARDUINOCODE.ino` in Arduino IDE
   - Install HX711 library
   - Select ESP32 board
   - Wire load cell: DT → GPIO 4, SCK → GPIO 16
   - Upload code

---

## MACHINE LEARNING MODEL

- **Algorithm:** Decision Tree Regression
- **Features:** `remaining_volume`, `urine_flow_rate`
- **Target:** Time until bag reaches 800ml (in minutes)
- **Files:** `models/decision_tree.pkl`, `models/scaler.pkl`

---

## ARCHITECTURE
1. **Sensor Module:** ESP32 captures weight data from catheter bags via load cell.
2. **Data Processing:** Serverless API processes and stores data in Firebase Firestore.
3. **Prediction Model:** Decision Tree algorithm estimates time to full capacity.
4. **Dashboard:** Web-based UI updates healthcare workers in real-time.
5. **Alert System:** Triggers notifications when capacity thresholds are reached.

---

## TROUBLESHOOTING

### Firebase Connection Issues
- Verify service account JSON is valid
- Check Firestore rules allow read/write access
- Ensure the `timestamp` index exists

### Vercel Deployment Issues
- Check environment variable is set correctly (single line JSON)
- View function logs in Vercel dashboard
- Verify requirements.txt includes all dependencies

---

## CONTRIBUTING
Contributions are welcome! Please ensure:
- Code follows PEP 8 style guidelines
- Environment variables are used for configuration
- No sensitive data is committed

---

## LICENSE
[Add your license information here]
