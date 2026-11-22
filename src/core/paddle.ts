// How a paddle picks up speed, shared by the simulation (which moves the
// paddles) and the AI (which times its swings by it).

/** A paddle held in one direction keeps gaining speed for this long, in seconds. */
export const maxHold = 2;

// A paddle eases in from a standstill to its starting speed over this long,
// in seconds, rather than jumping to it.
const easeTime = 0.08;

/**
 * A paddle's speed after `held` seconds moving in one direction, as a multiple
 * of its starting speed. It eases in from 0 to 1 over the first moments, and
 * on top of that gains 1 for every second held.
 */
export const paddleRate = (held: number) => {
  const ease = Math.min(1, held / easeTime);
  return ease * ease + held;
};

/**
 * How far a paddle gets in its first `time` seconds from a standstill, in
 * seconds of travel at its starting speed: `paddleRate` summed over that
 * time, with no more speed gained once it has been held for `maxHold`.
 */
export const paddleTravel = (time: number): number => {
  if (time <= 0) return 0;
  if (time > maxHold) return paddleTravel(maxHold) + (time - maxHold) * paddleRate(maxHold);
  const eased = time < easeTime
    ? (time * time * time) / (3 * easeTime * easeTime)
    : easeTime / 3 + (time - easeTime);
  return eased + (time * time) / 2;
};
