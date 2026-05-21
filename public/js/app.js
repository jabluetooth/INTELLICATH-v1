const App = {
    refreshInterval: null,
    lastFetchSuccess: null,
    _errorState: false,       // true while in a persistent error — prevents toast spam

    // Defaults — overridden by _loadSettings on init (BUG-5)
    settings: {
        urineAlert:    true,
        bagAlert:      true,
        hourlyAlert:   true,
        blockageAlert: true,
        warnThreshold: 640,
        refreshSecs:   5,
    },

    async init() {
        this._loadSettings();
        UI.init();
        await Notifications.init();
        UI.setConnectionStatus('waiting');
        UI.setLoading(true);
        this._syncSidebarInputs();
        await this.fetchData();
        this.startAutoRefresh();
    },

    async fetchData() {
        try {
            const data = await API.fetchMonitoringData();

            if (data.status === 'no_data') {
                // Only show once — not on every poll tick
                if (!this._errorState) {
                    this._errorState = true;
                    UI.showError('No monitoring data available yet. Connect your ESP32 device to start monitoring.');
                }
                UI.setConnectionStatus('no_data');
                return;
            }

            // Recovered — clear error state
            this._errorState = false;
            this.lastFetchSuccess = Date.now();
            UI.update(data);
            UI.setConnectionStatus('live');

            if (this.settings.bagAlert || this.settings.urineAlert ||
                this.settings.hourlyAlert || this.settings.blockageAlert) {
                Notifications.process(data);
            }

        } catch (error) {
            console.error('Error fetching data:', error);
            // Only toast on the first failure — stay silent while already in error state
            if (!this._errorState) {
                this._errorState = true;
                UI.showError(error.message);
            }
            UI.setConnectionStatus('offline');
        }
    },

    startAutoRefresh() {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        this.refreshInterval = setInterval(() => this.fetchData(), this.settings.refreshSecs * 1000);
    },

    toggleSetting(key, val) {
        this.settings[key] = val;
        this._saveSettings();
    },

    updateThreshold(val) {
        this.settings.warnThreshold = parseInt(val) || 640;
        this._saveSettings();
    },

    updateRefresh(val) {
        this.settings.refreshSecs = Math.max(1, parseInt(val) || 5);
        this._saveSettings();
        this.startAutoRefresh();
    },

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const btn     = document.getElementById('sidebarToggle');
        const isCollapsed = sidebar.classList.toggle('collapsed');
        btn.classList.toggle('collapsed', isCollapsed);
        document.body.classList.toggle('sidebar-collapsed', isCollapsed);
        btn.innerHTML = isCollapsed ? '&#8614;' : '&#8612;';
        btn.title     = isCollapsed ? 'Open sidebar' : 'Close sidebar';
        // UX-4: keep aria-expanded in sync
        btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    },

    // ── Settings persistence (BUG-5) ──────────────────────────────────────────

    _loadSettings() {
        try {
            const saved = localStorage.getItem('intellicath_settings');
            if (saved) Object.assign(this.settings, JSON.parse(saved));
        } catch (e) {
            // corrupted storage — silently use defaults
        }
    },

    _saveSettings() {
        try {
            localStorage.setItem('intellicath_settings', JSON.stringify(this.settings));
        } catch (e) {}
    },

    // Sync sidebar inputs to whatever was loaded from storage
    _syncSidebarInputs() {
        const thresholdEl = document.querySelector('.threshold-input[onchange*="updateThreshold"]');
        const refreshEl   = document.querySelector('.threshold-input[onchange*="updateRefresh"]');
        if (thresholdEl) thresholdEl.value = this.settings.warnThreshold;
        if (refreshEl)   refreshEl.value   = this.settings.refreshSecs;

        const toggleMap = {
            urineAlert:    0,
            bagAlert:      1,
            hourlyAlert:   2,
            blockageAlert: 3,
        };
        const checkboxes = document.querySelectorAll('.toggle-switch input[type="checkbox"]');
        Object.entries(toggleMap).forEach(([key, idx]) => {
            if (checkboxes[idx]) checkboxes[idx].checked = this.settings[key];
        });
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());

window.fetchMonitoringData = () => App.fetchData();
