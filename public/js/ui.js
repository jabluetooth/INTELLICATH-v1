/**
 * INTELLICATH - UI Module
 * Handles all UI updates and DOM manipulation
 */

const UI = {
    // DOM element references (cached for performance)
    elements: {},

    // Previous values for change detection
    previousValues: {},

    /**
     * Initialize UI by caching DOM elements
     */
    init() {
        this.elements = {
            // Stats
            urineOutput: document.getElementById('urineOutput'),
            flowRate: document.getElementById('flowRate'),
            bagVolume: document.getElementById('bagVolume'),
            remainingVolume: document.getElementById('remainingVolume'),
            predictedTime: document.getElementById('predictedTime'),

            // Capacity
            capacityProgress: document.getElementById('capacityProgress'),
            capacityBadge: document.getElementById('capacityBadge'),

            // Status
            statusCard: document.getElementById('statusCard'),
            statusIcon: document.getElementById('statusIcon'),
            statusText: document.getElementById('statusText'),
            statusMessage: document.getElementById('statusMessage'),
            statusMessageIcon: document.getElementById('statusMessageIcon'),

            // Other
            connectionBadge: document.getElementById('connectionBadge'),
            connectionText: document.getElementById('connectionText')
        };
    },

    /**
     * Update all UI elements with new data
     * @param {Object} data - Monitoring data
     */
    update(data) {
        this.updateStats(data);
        this.updateCapacity(data);
        this.updateStatus(data);
        this.updateTimestamp();
    },

    /**
     * Update stat cards with animation
     * @param {Object} data - Monitoring data
     */
    updateStats(data) {
        this.animateValue(this.elements.urineOutput, this.previousValues.urineOutput, data.urine_output ?? 0);
        this.animateValue(this.elements.flowRate, this.previousValues.flowRate, data.urine_flow_rate?.toFixed(2) ?? '0.00');
        this.animateValue(this.elements.bagVolume, this.previousValues.bagVolume, data.catheter_bag_volume ?? 0);
        this.animateValue(this.elements.remainingVolume, this.previousValues.remainingVolume, data.remaining_volume ?? 0);

        // Update predicted time and remove calculating animation when data arrives
        if (data.predicted_time) {
            this.elements.predictedTime.textContent = data.predicted_time;
            this.elements.predictedTime.classList.remove('calculating');
        } else {
            this.elements.predictedTime.textContent = 'Calculating';
            this.elements.predictedTime.classList.add('calculating');
        }

        // Store previous values
        this.previousValues = {
            urineOutput: data.urine_output,
            flowRate: data.urine_flow_rate?.toFixed(2),
            bagVolume: data.catheter_bag_volume,
            remainingVolume: data.remaining_volume
        };
    },

    /**
     * Animate value change
     * @param {HTMLElement} element - DOM element to update
     * @param {any} oldValue - Previous value
     * @param {any} newValue - New value
     */
    animateValue(element, oldValue, newValue) {
        element.textContent = newValue;

        // Add animation if value changed
        if (oldValue !== undefined && oldValue != newValue) {
            element.style.transform = 'scale(1.1)';
            element.style.transition = 'transform 0.3s ease';
            setTimeout(() => {
                element.style.transform = 'scale(1)';
            }, 300);
        }
    },

    /**
     * Update capacity progress bar
     * @param {Object} data - Monitoring data
     */
    updateCapacity(data) {
        const currentVolume = data.catheter_bag_volume || 0;
        const percent = Math.min((currentVolume / CONFIG.BAG.MAX_CAPACITY) * 100, 100);

        // Update progress bar width
        this.elements.capacityProgress.style.width = `${percent}%`;
        this.elements.capacityBadge.textContent = `${Math.round(percent)}%`;

        // Update colors based on percentage
        this.updateCapacityColors(percent);
    },

    /**
     * Update capacity bar colors based on percentage
     * @param {number} percent - Current capacity percentage
     */
    updateCapacityColors(percent) {
        const progressBar = this.elements.capacityProgress;

        if (percent >= CONFIG.BAG.CRITICAL_PERCENT) {
            progressBar.style.background = 'linear-gradient(90deg, #7f1d1d 0%, #dc2626 50%, #7f1d1d 100%)';
        } else if (percent >= CONFIG.BAG.WARNING_PERCENT) {
            progressBar.style.background = 'linear-gradient(90deg, #78350f 0%, #f59e0b 50%, #78350f 100%)';
        } else {
            progressBar.style.background = 'linear-gradient(90deg, #333333 0%, #4a4a4a 50%, #333333 100%)';
        }
        progressBar.style.backgroundSize = '200% 100%';
    },

    /**
     * Update status card based on current conditions
     * @param {Object} data - Monitoring data
     */
    updateStatus(data) {
        const volume = data.catheter_bag_volume || 0;
        const flowRate = data.urine_flow_rate || 0;
        const urineOutput = data.urine_output || 0;

        let status;
        if (volume >= CONFIG.BAG.CRITICAL_THRESHOLD) {
            status = CONFIG.STATUS.CRITICAL;
        } else if (volume >= CONFIG.BAG.WARNING_THRESHOLD) {
            status = CONFIG.STATUS.WARNING;
        } else if (flowRate === 0 && urineOutput === 0) {
            status = CONFIG.STATUS.ATTENTION;
        } else {
            status = CONFIG.STATUS.NORMAL;
        }

        this.applyStatus(status);
    },

    /**
     * Apply status styling to status card
     * @param {string} status - Status type
     */
    applyStatus(status) {
        const statusConfig = {
            [CONFIG.STATUS.CRITICAL]: {
                cardClass: 'glow-card info-card status-error',
                icon: 'fa-exclamation-circle',
                text: 'CRITICAL',
                message: 'Bag is full! Empty immediately!',
                messageIcon: 'fa-exclamation-triangle',
                showToast: true,
                toastTitle: 'Critical Alert!',
                toastMessage: 'Catheter bag is full. Empty immediately.'
            },
            [CONFIG.STATUS.WARNING]: {
                cardClass: 'glow-card info-card status-warning',
                icon: 'fa-exclamation-triangle',
                text: 'Warning',
                message: 'Bag nearing capacity. Plan to empty soon.',
                messageIcon: 'fa-clock',
                showToast: false
            },
            [CONFIG.STATUS.ATTENTION]: {
                cardClass: 'glow-card info-card',
                icon: 'fa-pause-circle',
                text: 'Attention',
                message: 'No urine output detected. Check for blockages.',
                messageIcon: 'fa-info-circle',
                showToast: false
            },
            [CONFIG.STATUS.NORMAL]: {
                cardClass: 'glow-card info-card status-normal',
                icon: 'fa-check-circle',
                text: 'Normal',
                message: 'All parameters within normal range',
                messageIcon: 'fa-shield-alt',
                showToast: false
            }
        };

        const config = statusConfig[status];

        // Apply status card styling
        this.elements.statusCard.className = config.cardClass;
        this.elements.statusIcon.className = `fas ${config.icon}`;
        this.elements.statusText.textContent = config.text;
        this.elements.statusMessage.textContent = config.message;
        this.elements.statusMessageIcon.className = `fas ${config.messageIcon}`;

        // Show toast for critical status
        if (config.showToast && window.showWarning) {
            // Only show once per critical state
            if (!this._criticalToastShown) {
                window.showError(config.toastTitle, config.toastMessage);
                this._criticalToastShown = true;
            }
        } else {
            this._criticalToastShown = false;
        }
    },

    /**
     * Update last updated timestamp (kept for compatibility)
     */
    updateTimestamp() {
        // Timestamp display removed from UI
    },

    /**
     * Show error state using toast notification
     * @param {string} message - Error message
     */
    showError(message) {
        if (window.showError) {
            window.showError('Unable to fetch data', message);
        }
    },

    /**
     * Hide error state (no-op since we use toasts now)
     */
    hideError() {
        // No-op - toasts auto-dismiss
    },

    /**
     * Update connection status badge
     * @param {string} status - Connection status: 'waiting', 'live', 'offline', 'no_device'
     */
    setConnectionStatus(status) {
        const badge = this.elements.connectionBadge;

        const statusConfig = {
            waiting: {
                class: 'status-indicator',
                text: 'Waiting',
                showPing: false
            },
            live: {
                class: 'status-indicator live',
                text: 'Live',
                showPing: true
            },
            offline: {
                class: 'status-indicator offline',
                text: 'Offline',
                showPing: false
            },
            no_device: {
                class: 'status-indicator warning',
                text: 'No Device',
                showPing: false
            },
            no_data: {
                class: 'status-indicator warning',
                text: 'No Data',
                showPing: false
            }
        };

        const config = statusConfig[status] || statusConfig.waiting;

        badge.className = config.class;
        badge.innerHTML = `
            <div class="status-dot-container">
                <div class="status-dot ${config.showPing ? 'ping' : ''}"></div>
                <div class="status-dot"></div>
            </div>
            <span>${config.text}</span>
        `;
    }
};
