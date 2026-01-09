/**
 * INTELLICATH - Configuration
 * Application constants and settings
 */

const CONFIG = {
    // API endpoints
    API: {
        DATA: '/api/data',
        PREDICT: '/api/predict'
    },

    // Catheter bag settings
    BAG: {
        MAX_CAPACITY: 800,          // ml
        WARNING_THRESHOLD: 600,      // ml - show warning
        CRITICAL_THRESHOLD: 800,     // ml - show critical alert
        WARNING_PERCENT: 75,         // percentage for warning color
        CRITICAL_PERCENT: 87.5       // percentage for critical color
    },

    // Timing settings (in milliseconds)
    TIMING: {
        REFRESH_INTERVAL: 5000,              // 5 seconds
        NO_OUTPUT_ALERT_INTERVAL: 1800000,   // 30 minutes
        FULL_BAG_ALERT_INTERVAL: 60000       // 1 minute
    },

    // Status types
    STATUS: {
        NORMAL: 'normal',
        WARNING: 'warning',
        CRITICAL: 'critical',
        ATTENTION: 'attention'
    },

    // Theme settings
    THEMES: {
        DARK: 'dark',
        LIGHT: 'light'
    }
};

// Freeze config to prevent modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.API);
Object.freeze(CONFIG.BAG);
Object.freeze(CONFIG.TIMING);
Object.freeze(CONFIG.STATUS);
Object.freeze(CONFIG.THEMES);
