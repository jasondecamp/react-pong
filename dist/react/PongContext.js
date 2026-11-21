import { createContext } from 'react';
import { inertPongStore } from './pongStore.js';
// The default lets a subcomponent render outside <Pong>, as a still start screen.
export const PongContext = createContext(inertPongStore);
//# sourceMappingURL=PongContext.js.map