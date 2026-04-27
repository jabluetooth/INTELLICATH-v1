const UI = {
    elements: {},
    previousValues: {},

    init() {
        this.elements = {
            timeValue:        document.getElementById('timeValue'),
            timeUnit:         document.getElementById('timeUnit'),
            pctText:          document.getElementById('pctText'),
            barFill:          document.getElementById('barFill'),
            statusMsg:        document.getElementById('statusMsg'),
            volVal:           document.getElementById('volVal'),
            remVal:           document.getElementById('remVal'),
            statusVal:        document.getElementById('statusVal'),
            statusSub:        document.getElementById('statusSub'),
            urineOut:         document.getElementById('urineOut'),
            flowRate:         document.getElementById('flowRate'),
            catheterStatus:   document.getElementById('catheterStatus'),
            catheterStatusSub:document.getElementById('catheterStatusSub'),
            signalQuality:    document.getElementById('signalQuality'),
            signalQualitySub: document.getElementById('signalQualitySub'),
            timestamp:        document.getElementById('timestamp'),
            footerTs:         document.getElementById('footerTs'),
            deviceBadge:      document.getElementById('deviceBadge'),
            deviceDot:        document.getElementById('deviceDot'),
            deviceLabel:      document.getElementById('deviceLabel'),
        };

        // Clock tick every second
        setInterval(() => this._tick(), 1000);
    },

    update(data) {
        this._updateReadout(data);
        this._updateGrid(data);
        this._updateTimestamp();
    },

    _getStatusConfig(pct, flowRate, urineOutput) {
        if (pct >= 87.5) return {
            cls: 'crit', bar: 'crit',
            status: 'Critical', color: 'var(--crit)', sub: 'Empty immediately',
            msg: 'URGENT — Bag approaching maximum capacity. Empty immediately.',
            catheter: 'CHECK', catheterSub: 'Bag near full',
        };
        if (pct >= 75) return {
            cls: 'warn', bar: 'warn',
            status: 'Caution', color: 'var(--warn)', sub: 'Plan to empty soon',
            msg: 'Bag nearing capacity. Plan to empty within the next 4 hours.',
            catheter: 'OK', catheterSub: 'Elevated volume',
        };
        if ((flowRate === 0 || flowRate === null) && (urineOutput === 0 || urineOutput === null)) return {
            cls: '', bar: '',
            status: 'Attention', color: 'var(--warn)', sub: 'Check for blockage',
            msg: 'No urine output detected. Check catheter for blockages.',
            catheter: 'CHECK', catheterSub: 'No flow detected',
        };
        return {
            cls: '', bar: '',
            status: 'Good', color: 'var(--accent)', sub: 'All nominal',
            msg: 'Catheter bag at normal capacity. Next check recommended in 6 hours.',
            catheter: 'OK', catheterSub: 'Normal function',
        };
    },

    _parsePredictedTime(str) {
        if (!str) return { big: '—', unit: 'calculating…' };
        const m = str.match(/(\d+)\s+hours?\s+and\s+(\d+)\s+minutes?/i);
        if (!m) return { big: str, unit: 'estimated' };
        const h = parseInt(m[1]), min = parseInt(m[2]);
        const unit = min > 0 ? `${h}h ${min}m until full` : `${h}h until full`;
        return { big: h.toString(), unit };
    },

    _updateReadout(data) {
        const vol  = data.catheter_bag_volume ?? 0;
        const rem  = data.remaining_volume ?? 0;
        const flow = data.urine_flow_rate ?? 0;
        const uout = data.urine_output ?? 0;
        const pct  = Math.min((vol / 800) * 100, 100);
        const s    = this._getStatusConfig(pct, flow, uout);
        const pt   = this._parsePredictedTime(data.predicted_time);

        // Big time display
        this.elements.timeValue.textContent = pt.big;
        this.elements.timeValue.className   = 'readout-number ' + s.cls;
        this.elements.timeUnit.textContent  = pt.unit;

        // Capacity bar
        this.elements.barFill.style.width  = Math.round(pct) + '%';
        this.elements.barFill.className    = 'bar-fill ' + s.bar;
        this.elements.pctText.textContent  = Math.round(pct) + '%';

        // Status message
        this.elements.statusMsg.textContent = s.msg;

        // Right panel stats
        this.elements.volVal.textContent = Math.round(vol);
        this.elements.remVal.textContent = Math.round(rem);

        const sv = this.elements.statusVal;
        sv.textContent   = s.status;
        sv.style.color   = s.color;
        this.elements.statusSub.textContent = s.sub;

        // Show toast for critical (debounced via flag)
        if (s.cls === 'crit' && !this._critShown) {
            this._critShown = true;
            if (window.showError) window.showError('Critical Alert', 'Catheter bag is nearly full — empty immediately.');
        } else if (s.cls !== 'crit') {
            this._critShown = false;
        }
    },

    _updateGrid(data) {
        const vol  = data.catheter_bag_volume ?? 0;
        const flow = data.urine_flow_rate ?? 0;
        const uout = data.urine_output ?? 0;
        const pct  = Math.min((vol / 800) * 100, 100);
        const s    = this._getStatusConfig(pct, flow, uout);

        this._setVal(this.elements.urineOut,  this.previousValues.urineOut,  Math.round(uout));
        this._setVal(this.elements.flowRate,   this.previousValues.flowRate,  flow.toFixed(2));

        this.elements.catheterStatus.textContent    = s.catheter;
        this.elements.catheterStatusSub.textContent = s.catheterSub;
        this.elements.signalQuality.textContent     = '99%';
        this.elements.signalQualitySub.textContent  = 'All sensors active';

        this.previousValues = { urineOut: Math.round(uout), flowRate: flow.toFixed(2) };
    },

    _setVal(el, oldVal, newVal) {
        el.textContent = newVal;
        if (oldVal !== undefined && oldVal != newVal) {
            el.style.transform  = 'scale(1.08)';
            el.style.transition = 'transform 0.3s ease';
            setTimeout(() => { el.style.transform = 'scale(1)'; }, 300);
        }
    },

    _updateTimestamp() {
        const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.elements.timestamp.textContent = t;
        this.elements.footerTs.textContent  = t;
    },

    _tick() {
        const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (this.elements.footerTs) this.elements.footerTs.textContent = t;
    },

    setConnectionStatus(status) {
        const badge = this.elements.deviceBadge;
        const dot   = this.elements.deviceDot;
        const label = this.elements.deviceLabel;
        if (!badge) return;

        const map = {
            live:    { badgeCls: 'device-badge',         dotCls: 'device-badge-dot',         text: 'ESP32 Online' },
            offline: { badgeCls: 'device-badge offline', dotCls: 'device-badge-dot offline', text: 'ESP32 Offline' },
            waiting: { badgeCls: 'device-badge waiting', dotCls: 'device-badge-dot waiting', text: 'Connecting…' },
            no_data: { badgeCls: 'device-badge waiting', dotCls: 'device-badge-dot waiting', text: 'No Data' },
        };

        const cfg = map[status] || map.waiting;
        badge.className = cfg.badgeCls;
        dot.className   = cfg.dotCls;
        label.textContent = cfg.text;
    },

    showError(message) {
        if (window.showError) window.showError('Data Error', message);
    },

    hideError() {},
};
