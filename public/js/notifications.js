/**
 * INTELLICATH - Notifications Module
 * Handles browser notifications
 */

const Notifications = {
    // State tracking
    state: {
        previousUrineOutput: null,
        lastNoUrineOutputTime: 0,
        lastCatheterFullTime: 0,
        lastNotificationHour: -1
    },

    /**
     * Initialize notifications by requesting permission
     */
    async init() {
        if ('Notification' in window && Notification.permission !== 'granted') {
            await Notification.requestPermission();
        }
    },

    /**
     * Check if notifications are permitted
     * @returns {boolean} True if notifications are allowed
     */
    isPermitted() {
        return 'Notification' in window && Notification.permission === 'granted';
    },

    /**
     * Send a browser notification
     * @param {string} title - Notification title
     * @param {string} body - Notification body
     * @param {Object} options - Additional notification options
     */
    send(title, body, options = {}) {
        if (!this.isPermitted()) {
            console.log('Notification permission not granted');
            return;
        }

        new Notification(title, {
            body,
            icon: '/favicon.ico',
            ...options
        });
    },

    /**
     * Process data and send appropriate notifications
     * @param {Object} data - Monitoring data
     */
    process(data) {
        const currentTime = Date.now();

        // Check for urine output changes
        this.checkUrineOutputChange(data);

        // Check for no urine output
        this.checkNoUrineOutput(data, currentTime);

        // Check for full bag
        this.checkFullBag(data, currentTime);

        // Check for hourly notification
        this.checkHourlyNotification(data);
    },

    /**
     * Check if urine output has changed and notify
     * @param {Object} data - Monitoring data
     */
    checkUrineOutputChange(data) {
        if (this.state.previousUrineOutput !== null &&
            this.state.previousUrineOutput !== data.urine_output) {
            this.send(
                'INTELLICATH Alert',
                `Urine Output: ${data.urine_output} cc\nCatheter Bag Volume: ${data.catheter_bag_volume} ml`
            );
        }
        this.state.previousUrineOutput = data.urine_output;
    },

    /**
     * Check for no urine output condition
     * @param {Object} data - Monitoring data
     * @param {number} currentTime - Current timestamp
     */
    checkNoUrineOutput(data, currentTime) {
        const noOutput = data.urine_output === 0 || data.urine_output === null;
        const intervalPassed = currentTime - this.state.lastNoUrineOutputTime >= CONFIG.TIMING.NO_OUTPUT_ALERT_INTERVAL;

        if (noOutput && intervalPassed) {
            this.send(
                'INTELLICATH Warning',
                'No urine output detected. Check for catheter blockages.'
            );
            this.state.lastNoUrineOutputTime = currentTime;
        }
    },

    /**
     * Check if bag is full and notify
     * @param {Object} data - Monitoring data
     * @param {number} currentTime - Current timestamp
     */
    checkFullBag(data, currentTime) {
        const isFull = data.catheter_bag_volume >= CONFIG.BAG.CRITICAL_THRESHOLD;
        const intervalPassed = currentTime - this.state.lastCatheterFullTime >= CONFIG.TIMING.FULL_BAG_ALERT_INTERVAL;

        if (isFull && intervalPassed) {
            this.send(
                'INTELLICATH Critical',
                'Warning: Catheter bag is almost full! Empty it now.'
            );
            this.state.lastCatheterFullTime = currentTime;
        }
    },

    /**
     * Send hourly notification with current status
     * @param {Object} data - Monitoring data
     */
    checkHourlyNotification(data) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        if (currentMinute === 0 && currentHour !== this.state.lastNotificationHour) {
            const message = [
                `Predicted Time: ${data.predicted_time || 'N/A'}`,
                `Urine Output: ${data.urine_output} cc`,
                `Bag Volume: ${data.catheter_bag_volume} ml`,
                `Remaining: ${data.remaining_volume} ml`
            ].join('\n');

            this.send('INTELLICATH Hourly Update', message);
            this.state.lastNotificationHour = currentHour;
        }
    },

    /**
     * Reset notification state
     */
    reset() {
        this.state = {
            previousUrineOutput: null,
            lastNoUrineOutputTime: 0,
            lastCatheterFullTime: 0,
            lastNotificationHour: -1
        };
    }
};
