import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import classNames from 'classnames';
import { useEffect, useState } from 'react';
import { Court } from './Court.js';
import { Help } from './Help.js';
import { Message } from './Message.js';
import { PongContext } from './PongContext.js';
import { createPongStore } from './pongStore.js';
import { Score } from './Score.js';
const themeClasses = {
    system: undefined,
    light: 'pong-light',
    dark: 'pong-dark',
};
/**
 * A game of Pong that fills its parent; size the parent. Every other prop is a
 * game option, and options are live: change a prop and only that option
 * updates.
 *
 *   <Pong smack>
 *     <Pong.Court />
 *     <Pong.Score />
 *     <Pong.Message />
 *     <Pong.Help />
 *   </Pong>
 */
export const Pong = ({ className, theme = 'system', children, ...options }) => {
    const [store] = useState(createPongStore);
    useEffect(() => {
        store.sync(options);
    });
    return (_jsx(PongContext, { value: store, children: _jsx("div", { className: classNames('pong', themeClasses[theme], className), children: children ?? (_jsxs(_Fragment, { children: [_jsx(Court, {}), _jsx(Score, {}), _jsx(Message, {}), _jsx(Help, {})] })) }) }));
};
Pong.Court = Court;
Pong.Score = Score;
Pong.Message = Message;
Pong.Help = Help;
//# sourceMappingURL=Pong.js.map