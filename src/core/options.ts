import type { PongAction, PongDifficulty, PongKeys, PongOptions, PongState, ResolvedPongOptions } from './types.js';

export const defaultKeys: PongKeys = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  Enter: 'serve',
  Escape: 'pause',
};

export const defaultOptions: ResolvedPongOptions = {
  winningScore: 11,
  difficulty: 'normal',
  smack: false,
  sound: true,
  ripple: true,
  keys: defaultKeys,
  paddleSpeed: 1.2,
};

/** The start screen: what a court shows before its engine exists, and after a reset. */
export const initialState: PongState = {
  phase: 'start',
  scores: { left: 0, right: 0 },
  winner: null,
  message: 'start',
  messageCount: 0,
  matchRoll: 0,
};

const actions: readonly PongAction[] = ['up', 'down', 'serve', 'pause'];
const difficulties: readonly PongDifficulty[] = ['easy', 'normal', 'hard'];

const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

/** The entries of a key map that name a real action, or the default keys for anything that isn't a map. */
const resolveKeys = (keys: unknown): PongKeys => {
  if (typeof keys !== 'object' || keys == null) return defaultKeys;
  return Object.fromEntries(
    Object.entries(keys).filter(([, action]) => actions.includes(action as PongAction)),
  ) as PongKeys;
};

/** Fill in defaults, drop `undefined` values, and clamp everything into its valid range. */
export const resolveOptions = (options: PongOptions): ResolvedPongOptions => {
  const defined = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  ) as PongOptions;
  const merged = { ...defaultOptions, ...defined };
  return {
    ...merged,
    winningScore: Math.max(1, Math.floor(finiteOr(merged.winningScore, defaultOptions.winningScore))),
    difficulty: difficulties.includes(merged.difficulty) ? merged.difficulty : defaultOptions.difficulty,
    smack: merged.smack === true,
    sound: merged.sound === true,
    ripple: merged.ripple === true,
    keys: resolveKeys(merged.keys),
    paddleSpeed: Math.max(0, finiteOr(merged.paddleSpeed, defaultOptions.paddleSpeed)),
  };
};
