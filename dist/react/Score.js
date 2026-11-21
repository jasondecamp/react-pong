import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import classNames from 'classnames';
import { usePongGame } from './usePongGame.js';
/** The two scores, AI on the left. The winner's is highlighted. */
export const Score = ({ className }) => {
    const { scores, winner } = usePongGame();
    return (_jsxs("div", { className: classNames('pong-score', className), children: [_jsx("span", { className: classNames('pong-score-side', winner === 'left' && 'pong-score-winner'), children: scores.left }), _jsx("span", { className: 'pong-score-divider', children: ":" }), _jsx("span", { className: classNames('pong-score-side', winner === 'right' && 'pong-score-winner'), children: scores.right })] }));
};
//# sourceMappingURL=Score.js.map