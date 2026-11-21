export type CourtProps = {
    className?: string;
    /** Names the court for assistive technology. Default `'Pong court'`. */
    'aria-label'?: string;
    /** Focus the court when it mounts, so the keys work without a click. For pages the game owns. Default `false`. */
    autoFocus?: boolean;
};
/**
 * The playfield: a focusable box holding the ball and both paddles. Keys reach
 * the game only while it has focus; clicking it focuses it. On the impossible
 * difficulty the AI's paddle pulses.
 */
export declare const Court: ({ className, "aria-label": ariaLabel, autoFocus }: CourtProps) => import("react").JSX.Element;
//# sourceMappingURL=Court.d.ts.map