// @vitest-environment node
import { aiAim, aiDestination, aiDirection, aiProfiles, aiShot, aiSwinging, aiTarget } from './ai.js';
import { createSimulation } from './simulation.js';

const profile = aiProfiles.normal;
const { easy, hard, impossible } = aiProfiles;

// An 800×400 court with 15px pieces and 60px paddles, centered at y = 170.
const court = () => {
  const { state, setBounds } = createSimulation(() => 0.5);
  setBounds(800, 400, 15, 15, 15, 60);
  return state;
};

/** A random source that returns each value in turn, then 0.99 (every chance fails). */
const rolls = (...values: number[]) => {
  let index = 0;
  return () => values[index++] ?? 0.99;
};

describe('aiDirection', () => {
  it('chases a ball that is about to get past it', () => {
    const state = court();
    state.ball.x = 20;
    state.ball.y = 300;
    expect(aiDirection(state, 'left', profile, rolls(0))).toBe(1);
    state.ball.y = 50;
    expect(aiDirection(state, 'left', profile, rolls(0))).toBe(-1);
  });

  it('tracks a ball inside its zone', () => {
    const state = court();
    state.ball.x = 150;
    state.ball.y = 300;
    expect(aiDirection(state, 'left', profile, rolls(0))).toBe(1);
  });

  it('usually ignores a ball that is far away', () => {
    const state = court();
    state.ball.x = 600;
    state.ball.y = 300;
    expect(aiDirection(state, 'left', profile, rolls(0.5))).toBe(0);
  });

  it('now and then wanders toward a far ball', () => {
    const state = court();
    state.ball.x = 600;
    state.ball.y = 300;
    expect(aiDirection(state, 'left', profile, rolls(0.01))).toBe(1);
  });

  it('sometimes gives up on a ball in its zone', () => {
    const state = court();
    state.ball.x = 150;
    state.ball.y = 300;
    expect(aiDirection(state, 'left', profile, rolls(0.97, 0.5))).toBe(0);
  });

  it('does not set off after a ball level with its paddle', () => {
    const state = court();
    state.ball.x = 150;
    state.ball.y = 200;
    expect(aiDirection(state, 'left', profile, rolls(0))).toBe(0);
  });

  it('keeps going toward a level ball it is already chasing', () => {
    const state = court();
    state.ball.x = 150;
    state.ball.y = 200;
    state.left.direction = 1;
    expect(aiDirection(state, 'left', profile, rolls(0))).toBe(1);
  });

  it('reacts in the nearest third on easy, its own half on normal, and the nearest two thirds on hard', () => {
    const state = court();
    state.ball.y = 300;
    state.ball.x = 450;
    expect(aiDirection(state, 'left', hard, rolls(0.5))).toBe(1);
    expect(aiDirection(state, 'left', profile, rolls(0.5))).toBe(0);
    state.ball.x = 300;
    expect(aiDirection(state, 'left', profile, rolls(0.5))).toBe(1);
    expect(aiDirection(state, 'left', easy, rolls(0.5))).toBe(0);
    state.ball.x = 200;
    expect(aiDirection(state, 'left', easy, rolls(0.5))).toBe(1);
  });

  it('heads for the place it chose to wait while the ball travels away, and stops there', () => {
    const state = court();
    state.ball.x = 20;
    state.ball.y = 300;
    state.ball.heading = 1;
    state.left.target = 40;
    expect(aiDirection(state, 'left', profile, rolls(0))).toBe(-1);
    state.left.target = 300;
    expect(aiDirection(state, 'left', profile, rolls(0))).toBe(1);
    state.left.y = 300;
    expect(aiDirection(state, 'left', profile, rolls(0))).toBe(0);
  });

  it('keeps to that place while the ball comes back, until the ball enters its zone', () => {
    const state = court();
    state.ball.heading = -1;
    state.ball.y = 300;
    state.left.target = 40;
    state.ball.x = 600;
    expect(aiDirection(state, 'left', profile, rolls(0))).toBe(-1);
    state.ball.x = 300;
    expect(aiDirection(state, 'left', profile, rolls(0))).toBe(1);
  });

  it('plays the right side by the distance to the right edge', () => {
    const state = court();
    state.ball.x = 700;
    state.ball.y = 300;
    expect(aiDirection(state, 'right', profile, rolls(0))).toBe(1);
    expect(aiDirection(state, 'left', profile, rolls(0.5))).toBe(0);
  });
});

describe('aiTarget', () => {
  // The ball leaves the left paddle's face (x = 15) from y = 100 and crosses 755px to the right one (x = 770).
  const leaving = (angleDegrees: number) => {
    const state = court();
    Object.assign(state.ball, { x: 15, y: 100, heading: 1, angle: angleDegrees * Math.PI / 180 });
    return state;
  };

  it('on easy, lines up with where the ball will reach the opponent', () => {
    // Level: it arrives at y = 100, so the 60px paddle centers on the 15px ball at 77.5.
    expect(aiTarget(leaving(0), 'left', easy, rolls())).toBeCloseTo(77.5);
    // Falling 45 degrees: 755px down from 100 folds off the floor (385) and the ceiling to 85.
    expect(aiTarget(leaving(45), 'left', easy, rolls())).toBeCloseTo(62.5);
  });

  it('on hard, lines up with where an unaltered return will come back to', () => {
    expect(aiTarget(leaving(0), 'left', hard, rolls())).toBeCloseTo(77.5);
    // Falling 45 degrees: 1510px down from 100 folds back to 70.
    expect(aiTarget(leaving(45), 'left', hard, rolls())).toBeCloseTo(47.5);
    // Climbing 45 degrees: 1510px up from 100 folds back to 130.
    expect(aiTarget(leaving(-45), 'left', hard, rolls())).toBeCloseTo(107.5);
  });

  it('on normal, picks anywhere along its travel', () => {
    expect(aiTarget(leaving(45), 'left', profile, rolls(0))).toBe(0);
    expect(aiTarget(leaving(45), 'left', profile, rolls(0.5))).toBe(170);
  });

  it('never asks the paddle to leave the court', () => {
    const state = leaving(0);
    state.ball.y = 0;
    expect(aiTarget(state, 'left', easy, rolls())).toBe(0);
    state.ball.y = 385;
    expect(aiTarget(state, 'left', easy, rolls())).toBe(340);
  });
});

describe('aiShot', () => {
  it('sometimes goes for a corner, often for a swing, otherwise for a square hit', () => {
    const state = court();
    expect(aiShot(state, profile, rolls(0.1, 0.2))).toBe('top');
    expect(aiShot(state, profile, rolls(0.1, 0.8))).toBe('bottom');
    expect(aiShot(state, profile, rolls(0.3, 0.2))).toBe('up');
    expect(aiShot(state, profile, rolls(0.3, 0.8))).toBe('down');
    expect(aiShot(state, profile, rolls(0.9))).toBe('center');
  });

  // A ball leaving the right paddle's face at mid-height, slanted by `degrees`.
  const sent = (degrees: number) => {
    const state = court();
    Object.assign(state.ball, { x: 770, y: 192.5, speed: 500, heading: -1, angle: (degrees * Math.PI) / 180 });
    return state;
  };

  it('swings against a steep ball, to flatten its path', () => {
    // At 20 degrees down it drops 275px over the 755px crossing and arrives still falling, without a wall.
    expect(aiShot(sent(20), profile, rolls(0.3, 0.8))).toBe('down');
    // At 35 degrees down it meets the floor once on the way and arrives rising, so the swing goes down.
    expect(aiShot(sent(35), profile, rolls(0.3, 0.2))).toBe('down');
    expect(aiShot(sent(-35), profile, rolls(0.3, 0.8))).toBe('up');
    // At 60 degrees it meets the floor, the ceiling, and the floor again, and arrives rising.
    expect(aiShot(sent(60), profile, rolls(0.3, 0.2))).toBe('down');
  });

  it('still goes for a corner or a square hit on a steep ball', () => {
    expect(aiShot(sent(60), profile, rolls(0.1, 0.2))).toBe('top');
    expect(aiShot(sent(60), profile, rolls(0.9))).toBe('center');
  });
});

describe('impossible', () => {
  // A ball at mid-height, 500px/s along its path, slanted down by 30 degrees.
  const slanted = (x: number, heading: -1 | 1) => {
    const state = court();
    Object.assign(state.ball, { x, y: 192.5, speed: 500, heading, angle: Math.PI / 6 });
    return state;
  };

  it('makes for where the ball will arrive, walls included, however far away it is', () => {
    // 755px from the left face, falling 435.9px on the way: off the floor at 385 and back up to 141.6.
    // The middle of the 60px paddle goes level with the middle of the ball.
    expect(aiDestination(slanted(770, -1), 'left', impossible)).toBeCloseTo(119.1, 0);
    // Normal only looks 0.2s ahead, so from there it is still following the ball down.
    expect(aiDestination(slanted(770, -1), 'left', profile)).toBeCloseTo(220, 0);
  });

  it('sets off at once, with no zone to wait for and no hesitation', () => {
    const state = slanted(770, -1);
    expect(aiDirection(state, 'left', impossible, rolls())).toBe(-1);
    expect(aiDirection(state, 'left', profile, rolls())).toBe(0);
  });

  it('waits where a plain return would come back to while the ball is going away', () => {
    const state = slanted(392.5, 1);
    state.left.shot = 'top';
    state.left.target = 300;
    // Half a crossing out and a whole one back: 1132.5px across, falling 653.8px, folded to 76.3.
    expect(aiDestination(state, 'left', impossible)).toBeCloseTo(53.8, 0);
  });

  it('aims exactly', () => {
    expect(aiAim(impossible, rolls(0))).toBeCloseTo(0);
    expect(aiAim(impossible, rolls(1))).toBeCloseTo(0);
  });
});

describe('aiAim', () => {
  it('is off by up to the difficulty\'s aiming error either way, and by more the easier it is', () => {
    expect(aiAim(easy, rolls(0))).toBeCloseTo(-0.175);
    expect(aiAim(easy, rolls(1))).toBeCloseTo(0.175);
    expect(aiAim(profile, rolls(1))).toBeCloseTo(0.1);
    expect(aiAim(hard, rolls(1))).toBeCloseTo(0.04);
    expect(aiAim(hard, rolls(0.5))).toBe(0);
  });
});

describe('aiDestination', () => {
  // A level ball at y = 200 coming at the left paddle at 500px/s, from `x`.
  const incoming = (x: number, shot: 'center' | 'top' | 'bottom' | 'up' | 'down') => {
    const state = court();
    Object.assign(state.ball, { x, y: 200, speed: 500, heading: -1, angle: 0 });
    state.left.shot = shot;
    return state;
  };

  it('puts the middle of the paddle on the ball for a square hit', () => {
    expect(aiDestination(incoming(300, 'center'), 'left', profile)).toBeCloseTo(177.5);
  });

  it('puts a corner of the paddle on the ball for a corner shot', () => {
    expect(aiDestination(incoming(300, 'top'), 'left', profile)).toBeCloseTo(203.75);
    expect(aiDestination(incoming(300, 'bottom'), 'left', profile)).toBeCloseTo(151.25);
  });

  it('is off the mark by its aiming error, as a fraction of the paddle\'s height', () => {
    const high = incoming(300, 'center');
    high.left.aim = -0.2;
    // The ball lands 12px above the middle of the 60px paddle, so the paddle sits 12px lower.
    expect(aiDestination(high, 'left', profile)).toBeCloseTo(189.5);
    const low = incoming(300, 'top');
    low.left.aim = 0.2;
    expect(aiDestination(low, 'left', profile)).toBeCloseTo(191.75);
  });

  it('knows when its swing is due', () => {
    // 0.3s out, then 0.15s out, with a swing lead of 0.2s.
    expect(aiSwinging(incoming(165, 'down'), 'left', profile)).toBe(false);
    expect(aiSwinging(incoming(90, 'down'), 'left', profile)).toBe(true);
    expect(aiSwinging(incoming(90, 'center'), 'left', profile)).toBe(false);
  });

  it('hangs back for a swing, by the distance it will cover on the way in', () => {
    // Easing in over 0.2s at 1.2 court heights per second covers 80px.
    expect(aiDestination(incoming(300, 'down'), 'left', profile)).toBeCloseTo(97.5);
    expect(aiDestination(incoming(300, 'up'), 'left', profile)).toBeCloseTo(257.5);
  });

  it('has nowhere to stop once the swing has begun', () => {
    // 0.05s out, a paddle that hung back is still 28px short of where it will meet the ball.
    const state = incoming(40, 'down');
    state.left.y = 150;
    expect(aiDestination(state, 'left', profile)).toBeNull();
    expect(aiDirection(state, 'left', profile, rolls(0))).toBe(1);
  });

  it('holds off a swing it has got too far ahead of', () => {
    const state = incoming(40, 'down');
    state.left.y = 175;
    expect(aiDirection(state, 'left', profile, rolls(0))).toBe(-1);
  });

  it('is the place it chose to wait while the ball is away', () => {
    const state = incoming(300, 'center');
    state.ball.heading = 1;
    state.left.target = 40;
    expect(aiDestination(state, 'left', profile)).toBe(40);
  });
});
