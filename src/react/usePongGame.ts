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
  /** Open the two-player panel, from the start screen. Does nothing without a `server`. */
  openLobby: () => void;
  /** Close the two-player panel. Does nothing while in a lobby, which is left rather than closed. */
  closeLobby: () => void;
  /** Create a lobby and wait in it for another player. */
  createLobby: () => void;
  /** Join the lobby with this code. */
  joinLobby: (code: string) => void;
  /** In a lobby: say this player is ready for a match, or no longer is. */
  setReady: (ready: boolean) => void;
  /** Leave the lobby for the single-player start screen. */
  leaveLobby: () => void;
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
    openLobby: store.openLobby,
    closeLobby: store.closeLobby,
    createLobby: store.createLobby,
    joinLobby: store.joinLobby,
    setReady: store.setReady,
    leaveLobby: store.leaveLobby,
  }), [state, store]);
};
