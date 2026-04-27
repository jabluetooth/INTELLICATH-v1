const App = {
    refreshInterval: null,

    settings: {
        urineAlert:   true,
        bagAlert:     true,
        hourlyAlert:  true,
        blockageAlert:true,
        warnThreshold:640,
        refreshSecs:  5,
    },

    async init() {
        UI.init();
        await Notifications.init();
        UI.setConnectionStatus('waiting');
        await this.fetchData();
        this.startAutoRefresh();
    },

    async fetchData() {
        try {
            const data = await API.fetchMonitoringData();

            if (data.status === 'no_data') {
                UI.showError('No monitoring data available yet. Connect your ESP32 device to start monitoring.');
                UI.setConnectionStatus('no_data');
                return;
            }

            UI.update(data);
            UI.setConnectionStatus('live');

            if (this.settings.bagAlert || this.settings.urineAlert ||
                this.settings.hourlyAlert || this.settings.blockageAlert) {
                Notifications.process(data);
            }

        } catch (error) {
            console.error('Error fetching data:', error);
            UI.showError(error.message);
            UI.setConnectionStatus('offline');
        }
    },

    startAutoRefresh() {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        this.refreshInterval = setInterval(() => this.fetchData(), this.settings.refreshSecs * 1000);
    },

    toggleSetting(key, val) {
        this.settings[key] = val;
    },

    updateThreshold(val) {
        this.settings.warnThreshold = parseInt(val);
    },

    updateRefresh(val) {
        this.settings.refreshSecs = Math.max(1, parseInt(val));
        this.startAutoRefresh();
    },

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const btn = document.getElementById('sidebarToggle');
        const isCollapsed = sidebar.classList.toggle('collapsed');
        btn.classList.toggle('collapsed', isCollapsed);
        document.body.classList.toggle('sidebar-collapsed', isCollapsed);
        btn.innerHTML = isCollapsed ? '&#8614;' : '&#8612;';
        btn.title = isCollapsed ? 'Open sidebar' : 'Close sidebar';
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());

window.fetchMonitoringData = () => App.fetchData();
