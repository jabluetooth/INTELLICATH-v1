/**
 * INTELLICATH - Main Application
 * Entry point that initializes and coordinates all modules
 */

const App = {
    // Refresh interval ID
    refreshInterval: null,

    // Current device ID
    currentDeviceId: null,

    // Saved devices
    devices: [],

    // Storage key
    STORAGE_KEY: 'intellicath-devices',

    /**
     * Initialize the application
     */
    async init() {
        console.log('INTELLICATH initializing...');

        // Initialize modules
        Theme.init();
        UI.init();
        await Notifications.init();

        // Set initial status
        UI.setConnectionStatus('waiting');

        // Load saved devices
        this.loadDevices();

        // Check for device in URL
        const urlParams = new URLSearchParams(window.location.search);
        const deviceParam = urlParams.get('device');
        if (deviceParam) {
            this.currentDeviceId = deviceParam;
        } else if (this.devices.length > 0) {
            this.currentDeviceId = this.devices[0].deviceId;
        }

        // Fetch initial data
        await this.fetchData();

        // Start auto-refresh
        this.startAutoRefresh();

        console.log('INTELLICATH initialized successfully');
    },

    /**
     * Fetch monitoring data and update UI
     */
    async fetchData() {
        try {
            const data = await API.fetchMonitoringData(this.currentDeviceId);

            if (data.status === 'no_data') {
                UI.showError('No monitoring data available yet. Connect your ESP32 device to start monitoring.');
                UI.setConnectionStatus('no_data');
                return;
            }

            if (data.status === 'error') {
                UI.showError(data.message || 'Failed to fetch data');
                UI.setConnectionStatus('offline');
                return;
            }

            // Update UI and process notifications
            UI.update(data);
            UI.setConnectionStatus('live');
            Notifications.process(data);

        } catch (error) {
            console.error('Error fetching data:', error);
            UI.showError(error.message);
            UI.setConnectionStatus('offline');
        }
    },

    /**
     * Start auto-refresh interval
     */
    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        this.refreshInterval = setInterval(
            () => this.fetchData(),
            CONFIG.TIMING.REFRESH_INTERVAL
        );
    },

    /**
     * Stop auto-refresh interval
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    },

    /**
     * Manual refresh trigger
     */
    refresh() {
        this.fetchData();
    },

    /**
     * Toggle theme
     */
    toggleTheme() {
        Theme.toggle();
    },

    /**
     * Load devices from localStorage
     */
    loadDevices() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        this.devices = stored ? JSON.parse(stored) : [];
    },

    /**
     * Save devices to localStorage
     */
    saveDevices() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.devices));
    },

    /**
     * Add a new device
     */
    addDevice(device) {
        const newDevice = {
            id: Date.now().toString(),
            deviceId: device.deviceId,
            name: device.name || device.deviceId,
            patientId: device.patientId || '',
            createdAt: new Date().toISOString()
        };

        this.devices.push(newDevice);
        this.saveDevices();
        this.renderDevicesList();

        return newDevice;
    },

    /**
     * Remove a device
     */
    removeDevice(id) {
        this.devices = this.devices.filter(d => d.id !== id);
        this.saveDevices();
        this.renderDevicesList();
    },

    /**
     * Switch to a device
     */
    switchDevice(deviceId) {
        this.currentDeviceId = deviceId;
        this.fetchData();
        this.closeDeviceModal();
    },

    /**
     * Render saved devices list in modal
     */
    renderDevicesList() {
        const listEl = document.getElementById('savedDevicesList');
        const countEl = document.getElementById('deviceCount');

        if (!listEl) return;

        countEl.textContent = `${this.devices.length} device${this.devices.length !== 1 ? 's' : ''}`;

        if (this.devices.length === 0) {
            listEl.innerHTML = '<p class="text-sm opacity-50 text-center py-4">No saved devices</p>';
            return;
        }

        listEl.innerHTML = this.devices.map(device => `
            <div class="flex items-center justify-between bg-base-200 rounded-lg p-3 animate-fade-in">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        <i class="fas fa-microchip text-primary"></i>
                    </div>
                    <div>
                        <p class="font-medium text-sm">${device.name}</p>
                        <p class="text-xs opacity-60">${device.deviceId}</p>
                    </div>
                </div>
                <div class="flex gap-1">
                    <button onclick="App.switchDevice('${device.deviceId}')" class="btn btn-ghost btn-xs btn-circle" title="Connect">
                        <i class="fas fa-plug"></i>
                    </button>
                    <button onclick="App.removeDevice('${device.id}')" class="btn btn-ghost btn-xs btn-circle text-error" title="Remove">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Open device modal
     */
    openDeviceModal() {
        this.renderDevicesList();
        document.getElementById('deviceModal').showModal();
    },

    /**
     * Close device modal
     */
    closeDeviceModal() {
        document.getElementById('deviceModal').close();
    },

    /**
     * Save device from form
     */
    saveDevice() {
        const deviceId = document.getElementById('deviceIdInput').value.trim();
        const deviceName = document.getElementById('deviceNameInput').value.trim();
        const patientId = document.getElementById('patientIdInput').value.trim();

        if (!deviceId) {
            alert('Please enter a Device ID');
            return;
        }

        // Check if device already exists
        if (this.devices.some(d => d.deviceId === deviceId)) {
            alert('A device with this ID already exists');
            return;
        }

        this.addDevice({
            deviceId,
            name: deviceName || deviceId,
            patientId
        });

        // Clear form
        document.getElementById('deviceIdInput').value = '';
        document.getElementById('deviceNameInput').value = '';
        document.getElementById('patientIdInput').value = '';

        // Set as current device and fetch data
        this.currentDeviceId = deviceId;
        this.fetchData();
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Expose necessary functions globally for HTML onclick handlers
window.toggleTheme = () => App.toggleTheme();
window.fetchMonitoringData = () => App.refresh();
window.openDeviceModal = () => App.openDeviceModal();
window.closeDeviceModal = () => App.closeDeviceModal();
window.saveDevice = () => App.saveDevice();
