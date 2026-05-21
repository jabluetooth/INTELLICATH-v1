const API = {
    _headers() {
        const h = {};
        if (window.__API_KEY__) h['X-Api-Key'] = window.__API_KEY__;
        return h;
    },

    async fetchMonitoringData(deviceId = null) {
        let url = CONFIG.API.DATA;
        if (deviceId) url += `?device=${encodeURIComponent(deviceId)}`;

        const response = await fetch(url, { headers: this._headers() });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const data = await response.json();
        if (!data) throw new Error('No data received from server');
        if (data.status === 'error') throw new Error(data.message || 'Server returned an error');

        return data;
    },

    async sendPrediction(sensorData) {
        const response = await fetch(CONFIG.API.PREDICT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this._headers() },
            body: JSON.stringify(sensorData)
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        return await response.json();
    }
};
