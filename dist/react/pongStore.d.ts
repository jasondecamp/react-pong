import type { PongElements, PongOptions, PongState } from '../core/types.js';
/**
 * What `<Pong>` shares with its subcomponents: the game's state and controls,
 * whether or not an engine is running behind them.
 */
export type PongStore = {
    /** Hand over the court's elements. The engine runs until the returned function is called. */
    attach: (elements: PongElements) => () => void;
    /** Set the options, applying only the ones that changed to a running engine. */
    sync: (options: PongOptions) => void;
    subscribe: (listener: () => void) => () => void;
    getState: () => PongState;
    getServerState: () => PongState;
    serve: () => void;
    pause: () => void;
    resume: () => void;
    reset: () => void;
    openHelp: () => void;
    closeHelp: () => void;
};
export declare const createPongStore: () => PongStore;
/** The store outside any `<Pong>`: the start screen, with controls that do nothing. */
export declare const inertPongStore: PongStore;
//# sourceMappingURL=pongStore.d.ts.map