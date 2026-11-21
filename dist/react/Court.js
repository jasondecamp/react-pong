import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import classNames from 'classnames';
import { useContext, useEffect, useRef } from 'react';
import { PongContext } from './PongContext.js';
import { usePongGame } from './usePongGame.js';
/**
 * The playfield: a focusable box holding the ball and both paddles. Keys reach
 * the game only while it has focus; clicking it focuses it. On the impossible
 * difficulty the AI's paddle pulses.
 */
export const Court = ({ className, 'aria-label': ariaLabel = 'Pong court', autoFocus = false }) => {
    const store = useContext(PongContext);
    const { difficulty } = usePongGame();
    const courtRef = useRef(null);
    const ballRef = useRef(null);
    const leftPaddleRef = useRef(null);
    const rightPaddleRef = useRef(null);
    const leftRippleRef = useRef(null);
    const rightRippleRef = useRef(null);
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
            leftPaddle,
            rightPaddle,
            leftRipple: leftRippleRef.current,
            rightRipple: rightRippleRef.current,
        });
    }, [store]);
    useEffect(() => {
        if (autoFocus)
            courtRef.current?.focus({ preventScroll: true });
    }, [autoFocus]);
    return (_jsxs("div", { ref: courtRef, className: classNames('pong-court', className), role: 'application', "aria-label": ariaLabel, tabIndex: 0, children: [_jsx("div", { ref: leftRippleRef, className: 'pong-ripple pong-ripple-left', "aria-hidden": true }), _jsx("div", { ref: rightRippleRef, className: 'pong-ripple pong-ripple-right', "aria-hidden": true }), _jsx("div", { ref: ballRef, className: 'pong-ball', "aria-hidden": true }), _jsx("div", { ref: leftPaddleRef, className: classNames('pong-paddle', 'pong-paddle-left', difficulty === 'impossible' && 'pong-paddle-pulsing'), "aria-hidden": true }), _jsx("div", { ref: rightPaddleRef, className: 'pong-paddle pong-paddle-right', "aria-hidden": true })] }));
};
//# sourceMappingURL=Court.js.map