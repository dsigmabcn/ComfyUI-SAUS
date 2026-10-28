/**
 * A virtual clock for the DOM harnesses.
 *
 * The modules under test wait on real timeouts - a 3s app-ready grace, a 10s
 * notice, a 20s boot cap - and the harnesses slept those out for real: two of
 * them spent ~45s of the suite doing nothing but waiting. `install()` swaps
 * `Date.now` / `setTimeout` / `clearTimeout` for a queue, so the same assertions
 * run in the same order and finish instantly.
 *
 *   manual (`sleep(ms)`):   const clock = install();  await clock.advance(700);
 *   auto (time flows when idle): const clock = install({ auto: true });
 *
 * `restore()` puts the real clock back. Nothing about the module under test
 * changes - only how long its timeouts take to elapse.
 */
const realSetImmediate = setImmediate;

export function install({ auto = false, start = 1_700_000_000_000 } = {}) {
    const real = {
        now: Date.now,
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
    };
    const timers = new Map();
    let now = start;
    let seq = 0;
    let driver = null;

    const earliestUpTo = (limit) => {
        let best = null;
        for (const [id, timer] of timers) {
            if (timer.at <= limit && (!best || timer.at < best.timer.at)) best = { id, timer };
        }
        return best;
    };

    const fire = ({ id, timer }) => {
        timers.delete(id);
        now = Math.max(now, timer.at);
        timer.fn(...timer.args);
    };

    const idle = () => new Promise((resolve) => realSetImmediate(resolve));

    /** Let time pass by `ms`: every timer due inside it fires, in order. */
    async function advance(ms) {
        const target = now + ms;
        for (;;) {
            await idle();
            const next = earliestUpTo(target);
            if (!next) break;
            fire(next);
        }
        now = target;
    }

    /** Auto mode: the earliest timer fires as soon as everything else is idle. */
    function scheduleDriver() {
        if (driver || !timers.size) return;
        driver = realSetImmediate(() => {
            driver = null;
            const next = earliestUpTo(Infinity);
            if (next) fire(next);
            scheduleDriver();
        });
    }

    globalThis.Date.now = () => now;
    globalThis.setTimeout = (fn, delay = 0, ...args) => {
        const id = ++seq;
        timers.set(id, { at: now + Math.max(0, Number(delay) || 0), fn, args });
        if (auto) scheduleDriver();
        return id;
    };
    globalThis.clearTimeout = (id) => {
        timers.delete(id);
        if (auto) scheduleDriver();
    };

    return {
        advance,
        now: () => now,
        restore() {
            globalThis.Date.now = real.now;
            globalThis.setTimeout = real.setTimeout;
            globalThis.clearTimeout = real.clearTimeout;
            timers.clear();
        },
    };
}
