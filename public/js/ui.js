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
            statusAvatar: document.getElementById('statusAvatar'),
            statusText: document.getElementById('statusText'),
            statusMessage: document.getElementById('statusMessage'),

            // Alert
            alertBanner: document.getElementById('alertBanner'),
            alertTitle: document.getElementById('alertTitle'),
            alertMessage: document.getElementById('alertMessage'),

            // Other
            connectionBadge: document.getElementById('connectionBadge'),
            errorState: document.getElementById('errorState'),
            errorMessage: document.getElementById('errorMessage')
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
        this.hideError();
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
            element.classList.add('animate-count', 'animate-highlight');
            setTimeout(() => {
                element.classList.remove('animate-count', 'animate-highlight');
            }, 1000);
        }
    },

    /**
     * Update capacity progress bar
     * @param {Object} data - Monitoring data
     */
    updateCapacity(data) {
        const currentVolume = data.catheter_bag_volume || 0;
        const percent = Math.min((currentVolume / CONFIG.BAG.MAX_CAPACITY) * 100, 100);

        // Update values
        this.elements.capacityProgress.value = percent;
        this.elements.capacityBadge.textContent = `${Math.round(percent)}%`;

        // Update colors
        this.updateCapacityColors(percent);
    },

    /**
     * Update capacity bar colors based on percentage
     * @param {number} percent - Current capacity percentage
     */
    updateCapacityColors(percent) {
        const progressBar = this.elements.capacityProgress;
        const badge = this.elements.capacityBadge;

        // Remove existing color classes
        progressBar.classList.remove('progress-primary', 'progress-warning', 'progress-error');
        badge.classList.remove('badge-primary', 'badge-warning', 'badge-error');

        // Apply appropriate color
        if (percent >= CONFIG.BAG.CRITICAL_PERCENT) {
            progressBar.classList.add('progress-error');
            badge.classList.add('badge-error');
        } else if (percent >= CONFIG.BAG.WARNING_PERCENT) {
            progressBar.classList.add('progress-warning');
            badge.classList.add('badge-warning');
        } else {
            progressBar.classList.add('progress-primary');
            badge.classList.add('badge-primary');
        }
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
                cardClass: 'card bg-error/10 shadow-xl border border-error/30 animate-glow-error',
                avatarClass: 'bg-error text-error-content animate-bounce-soft',
                icon: 'fa-exclamation-circle',
                text: 'CRITICAL',
                textClass: 'text-2xl font-bold text-error',
                message: 'Bag is full! Empty immediately!',
                messageIcon: 'fa-exclamation-triangle',
                messageClass: 'flex items-center gap-2 text-sm text-error',
                showAlert: true,
                alertTitle: 'Critical Alert!',
                alertMessage: 'Catheter bag is full. Empty immediately to prevent complications.'
            },
            [CONFIG.STATUS.WARNING]: {
                cardClass: 'card bg-warning/10 shadow-xl border border-warning/30 animate-glow-warning',
                avatarClass: 'bg-warning text-warning-content',
                icon: 'fa-exclamation-triangle',
                text: 'Warning',
                textClass: 'text-2xl font-bold text-warning',
                message: 'Bag nearing capacity. Plan to empty soon.',
                messageIcon: 'fa-clock',
                messageClass: 'flex items-center gap-2 text-sm text-warning',
                showAlert: false
            },
            [CONFIG.STATUS.ATTENTION]: {
                cardClass: 'card bg-info/10 shadow-xl border border-info/30',
                avatarClass: 'bg-info text-info-content',
                icon: 'fa-pause-circle',
                text: 'Attention',
                textClass: 'text-2xl font-bold text-info',
                message: 'No urine output detected. Check for blockages.',
                messageIcon: 'fa-info-circle',
                messageClass: 'flex items-center gap-2 text-sm text-info',
                showAlert: false
            },
            [CONFIG.STATUS.NORMAL]: {
                cardClass: 'card bg-success/10 shadow-xl border border-success/30',
                avatarClass: 'bg-success text-success-content',
                icon: 'fa-check-circle',
                text: 'Normal',
                textClass: 'text-2xl font-bold text-success',
                message: 'All parameters within normal range',
                messageIcon: 'fa-shield-alt',
                messageClass: 'flex items-center gap-2 text-sm text-success',
                showAlert: false
            }
        };

        const config = statusConfig[status];

        // Apply status card styling
        this.elements.statusCard.className = config.cardClass;
        this.elements.statusAvatar.innerHTML = `
            <div class="${config.avatarClass} w-16 rounded-xl flex items-center justify-center">
                <i class="fas ${config.icon} text-2xl"></i>
            </div>
        `;
        this.elements.statusText.textContent = config.text;
        this.elements.statusText.className = config.textClass;
        this.elements.statusMessage.innerHTML = `
            <i class="fas ${config.messageIcon} mr-2"></i>${config.message}
        `;
        this.elements.statusMessage.className = config.messageClass;

        // Handle alert banner
        if (config.showAlert) {
            this.showAlert(config.alertTitle, config.alertMessage);
        } else {
            this.hideAlert();
        }
    },

    /**
     * Show alert banner with animation
     * @param {string} title - Alert title
     * @param {string} message - Alert message
     */
    showAlert(title, message) {
        this.elements.alertTitle.textContent = title;
        this.elements.alertMessage.textContent = message;
        this.elements.alertBanner.classList.remove('hidden');

        // Add shake animation
        this.elements.alertBanner.classList.add('animate-shake');
        setTimeout(() => {
            this.elements.alertBanner.classList.remove('animate-shake');
        }, 500);
    },

    /**
     * Hide alert banner
     */
    hideAlert() {
        this.elements.alertBanner.classList.add('hidden');
    },

    /**
     * Update last updated timestamp (kept for compatibility)
     */
    updateTimestamp() {
        // Timestamp display removed from UI
    },

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorState.classList.remove('hidden');
    },

    /**
     * Hide error state
     */
    hideError() {
        this.elements.errorState.classList.add('hidden');
    },

    /**
     * Update connection status badge
     * @param {string} status - Connection status: 'waiting', 'live', 'offline', 'no_device'
     */
    setConnectionStatus(status) {
        const statusConfig = {
            waiting: {
                class: 'badge bg-gray-400 text-white border-none gap-1',
                icon: 'fa-plug',
                text: 'Waiting',
                animate: false
            },
            live: {
                class: 'badge bg-green-600 text-white border-none gap-1',
                icon: 'loading',
                text: 'Live',
                animate: true
            },
            offline: {
                class: 'badge bg-red-500 text-white border-none gap-1',
                icon: 'fa-times-circle',
                text: 'Offline',
                animate: false
            },
            no_device: {
                class: 'badge bg-orange-400 text-white border-none gap-1',
                icon: 'fa-unlink',
                text: 'No Device',
                animate: false
            },
            no_data: {
                class: 'badge bg-yellow-500 text-white border-none gap-1',
                icon: 'fa-database',
                text: 'No Data',
                animate: false
            }
        };

        const config = statusConfig[status] || statusConfig.waiting;

        this.elements.connectionBadge.className = config.class;

        if (config.animate) {
            this.elements.connectionBadge.innerHTML = `
                <span class="loading loading-ring loading-xs"></span>
                <span>${config.text}</span>
            `;
        } else {
            this.elements.connectionBadge.innerHTML = `
                <i class="fas ${config.icon}"></i>
                <span>${config.text}</span>
            `;
        }
    }
};
