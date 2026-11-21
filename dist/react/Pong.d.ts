import type { ReactNode } from 'react';
import type { PongOptions } from '../core/types.js';
export type PongProps = PongOptions & {
    /** Added to the root element, which is where to set the `--pong-*` custom properties. */
    className?: string;
    /** The arrangement. Default: `<Pong.Court />`, `<Pong.Score />`, `<Pong.Message />`, and `<Pong.Help />`. */
    children?: ReactNode;
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
export declare const Pong: {
    ({ className, children, ...options }: PongProps): import("react").JSX.Element;
    Court: ({ className, "aria-label": ariaLabel, autoFocus }: import("./Court.js").CourtProps) => import("react").JSX.Element;
    Score: ({ className }: import("./Score.js").ScoreProps) => import("react").JSX.Element;
    Message: ({ className }: import("./Message.js").MessageProps) => import("react").JSX.Element;
    Help: ({ className }: import("./Help.js").HelpProps) => import("react").JSX.Element;
};
//# sourceMappingURL=Pong.d.ts.map