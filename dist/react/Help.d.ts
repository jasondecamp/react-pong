export type HelpProps = {
    /** Added to the overlay. */
    className?: string;
};
/**
 * Just above the score, the current difficulty in its own color (between
 * games, when it can be changed) and a hint pointing to the help. The help is
 * an overlay headed by the score to play to, listing every key the game
 * handles, read from the current key map, and then how the paddle shapes a
 * shot. The help key opens it, pausing a rally, and the help or reset key
 * closes it.
 */
export declare const Help: ({ className }: HelpProps) => import("react").JSX.Element;
//# sourceMappingURL=Help.d.ts.map