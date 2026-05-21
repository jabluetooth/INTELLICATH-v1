const CONFIG = {
    API: {
        DATA:    '/api/data',
        PREDICT: '/api/predict'
    },

    BAG: {
        MAX_CAPACITY:       800,
        // Notification fires at 700 mL (87.5%) to match the UI critical visual state (BUG-2)
        CRITICAL_THRESHOLD: 700,
        WARNING_PERCENT:    75,
        CRITICAL_PERCENT:   87.5
    },

    TIMING: {
        REFRESH_INTERVAL:           5000,
        NO_OUTPUT_ALERT_INTERVAL:   1800000,  // 30 min
        FULL_BAG_ALERT_INTERVAL:    60000     // 1 min debounce on critical notification
    },

    STATUS: {
        NORMAL:    'normal',
        WARNING:   'warning',
        CRITICAL:  'critical',
        ATTENTION: 'attention'
    },

    THEMES: {
        DARK:  'dark',
        LIGHT: 'light'
    }
};

Object.freeze(CONFIG);
Object.freeze(CONFIG.API);
Object.freeze(CONFIG.BAG);
Object.freeze(CONFIG.TIMING);
Object.freeze(CONFIG.STATUS);
Object.freeze(CONFIG.THEMES);
