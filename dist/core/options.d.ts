import type { PongDifficulty, PongKeys, PongOptions, PongState, ResolvedPongOptions } from './types.js';
export declare const defaultKeys: PongKeys;
export declare const defaultOptions: ResolvedPongOptions;
/** The start screen: what a court shows before its engine exists, and after a reset. */
export declare const initialState: PongState;
/** Every difficulty, in the order the difficulty key steps through them. */
export declare const difficulties: readonly PongDifficulty[];
/** Fill in defaults, drop `undefined` values, and clamp everything into its valid range. */
export declare const resolveOptions: (options: PongOptions) => ResolvedPongOptions;
//# sourceMappingURL=options.d.ts.map