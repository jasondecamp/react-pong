/** A paddle held in one direction keeps gaining speed for this long, in seconds. */
export declare const maxHold = 2;
/**
 * A paddle's speed after `held` seconds moving in one direction, as a multiple
 * of its starting speed. It eases in from 0 to 1 over the first moments, and
 * on top of that gains 1 for every second held.
 */
export declare const paddleRate: (held: number) => number;
/**
 * How far a paddle gets in its first `time` seconds from a standstill, in
 * seconds of travel at its starting speed: `paddleRate` summed over that time.
 */
export declare const paddleTravel: (time: number) => number;
//# sourceMappingURL=paddle.d.ts.map