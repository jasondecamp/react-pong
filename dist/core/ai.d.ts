import type { Direction, SimulationState } from './simulation.js';
import type { PongDifficulty, Side } from './types.js';
/** How an AI paddle plays. Distances are fractions of the court width, measured from the paddle's own edge. */
export type AiProfile = {
    /** Decisions per second. `Infinity` decides at every step. */
    rate: number;
    /** Within this distance of its edge the ball is urgent. */
    nearZone: number;
    /** The chance, per decision, of chasing an urgent ball without hesitating. */
    nearChance: number;
    /** Within this distance of its edge the paddle tracks the ball. */
    trackZone: number;
    /** The chance, per decision, of tracking a ball inside the track zone. */
    trackChance: number;
    /** The chance, per decision, of tracking the ball wherever it is. */
    wanderChance: number;
    /**
     * Where the paddle goes to wait once it has sent the ball away:
     * - `opponent`: level with where the ball will reach the other side, which is where the opponent should be.
     * - `random`: anywhere.
     * - `return`: where the ball will come back to, if the opponent returns it without changing its angle.
     */
    positioning: 'opponent' | 'random' | 'return';
    /** The chance that it tries to catch an incoming ball on a corner of its paddle. */
    cornerChance: number;
    /** The chance that it tries to be moving when it meets an incoming ball, to bend the ball's path. */
    swingChance: number;
    /** How long before the ball arrives a swing begins, in seconds. */
    swingLead: number;
    /**
     * How far off the mark its returns can be, as a fraction of the paddle's height: each ball sent its way gets
     * an error of up to this much either way, which shifts where on the paddle the ball lands.
     */
    aimError: number;
    /**
     * It works out where the ball will arrive, walls included, the moment the ball is hit, and goes straight
     * there, instead of following the ball once it is close. While the ball is on its way to the opponent it
     * makes for where a plain return would come back to, and never waits anywhere else.
     */
    foresight: boolean;
    /**
     * A ball sent its way on a path steeper than this, in radians, is one it tries to flatten: its swings go
     * against the ball rather than either way.
     */
    steepAngle: number;
};
/**
 * How an AI paddle means to return the ball coming at it: squarely with its
 * middle, on its top or bottom corner, or on the move, swinging up or down.
 */
export type AiShot = 'center' | 'top' | 'bottom' | 'up' | 'down';
export declare const aiProfiles: Record<PongDifficulty, AiProfile>;
/**
 * The y that the paddle on `side` is making for and should stop exactly at:
 * the place it chose to wait, or the position its shot calls for. `null`
 * while it swings, when it means to keep moving through the ball.
 */
export declare const aiDestination: (state: SimulationState, side: Side, profile: AiProfile) => number | null;
/**
 * Whether the paddle on `side` should be swinging through the ball right
 * now: it means to, and the ball is within the swing's lead of arriving.
 */
export declare const aiSwinging: (state: SimulationState, side: Side, profile: AiProfile) => boolean;
/**
 * How far off the mark the next return will be, as a fraction of the
 * paddle's height, decided along with the shot.
 */
export declare const aiAim: (profile: AiProfile, random: () => number) => number;
/**
 * How to return the ball in `state`, decided the moment the opponent sends
 * it: sometimes on a corner, often on the move, otherwise squarely. A swing
 * goes either way, unless the ball is on a steep path: then it goes against
 * the ball, which flattens the path instead of steepening it further.
 */
export declare const aiShot: (state: SimulationState, profile: AiProfile, random: () => number) => AiShot;
/**
 * Where the paddle on `side` should wait, as the y of its top edge, decided
 * the moment it sends the ball away. The ball is taken to bounce off the walls
 * and the far paddle like a mirror, keeping its angle.
 */
export declare const aiTarget: (state: SimulationState, side: Side, profile: AiProfile, random: () => number) => number;
/**
 * One decision for the paddle on `side`: the direction to move in until the
 * next decision. A pure function of the simulation state, the profile, and
 * the random source.
 */
export declare const aiDirection: (state: SimulationState, side: Side, profile: AiProfile, random: () => number) => Direction;
//# sourceMappingURL=ai.d.ts.map