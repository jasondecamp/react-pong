// `KeyboardEvent.key` values that read better as something else.
const labels = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Escape: 'Esc',
    ' ': 'Space',
};
/** How a `KeyboardEvent.key` value reads on a key cap. */
export const keyLabel = (key) => labels[key] ?? (key.length === 1 ? key.toUpperCase() : key);
/** The keys mapped to an action, in the key map's order. */
export const keysFor = (keys, action) => (Object.keys(keys).filter((key) => keys[key] === action));
//# sourceMappingURL=keys.js.map