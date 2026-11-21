import type { PongElements, PongInstance, PongOptions } from './types.js';
/**
 * Run a game of Pong on existing elements. The court is measured with a
 * ResizeObserver, so size it with CSS. Keys are heard only while the court has
 * focus. The game opens on the start screen and waits for a serve.
 */
export declare const createPong: (elements: PongElements, initialOptions?: PongOptions) => PongInstance;
//# sourceMappingURL=createPong.d.ts.map