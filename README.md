# INTELLICATH
## OVERVIEW  
INTELLICATH is an intelligent catheter bag monitoring system designed to prevent **Catheter-Associated Urinary Tract Infections (CAUTI)** by using **real-time data collection, predictive analytics, and machine learning**.  
This project integrates **sensor-based monitoring, data analysis, and web-based visualization** to help healthcare professionals manage catheter usage efficiently.  

---

## FEATURES  
✅ **Real-Time Monitoring** – Uses **ESP32 & Load Cell Sensors** to track fluid levels in catheter bags.  
✅ **Predictive Analytics** – Implements **Multiple Linear Regression (MLR)** to estimate when the catheter bag will reach full capacity.  
✅ **Web-Based Dashboard** – Built with **HTML, CSS, JavaScript** for real-time data visualization.  
✅ **Backend API** – Uses **Flask & SQL** to manage sensor data and communicate with the front end.  
✅ **Alerts & Notifications** – Provides **early warnings** to reduce infection risks.  

---

## TECH STACK  
🔹 **Frontend:** HTML, CSS, JavaScript  
🔹 **Backend:** Flask (**Python**), RESTful API  
🔹 **Database:** SQL (**MySQL/PostgreSQL**)  
🔹 **Hardware:** **ESP32, Load Cell Sensor**  
🔹 **Machine Learning:** **Multiple Linear Regression (MLR), NumPy, Pandas, Scikit-learn**  
🔹 **Development Tools:** **VSCode, Postman, Jupyter Notebook**  

---

## ARCHITECTURE  
1️⃣ **Sensor Module:** Captures weight data from catheter bags.  
2️⃣ **Data Processing:** **Flask API** processes and stores data in a **SQL database**.  
3️⃣ **Prediction Model:** **MLR algorithm** estimates the **time to full capacity**.  
4️⃣ **Dashboard Visualization:** **Web-based UI** updates healthcare workers **in real-time**.  
5️⃣ **Alert System:** **Triggers notifications** when capacity thresholds are reached.  
