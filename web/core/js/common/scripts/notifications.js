import { PreferencesManager } from './preferences.js';

/**
 * The end-of-generation notice: a short "breadcrumb" on screen and, only when the user
 * asks, a chime synthesised with the Web Audio API (nothing to ship, nothing to
 * license). The preference is read here, from the same localStorage key the Settings
 * pane writes, because a generation can finish in an app the shell never told anything
 * about. Off by default.
 */

let prefs = null;

function preferences() {
    if (!prefs) prefs = new PreferencesManager({ playSoundOnComplete: false });
    return prefs;
}

/** True when "Play sound when generation is finished" is on. Off by default. */
export function completionSoundEnabled() {
    // Read it *now*: the Settings pane may have flipped the switch while this page was
    // already open, and a cached manager keeps answering with the value from page load -
    // which is why the setting used to look like it needed a restart.
    preferences().reload();
    return preferences().get('playSoundOnComplete') === true;
}

/**
 * A single soft bell - not a jingle.
 *
 * One struck fundamental plus two quiet, *inharmonic* overtones (2.76x is the ratio that
 * makes metal read as metal) with long exponential tails is what sounds like a bell; two
 * clean notes in a row sound like an alarm. Gain is deliberately low: this plays after
 * every generation, so it has to be easy to live with.
 */
export function playCompletionChime() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    try {
        const context = new AudioContextClass();
        if (context.state === 'suspended') context.resume();
        const start = context.currentTime;
        const fundamental = 660;

        [[1, 0.09, 1.6], [2.76, 0.03, 0.9], [5.4, 0.015, 0.5]].forEach(
            ([multiple, level, decay]) => {
                const oscillator = context.createOscillator();
                const gain = context.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.value = fundamental * multiple;
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(level, start + 0.008);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
                oscillator.connect(gain).connect(context.destination);
                oscillator.start(start);
                oscillator.stop(start + decay + 0.05);
            });

        setTimeout(() => context.close(), 2400);
        return context;
    } catch (error) {
        console.warn('[SAUS] Could not play the completion sound:', error);
        return null;
    }
}

/**
 * The breadcrumb itself: the same card, icon and reveal the Settings pane's toasts use,
 * in the same top-right corner (see `core/css/notices.css`).
 *
 * The host is shared and long-lived, so several notices stack rather than overwriting
 * each other, and nothing here holds a pointer to a thing it removed.
 */
function showCompletionToast(message = 'Generation complete', milliseconds = 4000) {
    let host = document.getElementById('saus-notices');
    if (!host) {
        host = document.createElement('div');
        host.id = 'saus-notices';
        document.body.appendChild(host);
    }

    const toast = document.createElement('div');
    toast.className = 'saus-toast toast-success';
    toast.setAttribute('role', 'status');
    const icon = document.createElement('i');
    icon.className = 'fas fa-check-circle';
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(icon, text);
    host.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        // Backstop. `transitionend` is the tidy way to remove it, but nothing guarantees a
        // transition actually runs - a hidden tab throttles it, a reduced-motion setting
        // skips it - and then the event never arrives and the toast stays on screen for
        // good. Which is exactly what happened before.
        setTimeout(() => toast.remove(), 500);
    }, milliseconds);

    return toast;
}

/** "Generation finished": the notice always, the chime only when enabled. */
export function notifyGenerationComplete(message = 'Generation complete') {
    showCompletionToast(message);
    if (completionSoundEnabled()) playCompletionChime();
}

/** The wire type the app and the shell agree on. */
const GENERATION_COMPLETE = 'saus:generation-complete';

/**
 * Tell the shell a generation finished.
 *
 * Every app runs in its own iframe, so a notice raised here belongs to *that* document: it
 * vanishes the moment another tab is opened, and its audio dies with it. The shell outlives
 * the tabs, so the shell is what shows and plays - this hands the news over and only falls
 * back to showing it locally when there is no shell (an app page opened on its own).
 */
export function announceGenerationComplete(message = 'Generation complete') {
    if (window.parent && window.parent !== window) {
        try {
            window.parent.postMessage({ type: GENERATION_COMPLETE, message },
                window.location.origin);
            return;
        } catch (error) {
            console.warn('[SAUS] Could not hand the completion notice to the shell:', error);
        }
    }
    notifyGenerationComplete(message);
}

/**
 * The shell's half of that handshake. Call once, from the shell.
 *
 * Living in the shell's document is the whole point: the breadcrumb stays where the user
 * can still see it while they move between app tabs, and the bell rings wherever they are
 * looking - the iframe that generated the image may be hidden by then.
 */
export function listenForGenerationComplete() {
    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || data.type !== GENERATION_COMPLETE) return;
        notifyGenerationComplete(typeof data.message === 'string' ? data.message : undefined);
    });
}
