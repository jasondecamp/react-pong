import type { ReactNode } from 'react';
import type { PongOptions } from '../core/types.js';
/** Which palette the game wears: the system's light or dark setting, or one of them whatever the system says. */
export type PongTheme = 'system' | 'light' | 'dark';
export type PongProps = PongOptions & {
    /** Added to the root element, which is where to set the `--pong-*` custom properties. */
    className?: string;
    /**
     * The light or the dark palette. `'system'` follows the visitor's system setting (`prefers-color-scheme`), so
     * on a page that doesn't, set the one that matches the page. Default `'system'`.
     */
    theme?: PongTheme;
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
    ({ className, theme, children, ...options }: PongProps): import("react").JSX.Element;
    Court: ({ className, "aria-label": ariaLabel, autoFocus }: import("./Court.js").CourtProps) => import("react").JSX.Element;
    Score: ({ className }: import("./Score.js").ScoreProps) => import("react").JSX.Element;
    Message: ({ className }: import("./Message.js").MessageProps) => import("react").JSX.Element;
    Help: ({ className }: import("./Help.js").HelpProps) => import("react").JSX.Element;
};
//# sourceMappingURL=Pong.d.ts.map