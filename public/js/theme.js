/**
 * INTELLICATH - Theme Module
 * Handles theme switching and persistence
 */

const Theme = {
    // Storage key for theme preference
    STORAGE_KEY: 'intellicath-theme',

    /**
     * Initialize theme from stored preference or system preference
     */
    init() {
        const savedTheme = localStorage.getItem(this.STORAGE_KEY);

        if (savedTheme) {
            this.set(savedTheme);
        } else {
            // Use system preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.set(prefersDark ? CONFIG.THEMES.DARK : CONFIG.THEMES.LIGHT);
        }

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem(this.STORAGE_KEY)) {
                this.set(e.matches ? CONFIG.THEMES.DARK : CONFIG.THEMES.LIGHT);
            }
        });
    },

    /**
     * Get current theme
     * @returns {string} Current theme name
     */
    get() {
        return document.documentElement.getAttribute('data-theme') || CONFIG.THEMES.DARK;
    },

    /**
     * Set theme
     * @param {string} theme - Theme name to set
     */
    set(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(this.STORAGE_KEY, theme);
    },

    /**
     * Toggle between light and dark themes
     */
    toggle() {
        const currentTheme = this.get();
        const newTheme = currentTheme === CONFIG.THEMES.DARK
            ? CONFIG.THEMES.LIGHT
            : CONFIG.THEMES.DARK;
        this.set(newTheme);
    },

    /**
     * Check if current theme is dark
     * @returns {boolean} True if dark theme is active
     */
    isDark() {
        return this.get() === CONFIG.THEMES.DARK;
    }
};
