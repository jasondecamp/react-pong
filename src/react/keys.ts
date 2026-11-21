import type { PongAction, PongKeys } from '../core/types.js';

// `KeyboardEvent.key` values that read better as something else.
const labels: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  ' ': 'Space',
};

/** How a `KeyboardEvent.key` value reads on a key cap. */
export const keyLabel = (key: string) => labels[key] ?? (key.length === 1 ? key.toUpperCase() : key);

/** The keys mapped to an action, in the key map's order. */
export const keysFor = (keys: PongKeys, action: PongAction) => (
  Object.keys(keys).filter((key) => keys[key] === action)
);
