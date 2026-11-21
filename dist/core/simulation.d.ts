import type { AiShot } from './ai.js';
import type { PongDifficulty, PongPhase, PongScores, Side } from './types.js';
/** Up (`-1`), still (`0`), or down (`1`). */
export type Direction = -1 | 0 | 1;
/**
 * What happened in a step. `toss` is the toss for the first serve settling on
 * a side, `count` the countdown that follows moving on a number, and `serve`
 * the ball leaving at the end of it.
 */
export type SimulationEvent = 'wall' | 'paddle' | 'point' | 'gameOver' | 'toss' | 'count' | 'serve';
export type Paddle = {
    /** Top edge, px from the top of the court. */
    y: number;
    direction: Direction;
    /** Seconds it has kept moving in `direction`, up to `maxHold`. */
    held: number;
    /** Where an AI paddle has chosen to wait, as the y of its top edge, or `null`. */
    target: number | null;
    /** How an AI paddle means to return the ball coming at it. */
    shot: AiShot;
    /** How far off the mark that return will be, as a fraction of the paddle's height: negative is high, positive low. */
    aim: number;
};
export type Ball = {
    /** Left edge, px from the left of the court. */
    x: number;
    /** Top edge, px from the top of the court. */
    y: number;
    /** How fast it travels along its path, px per second. */
    speed: number;
    /** Which paddle it is heading for: left (`-1`) or right (`1`). */
    heading: -1 | 1;
    /** Its path's slant from horizontal, in radians: negative climbs, positive falls. */
    angle: number;
};
/** Sizes in px, positions in px from the court's top-left corner. */
export type SimulationState = {
    width: number;
    height: number;
    ballWidth: number;
    ballHeight: number;
    paddleWidth: number;
    paddleHeight: number;
    /** Starting paddle speed, in court heights per second. */
    paddleSpeed: number;
    ball: Ball;
    left: Paddle;
    right: Paddle;
    /** Where the ball last touched a paddle, and whose. */
    contact: {
        side: Side;
        x: number;
        y: number;
    };
    scores: PongScores;
    phase: PongPhase;
    /** The side that serves next; `null` picks one at random. */
    server: Side | null;
    /** The number the countdown to the first serve is on, or `0` when nothing is counting. */
    countdown: number;
    /** The side that scored the last point. */
    scorer: Side | null;
    winner: Side | null;
};
export type SimulationOptions = {
    winningScore: number;
    difficulty: PongDifficulty;
    /** Court heights per second. */
    paddleSpeed: number;
};
export type Simulation = {
    /** Mutated in place by every call; read it, don't write it. */
    state: SimulationState;
    setOptions: (options: SimulationOptions) => void;
    /** Size the court and its pieces. Positions and the ball's speed scale with the court. */
    setBounds: (width: number, height: number, ballWidth: number, ballHeight: number, paddleWidth: number, paddleHeight: number) => void;
    /** Serve at once, from the start screen or between points. */
    serve: () => void;
    /**
     * From the start screen, toss for the first serve: the ball bounces between
     * the paddles (unless `animate` is false) and comes to rest on the side that
     * won it, a countdown runs, and the ball is served.
     */
    toss: (animate: boolean) => void;
    pause: () => void;
    resume: () => void;
    reset: () => void;
    /**
     * Advance by `dt` seconds with the right paddle steered in `input`. Returns
     * the events of this step in a buffer that the next step reuses.
     */
    step: (dt: number, input: Direction) => readonly SimulationEvent[];
};
/**
 * The game itself: court, ball, paddles, scores, and phase. Pure: it touches
 * no DOM and draws every random number from `random`.
 */
export declare const createSimulation: (random: () => number) => Simulation;
//# sourceMappingURL=simulation.d.ts.map