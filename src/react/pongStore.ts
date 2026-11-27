import { createPong } from '../core/createPong.js';
import { initialState } from '../core/options.js';
import type { PongElements, PongInstance, PongOptions, PongState } from '../core/types.js';

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
  openLobby: () => void;
  closeLobby: () => void;
  createLobby: () => void;
  joinLobby: (code: string) => void;
  setReady: (ready: boolean) => void;
  leaveLobby: () => void;
};

// A key map is compared by value, so an inline `keys={{ w: 'up' }}` doesn't
// count as a change every render.
const sameValue = (a: unknown, b: unknown) => {
  if (typeof a === 'object' && typeof b === 'object' && a != null && b != null) {
    const aEntries = Object.entries(a);
    return aEntries.length === Object.keys(b).length
      && aEntries.every(([key, value]) => Object.is(value, (b as Record<string, unknown>)[key]));
  }
  return Object.is(a, b);
};

/** The options whose values differ between two renders; removed keys come back as `undefined` (the default). */
const changedOptions = (previous: PongOptions, next: PongOptions): PongOptions | null => {
  const changes: Record<string, unknown> = {};
  let changed = false;
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<keyof PongOptions>;
  for (const key of keys) {
    if (!sameValue(previous[key], next[key])) {
      changes[key] = next[key];
      changed = true;
    }
  }
  return changed ? (changes as PongOptions) : null;
};

export const createPongStore = (): PongStore => {
  let engine: PongInstance | null = null;
  let elements: PongElements | null = null;
  // Null until the first sync, so the engine is never created on defaults
  // only to be updated a moment later.
  let options: PongOptions | null = null;
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  const start = () => {
    if (engine != null || elements == null || options == null) return;
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
      if (engine == null) start();
      else if (changes != null) engine.update(changes);
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
    openLobby: () => engine?.openLobby(),
    closeLobby: () => engine?.closeLobby(),
    createLobby: () => engine?.createLobby(),
    joinLobby: (code) => engine?.joinLobby(code),
    setReady: (ready) => engine?.setReady(ready),
    leaveLobby: () => engine?.leaveLobby(),
  };
};

/** The store outside any `<Pong>`: the start screen, with controls that do nothing. */
export const inertPongStore: PongStore = {
  attach: () => () => {},
  sync: () => {},
  subscribe: () => () => {},
  getState: () => initialState,
  getServerState: () => initialState,
  serve: () => {},
  pause: () => {},
  resume: () => {},
  reset: () => {},
  openHelp: () => {},
  closeHelp: () => {},
  openLobby: () => {},
  closeLobby: () => {},
  createLobby: () => {},
  joinLobby: () => {},
  setReady: () => {},
  leaveLobby: () => {},
};
