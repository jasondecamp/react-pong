import { createPong } from '../core/createPong.js';
import { initialState } from '../core/options.js';
// A key map is compared by value, so an inline `keys={{ w: 'up' }}` doesn't
// count as a change every render.
const sameValue = (a, b) => {
    if (typeof a === 'object' && typeof b === 'object' && a != null && b != null) {
        const aEntries = Object.entries(a);
        return aEntries.length === Object.keys(b).length
            && aEntries.every(([key, value]) => Object.is(value, b[key]));
    }
    return Object.is(a, b);
};
/** The options whose values differ between two renders; removed keys come back as `undefined` (the default). */
const changedOptions = (previous, next) => {
    const changes = {};
    let changed = false;
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const key of keys) {
        if (!sameValue(previous[key], next[key])) {
            changes[key] = next[key];
            changed = true;
        }
    }
    return changed ? changes : null;
};
export const createPongStore = () => {
    let engine = null;
    let elements = null;
    // Null until the first sync, so the engine is never created on defaults
    // only to be updated a moment later.
    let options = null;
    const listeners = new Set();
    const notify = () => listeners.forEach((listener) => listener());
    const start = () => {
        if (engine != null || elements == null || options == null)
            return;
        engine = createPong(elements, options);
        engine.subscribe(notify);
        notify();
    };
    return {
        attach: (nextElements) => {
            elements = nextElements;
            start();
            return () => {
                engine?.destroy();
                engine = null;
                elements = null;
                notify();
            };
        },
        sync: (nextOptions) => {
            const changes = changedOptions(options ?? {}, nextOptions);
            options = nextOptions;
            if (engine == null)
                start();
            else if (changes != null)
                engine.update(changes);
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getState: () => engine?.getState() ?? initialState,
        getServerState: () => initialState,
        serve: () => engine?.serve(),
        pause: () => engine?.pause(),
        resume: () => engine?.resume(),
        reset: () => engine?.reset(),
        openHelp: () => engine?.openHelp(),
        closeHelp: () => engine?.closeHelp(),
    };
};
/** The store outside any `<Pong>`: the start screen, with controls that do nothing. */
export const inertPongStore = {
    attach: () => () => { },
    sync: () => { },
    subscribe: () => () => { },
    getState: () => initialState,
    getServerState: () => initialState,
    serve: () => { },
    pause: () => { },
    resume: () => { },
    reset: () => { },
    openHelp: () => { },
    closeHelp: () => { },
};
//# sourceMappingURL=pongStore.js.map