export const defaultKeys = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    Enter: 'serve',
    ' ': 'pause',
    Escape: 'reset',
    '?': 'help',
    d: 'difficulty',
};
export const defaultOptions = {
    winningScore: 11,
    difficulty: 'normal',
    attract: true,
    smack: true,
    sound: true,
    ripple: true,
    trail: true,
    toss: true,
    keys: defaultKeys,
    paddleSpeed: 1.2,
};
/** The start screen: what a court shows before its engine exists, and after a reset. */
export const initialState = {
    phase: 'start',
    scores: { left: 0, right: 0 },
    winner: null,
    message: 'start',
    messageCount: 0,
    matchRoll: 0,
    countdown: null,
    difficulty: defaultOptions.difficulty,
    winningScore: defaultOptions.winningScore,
    help: false,
    keys: defaultKeys,
};
const actions = ['up', 'down', 'serve', 'pause', 'reset', 'help', 'difficulty'];
/** Every difficulty, in the order the difficulty key steps through them. */
export const difficulties = ['easy', 'normal', 'hard', 'impossible'];
const finiteOr = (value, fallback) => (Number.isFinite(value) ? value : fallback);
/** The entries of a key map that name a real action, or the default keys for anything that isn't a map. */
const resolveKeys = (keys) => {
    if (typeof keys !== 'object' || keys == null)
        return defaultKeys;
    return Object.fromEntries(Object.entries(keys).filter(([, action]) => actions.includes(action)));
};
/** Fill in defaults, drop `undefined` values, and clamp everything into its valid range. */
export const resolveOptions = (options) => {
    const defined = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
    const merged = { ...defaultOptions, ...defined };
    return {
        ...merged,
        winningScore: Math.max(1, Math.floor(finiteOr(merged.winningScore, defaultOptions.winningScore))),
        difficulty: difficulties.includes(merged.difficulty) ? merged.difficulty : defaultOptions.difficulty,
        attract: merged.attract === true,
        smack: merged.smack === true,
        sound: merged.sound === true,
        ripple: merged.ripple === true,
        trail: merged.trail === true,
        toss: merged.toss === true,
        keys: resolveKeys(merged.keys),
        paddleSpeed: Math.max(0, finiteOr(merged.paddleSpeed, defaultOptions.paddleSpeed)),
    };
};
//# sourceMappingURL=options.js.map