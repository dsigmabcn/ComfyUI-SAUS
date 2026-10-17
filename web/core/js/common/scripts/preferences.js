const PREFS_KEY = 'SausMenuPref';

class PreferencesManager {
    constructor(defaultPrefs) {
        this.preferences = { ...defaultPrefs };
        this.loadPreferences();
    }

    loadPreferences() {
        const storedPrefs = localStorage.getItem(PREFS_KEY);
        if (storedPrefs) {
            try {
                const parsedPrefs = JSON.parse(storedPrefs);
                this.preferences = { ...this.preferences, ...parsedPrefs };
            } catch (e) {
                console.error('Error parsing preferences from localStorage:', e);
            }
        }
    }

    savePreferences() {
        try {
            localStorage.setItem(PREFS_KEY, JSON.stringify(this.preferences));
        } catch (e) {
            console.error('Error saving preferences to localStorage:', e);
        }
    }

    /**
     * Re-read localStorage over the current values.
     *
     * The Settings pane is a core component and writes the same key through its own
     * manager, so the shell's in-memory copy goes stale the moment that switch is
     * flipped. A `saus:preference-changed` listener calls this before re-rendering.
     */
    reload() {
        this.loadPreferences();
    }

    get(prefKey) {
        return this.preferences[prefKey];
    }

    set(prefKey, value) {
        this.preferences[prefKey] = value;
        this.savePreferences();
    }

    addPreference(prefKey, defaultValue) {
        if (!(prefKey in this.preferences)) {
            this.preferences[prefKey] = defaultValue;
            this.savePreferences();
        }
    }
}

export { PreferencesManager, };
