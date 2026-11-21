import { useContext, useMemo, useSyncExternalStore } from 'react';
import type { PongState } from '../core/types.js';
import { PongContext } from './PongContext.js';

export type PongGame = PongState & {
  /** Serve the ball, from the start screen or between points. */
  serve: () => void;
  /** Freeze a rally. */
  pause: () => void;
  /** Continue a paused rally. */
  resume: () => void;
  /** Return to the start screen with the scores cleared. */
  reset: () => void;
  /** Open the help, pausing a rally first. */
  openHelp: () => void;
  /** Close the help. A rally it paused stays paused. */
  closeHelp: () => void;
};

/**
 * The state and controls of the nearest `<Pong>`, for custom subcomponents.
 * It re-renders only when something in the state changes, never per frame, and the
 * controls are stable across renders. Outside a `<Pong>` it returns the start
 * screen and controls that do nothing.
 */
export const usePongGame = (): PongGame => {
  const store = useContext(PongContext);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getServerState);
  return useMemo(() => ({
    ...state,
    serve: store.serve,
    pause: store.pause,
    resume: store.resume,
    reset: store.reset,
    openHelp: store.openHelp,
    closeHelp: store.closeHelp,
  }), [state, store]);
};
