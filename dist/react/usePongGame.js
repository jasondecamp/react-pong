import { useContext, useMemo, useSyncExternalStore } from 'react';
import { PongContext } from './PongContext.js';
/**
 * The state and controls of the nearest `<Pong>`, for custom subcomponents.
 * It re-renders only when something in the state changes, never per frame, and the
 * controls are stable across renders. Outside a `<Pong>` it returns the start
 * screen and controls that do nothing.
 */
export const usePongGame = () => {
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
//# sourceMappingURL=usePongGame.js.map