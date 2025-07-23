import ssl
import pickle
import pymysql
import numpy as np
import math
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import pandas as pd
from datetime import datetime
import os
import joblib
import numpy as np
from datetime import datetime


app = Flask(__name__)
CORS(app)

MAX_PREDICTION_TIME = int(os.getenv("MAX_PREDICTION_TIME", 12 * 60)) 

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "",
    "database": "intellicath",
    "cursorclass": pymysql.cursors.DictCursor
}

def get_db_connection():
    """Establish a MySQL database connection."""
    try:
        return pymysql.connect(**DB_CONFIG) 
    except pymysql.MySQLError as e:
        print(f"[ERROR] Database Connection Failed: {e}")
        return None

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/predict-post", methods=["POST"])
def predict():
    """Receives data, processes it, and stores predictions in MySQL."""
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
        print(f"Predicted Time (HH:MM): {predicted_time}")

        save_data_to_db({
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
        print(f"[ERROR] Prediction Error: {e}")
        return jsonify({"error": str(e)}), 500

    
def save_data_to_db(data):
    """Saves the latest data to MySQL if there is a change in values greater than 2ml."""
    try:
        connection = get_db_connection()
        if connection is None:
            return

        with connection.cursor() as cursor:
            last_query = "SELECT * FROM intellicath_data ORDER BY id DESC LIMIT 1"
            cursor.execute(last_query)
            last_entry = cursor.fetchone()

            if last_entry:
                if abs(last_entry["urine_output"] - data["urine_output"]) <= 2 and \
                   abs(last_entry["urine_flow_rate"] - data["urine_flow_rate"]) <= 0.1 and \
                   abs(last_entry["catheter_bag_volume"] - data["catheter_bag_volume"]) <= 2:
                    print("[INFO] No significant change in data. Skipping insert.")
                    return

            sql = """
            INSERT INTO intellicath_data (urine_output, urine_flow_rate, catheter_bag_volume, remaining_volume, predicted_time, actual_time)
            VALUES (%s, %s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (
                data["urine_output"], 
                data["urine_flow_rate"], 
                data["catheter_bag_volume"], 
                data["remaining_volume"], 
                data["predicted_time"],
                data["actual_time"]  
            ))
            connection.commit()
            print("Data inserted into database successfully.")

        connection.close()

    except pymysql.MySQLError as e:
        print(f"[ERROR] MySQL Insert Failed: {e}")

def get_actual_time_from_db():
    """Retrieve the first recorded timestamp when the bag reached 800ml."""
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT actual_time FROM intellicath_data
                WHERE catheter_bag_volume >= 800
                ORDER BY actual_time ASC LIMIT 1
            """)
            result = cursor.fetchone()
            return result["actual_time"] if result else None
    except pymysql.MySQLError as e:
        print(f"[ERROR] Failed to fetch actual_time: {e}")
        return None
    finally:
        connection.close()

def store_actual_time_in_db(timestamp):
    """Store the first timestamp when the bag reaches 800ml."""
    connection = get_db_connection()
    if connection is None:
        return
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                INSERT INTO intellicath_data (catheter_bag_volume, actual_time)
                VALUES (%s, %s)
            """, (800, timestamp))
            connection.commit()
            print("First recorded time when bag reached 800ml:", timestamp)
    except pymysql.MySQLError as e:
        print(f"[ERROR] Failed to store actual_time: {e}")
    finally:
        connection.close()

if __name__ == "__main__":
    context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    context.load_cert_chain(certfile="localhost.pem", keyfile="localhost-key.pem")
    app.run(debug=True, host="0.0.0.0", port=5001, ssl_context=context)
