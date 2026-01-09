/**
 * INTELLICATH - API Module
 * Handles all API communications
 */

const API = {
    /**
     * Fetch the latest monitoring data from the server
     * @param {string} deviceId - Optional device ID to fetch data for
     * @returns {Promise<Object>} Monitoring data
     * @throws {Error} If request fails or data is invalid
     */
    async fetchMonitoringData(deviceId = null) {
        let url = CONFIG.API.DATA;
        if (deviceId) {
            url += `?device=${encodeURIComponent(deviceId)}`;
        }
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();

        if (!data) {
            throw new Error('No data received from server');
        }

        if (data.status === 'error') {
            throw new Error(data.message || 'Server returned an error');
        }

        return data;
    },

    /**
     * Send prediction request to the server
     * @param {Object} sensorData - Sensor data to send
     * @returns {Promise<Object>} Prediction response
     */
    async sendPrediction(sensorData) {
        const response = await fetch(CONFIG.API.PREDICT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sensorData)
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        return await response.json();
    }
};
