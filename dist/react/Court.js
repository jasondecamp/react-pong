import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import classNames from 'classnames';
import { useContext, useEffect, useRef } from 'react';
import { PongContext } from './PongContext.js';
import { usePongGame } from './usePongGame.js';
// The ghosts in the ball's trail: enough for each to finish fading before the ball leaves it again.
const trailGhosts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** Whether `side` is one point from winning a game that is under way. */
const atGamePoint = ({ phase, scores, winningScore }, side) => (phase !== 'start' && phase !== 'gameOver' && scores[side] === winningScore - 1);
/**
 * The playfield: a focusable box holding the ball and both paddles. Keys reach
 * the game only while it has focus; clicking it focuses it. A paddle one point
 * from winning glows, and on the impossible difficulty the AI's paddle pulses
 * the whole time.
 */
export const Court = ({ className, 'aria-label': ariaLabel = 'Pong court', autoFocus = false }) => {
    const store = useContext(PongContext);
    const game = usePongGame();
    const courtRef = useRef(null);
    const ballRef = useRef(null);
    const ballColorRef = useRef(null);
    const leftPaddleRef = useRef(null);
    const rightPaddleRef = useRef(null);
    const leftRippleRef = useRef(null);
    const rightRippleRef = useRef(null);
    const trailRef = useRef(null);
    useEffect(() => {
        const court = courtRef.current;
        const ball = ballRef.current;
        const leftPaddle = leftPaddleRef.current;
        const rightPaddle = rightPaddleRef.current;
        if (court == null || ball == null || leftPaddle == null || rightPaddle == null)
            return undefined;
        return store.attach({
            court,
            ball,
            ballColor: ballColorRef.current,
            leftPaddle,
            rightPaddle,
            leftRipple: leftRippleRef.current,
            rightRipple: rightRippleRef.current,
            trail: trailRef.current,
        });
    }, [store]);
    useEffect(() => {
        if (autoFocus)
            courtRef.current?.focus({ preventScroll: true });
    }, [autoFocus]);
    return (_jsxs("div", { ref: courtRef, className: classNames('pong-court', className), role: 'application', "aria-label": ariaLabel, tabIndex: 0, children: [_jsx("div", { ref: leftRippleRef, className: 'pong-ripple pong-ripple-left', "aria-hidden": true }), _jsx("div", { ref: rightRippleRef, className: 'pong-ripple pong-ripple-right', "aria-hidden": true }), _jsx("div", { ref: trailRef, className: 'pong-trail', "aria-hidden": true, children: trailGhosts.map((ghost) => (_jsx("div", { className: 'pong-ball', children: _jsx("div", { className: 'pong-ball-color' }) }, ghost))) }), _jsx("div", { ref: ballRef, className: 'pong-ball', "aria-hidden": true, children: _jsx("div", { ref: ballColorRef, className: 'pong-ball-color' }) }), _jsx("div", { ref: leftPaddleRef, className: classNames('pong-paddle', 'pong-paddle-left', game.difficulty === 'impossible' && 'pong-paddle-pulsing', atGamePoint(game, 'left') && 'pong-paddle-game-point'), "aria-hidden": true }), _jsx("div", { ref: rightPaddleRef, className: classNames('pong-paddle', 'pong-paddle-right', atGamePoint(game, 'right') && 'pong-paddle-game-point'), "aria-hidden": true })] }));
};
//# sourceMappingURL=Court.js.map