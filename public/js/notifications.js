const Notifications = {
    state: {
        previousUrineOutput:       null,
        lastNoUrineOutputTime:     0,
        lastCatheterFullTime:      0,
        lastHourlyNotificationTime: 0,  // BUG-10: elapsed-time based instead of clock-hour
    },

    async init() {
        if ('Notification' in window && Notification.permission !== 'granted') {
            await Notification.requestPermission();
        }
    },

    isPermitted() {
        return 'Notification' in window && Notification.permission === 'granted';
    },

    send(title, body, options = {}) {
        if (!this.isPermitted()) return;
        new Notification(title, { body, icon: '/favicon.ico', ...options });
    },

    process(data) {
        const now = Date.now();
        this.checkUrineOutputChange(data);
        this.checkNoUrineOutput(data, now);
        this.checkFullBag(data, now);
        this.checkHourlyNotification(data, now);
    },

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

    checkNoUrineOutput(data, now) {
        const noOutput      = data.urine_output === 0 || data.urine_output === null;
        const intervalPassed = now - this.state.lastNoUrineOutputTime >= CONFIG.TIMING.NO_OUTPUT_ALERT_INTERVAL;
        if (noOutput && intervalPassed) {
            this.send('INTELLICATH Warning', 'No urine output detected. Check for catheter blockages.');
            this.state.lastNoUrineOutputTime = now;
        }
    },

    // BUG-2: threshold now 700 mL (aligned with visual critical state via CONFIG)
    checkFullBag(data, now) {
        const isFull         = data.catheter_bag_volume >= CONFIG.BAG.CRITICAL_THRESHOLD;
        const intervalPassed = now - this.state.lastCatheterFullTime >= CONFIG.TIMING.FULL_BAG_ALERT_INTERVAL;
        if (isFull && intervalPassed) {
            this.send('INTELLICATH Critical', 'Warning: Catheter bag is almost full! Empty it now.');
            this.state.lastCatheterFullTime = now;
        }
    },

    // BUG-10: fires every 60 minutes by elapsed time, not by watching the clock
    checkHourlyNotification(data, now) {
        const oneHour = 3600000;
        if (now - this.state.lastHourlyNotificationTime < oneHour) return;

        const message = [
            `Predicted Time: ${data.predicted_time || 'N/A'}`,
            `Urine Output: ${data.urine_output} cc`,
            `Bag Volume: ${data.catheter_bag_volume} ml`,
            `Remaining: ${data.remaining_volume} ml`,
        ].join('\n');

        this.send('INTELLICATH Hourly Update', message);
        this.state.lastHourlyNotificationTime = now;
    },

    reset() {
        this.state = {
            previousUrineOutput:        null,
            lastNoUrineOutputTime:       0,
            lastCatheterFullTime:        0,
            lastHourlyNotificationTime:  0,
        };
    },
};
