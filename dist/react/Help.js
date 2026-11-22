import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import classNames from 'classnames';
import { keyLabel, keysFor } from './keys.js';
import { usePongGame } from './usePongGame.js';
const rows = [
    { action: 'up', label: 'Move up' },
    { action: 'down', label: 'Move down' },
    { action: 'serve', label: 'Serve' },
    { action: 'pause', label: 'Pause or resume' },
    { action: 'reset', label: 'Reset after game over' },
    { action: 'difficulty', label: 'Change difficulty (locked during active game)' },
    { action: 'help', label: 'Show or hide these keys' },
];
// What the ball does off a paddle that the keys alone don't tell you.
const tips = [
    { term: 'Momentum', text: 'A moving paddle adds some momentum to the ball. The faster it moves at the hit, the sharper the angle.' },
    { term: 'Corners', text: 'The top and bottom corners of your paddle send the ball off steeply.' },
];
// Each difficulty has its own color.
const difficultyClasses = {
    easy: 'pong-difficulty-easy',
    normal: 'pong-difficulty-normal',
    hard: 'pong-difficulty-hard',
    impossible: 'pong-difficulty-impossible',
};
/**
 * Just above the score, the current difficulty in its own color (between
 * games, when it can be changed) and a hint pointing to the help. The help is
 * an overlay headed by the score to play to, listing every key the game
 * handles, read from the current key map, and then how the paddle shapes a
 * shot. The help key opens it, pausing a rally, and the help or reset key
 * closes it.
 */
export const Help = ({ className }) => {
    const { phase, difficulty, winningScore, help, keys } = usePongGame();
    const [helpKey] = keysFor(keys, 'help');
    const [resetKey] = keysFor(keys, 'reset');
    const closers = [helpKey, resetKey].filter((key) => key != null).map(keyLabel);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: 'pong-help-hints', "aria-live": 'polite', "aria-hidden": help, children: [(phase === 'start' || phase === 'gameOver') && (_jsx("p", { className: classNames('pong-hint', 'pong-difficulty', difficultyClasses[difficulty]), children: difficulty })), helpKey != null && _jsxs("p", { className: 'pong-hint', children: ["press ", keyLabel(helpKey), " for help"] })] }), _jsxs("div", { className: classNames('pong-help', !help && 'pong-help-hidden', className), "aria-live": 'polite', "aria-hidden": !help, children: [_jsxs("p", { className: 'pong-help-goal', children: ["First to ", _jsx("strong", { className: 'pong-help-goal-score', children: winningScore }), " wins"] }), _jsxs("div", { className: 'pong-help-list', children: [_jsx("dl", { className: 'pong-help-keys', children: rows.map(({ action, label }) => {
                                    const bound = keysFor(keys, action);
                                    if (bound.length === 0)
                                        return null;
                                    return (_jsxs("div", { className: 'pong-help-row', children: [_jsx("dt", { className: 'pong-help-key', children: bound.map((key) => _jsx("kbd", { className: 'pong-help-cap', children: keyLabel(key) }, key)) }), _jsx("dd", { className: 'pong-help-action', children: label })] }, action));
                                }) }), _jsx("p", { className: 'pong-hint pong-help-heading', children: "Advanced" }), _jsx("dl", { className: 'pong-help-tips', children: tips.map(({ term, text }) => (_jsxs("div", { className: 'pong-help-row', children: [_jsx("dt", { className: 'pong-help-term', children: term }), _jsx("dd", { className: 'pong-help-action', children: text })] }, term))) })] }), closers.length > 0 && _jsxs("p", { className: 'pong-hint', children: ["press ", closers.join(' or '), " to close"] })] })] }));
};
//# sourceMappingURL=Help.js.map