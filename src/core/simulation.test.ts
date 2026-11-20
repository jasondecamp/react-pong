// @vitest-environment node
import { seededRandom } from '../test/seededRandom.js';
import { createSimulation } from './simulation.js';
import type { Simulation } from './simulation.js';

// An 800×400 court with 15px pieces and 60px paddles. Paddles rest at y = 170;
// the ball meets the left paddle at x = 15 and the right one at x = 770.
const court = (random: () => number = seededRandom(1)) => {
  const simulation = createSimulation(random);
  simulation.setBounds(800, 400, 15, 15, 15, 60);
  return simulation;
};

const degrees = Math.PI / 180;

/** The ball's speed, heading, and angle for a velocity in px per second. */
const path = (vx: number, vy: number) => ({
  speed: Math.hypot(vx, vy),
  heading: vx < 0 ? -1 : 1,
  angle: Math.atan2(vy, Math.abs(vx)),
});

/** Put a rally in a known position, moving at a known velocity. */
const rally = (simulation: Simulation, x: number, y: number, vx: number, vy: number) => {
  simulation.serve();
  Object.assign(simulation.state.ball, { x, y, ...path(vx, vy) });
};

/** Step in 60Hz frames until the phase changes, collecting every event. */
const play = (simulation: Simulation, maxSeconds = 30) => {
  const { state } = simulation;
  const phase = state.phase;
  const events: string[] = [];
  for (let frame = 0; frame < maxSeconds * 60 && state.phase === phase; frame++) {
    events.push(...simulation.step(1 / 60, 0));
  }
  return events;
};

describe('simulation', () => {
  it('opens on the start screen with centered paddles and the ball off the court', () => {
    const { state } = court();
    expect(state.phase).toBe('start');
    expect(state.left.y).toBe(170);
    expect(state.right.y).toBe(170);
    expect(state.ball.x).toBeLessThan(-state.ballWidth);
  });

  it('does nothing before the court has a size', () => {
    const simulation = createSimulation(seededRandom(1));
    simulation.serve();
    expect(simulation.state.phase).toBe('start');
    expect(simulation.step(0.016, 1)).toEqual([]);
  });

  describe('serve', () => {
    it('sends the first serve from a random side, away from its paddle', () => {
      const fromLeft = court(() => 0.2);
      fromLeft.serve();
      expect(fromLeft.state.phase).toBe('rally');
      expect(fromLeft.state.ball.x).toBe(15);
      expect(fromLeft.state.ball.heading).toBe(1);

      const fromRight = court(() => 0.8);
      fromRight.serve();
      expect(fromRight.state.ball.x).toBe(770);
      expect(fromRight.state.ball.heading).toBe(-1);
    });

    it('travels within a tenth of the serve speed and 30 degrees of level', () => {
      const speeds = new Set<number>();
      const angles = new Set<number>();
      for (let seed = 1; seed <= 20; seed++) {
        const simulation = court(seededRandom(seed));
        simulation.serve();
        const { speed, angle } = simulation.state.ball;
        expect(speed).toBeGreaterThanOrEqual(468);
        expect(speed).toBeLessThanOrEqual(572);
        expect(Math.abs(angle)).toBeLessThanOrEqual(30 * degrees);
        speeds.add(speed);
        angles.add(angle);
      }
      expect(speeds.size).toBe(20);
      expect(angles.size).toBe(20);
    });

    it('starts level with the middle of the server\'s paddle', () => {
      const simulation = court(() => 0.2);
      simulation.state.left.y = 40;
      simulation.serve();
      expect(simulation.state.ball.y).toBe(40 + (60 - 15) / 2);
    });

    it('is ignored during a rally', () => {
      const simulation = court();
      rally(simulation, 400, 100, 300, 0);
      simulation.serve();
      expect(simulation.state.ball.x).toBe(400);
    });
  });

  describe('ball', () => {
    it('moves by time, not by frame', () => {
      const one = court();
      const two = court();
      rally(one, 300, 100, 200, 50);
      rally(two, 300, 100, 200, 50);
      one.step(0.02, 0);
      two.step(0.01, 0);
      two.step(0.01, 0);
      expect(two.state.ball.x).toBeCloseTo(one.state.ball.x);
      expect(two.state.ball.y).toBeCloseTo(one.state.ball.y);
      expect(one.state.ball.x).toBeCloseTo(304);
    });

    it('clamps a long step so the ball does not teleport', () => {
      const simulation = court();
      rally(simulation, 300, 100, 200, 0);
      simulation.step(5, 0);
      expect(simulation.state.ball.x).toBeCloseTo(310);
    });

    it('bounces off the top and bottom walls', () => {
      const simulation = court();
      rally(simulation, 300, 5, 0.001, -500);
      expect(simulation.step(0.02, 0)).toEqual(['wall']);
      expect(simulation.state.ball.angle).toBeCloseTo(90 * degrees);
      expect(simulation.state.ball.speed).toBeCloseTo(500);
      expect(simulation.state.ball.y).toBeCloseTo(5);

      Object.assign(simulation.state.ball, { x: 300, y: 380, ...path(0.001, 500) });
      expect(simulation.step(0.02, 0)).toEqual(['wall']);
      expect(simulation.state.ball.angle).toBeCloseTo(-90 * degrees);
      expect(simulation.state.ball.speed).toBeCloseTo(500);
      expect(simulation.state.ball.y).toBeCloseTo(380);
    });

    it('comes back off a paddle 5% faster', () => {
      const simulation = court();
      rally(simulation, 760, 190, 500, 0);
      expect(simulation.step(0.03, 0)).toEqual(['paddle']);
      expect(simulation.state.ball.heading).toBe(-1);
      expect(simulation.state.ball.speed).toBeCloseTo(525);
      expect(Math.abs(simulation.state.ball.angle)).toBeLessThanOrEqual(3 * degrees);
      expect(simulation.state.ball.x).toBeLessThan(770);
      expect(simulation.state.phase).toBe('rally');
      // The ball's right side, at mid-height, on the paddle's face.
      expect(simulation.state.contact).toEqual({ side: 'right', x: 785, y: 197.5 });
    });

    it('cannot tunnel through a paddle however fast it goes', () => {
      const simulation = court();
      rally(simulation, 400, 190, 20000, 0);
      expect(simulation.step(0.05, 0)).toEqual(['paddle']);
      expect(simulation.state.ball.heading).toBe(-1);
      expect(simulation.state.ball.speed).toBeCloseTo(21000);
      expect(simulation.state.ball.x).toBeLessThan(770);
    });

    it('scores for the other side when it gets past a paddle', () => {
      const simulation = court();
      rally(simulation, 760, 20, 500, 0);
      const events = play(simulation);
      expect(events).toEqual(['point']);
      expect(simulation.state.scores).toEqual({ left: 1, right: 0 });
      expect(simulation.state.scorer).toBe('left');
      expect(simulation.state.phase).toBe('between');
      expect(simulation.state.ball.x).toBe(785);
    });

    it('keeps its speed whatever its angle', () => {
      const simulation = court();
      rally(simulation, 400, 190, 300, 400);
      const events: string[] = [];
      for (let frame = 0; frame < 120 && !events.includes('paddle'); frame++) {
        simulation.state.right.y = simulation.state.ball.y - 20;
        events.push(...simulation.step(1 / 60, 0));
      }
      expect(events).toContain('wall');
      expect(simulation.state.ball.speed).toBeCloseTo(525);
    });

    /** A level ball meeting the middle of the right paddle while the paddle is steered in `input`. */
    const struck = (input: -1 | 0 | 1) => {
      const simulation = court();
      rally(simulation, 700, 190, 500, 0);
      simulation.state.right.y = 170;
      const events: string[] = [];
      for (let frame = 0; frame < 30 && !events.includes('paddle'); frame++) {
        simulation.state.ball.y = simulation.state.right.y + 22.5;
        events.push(...simulation.step(1 / 60, input));
      }
      expect(events).toContain('paddle');
      return simulation.state.ball;
    };

    it('is dragged along by a moving paddle, in proportion to the paddle\'s velocity', () => {
      // About 0.15s in, the paddle moves at some 500px/s; half of that against 500px/s across is near 27 degrees.
      expect(struck(1).angle).toBeGreaterThan(20 * degrees);
      expect(struck(1).angle).toBeLessThan(34 * degrees);
      expect(struck(-1).angle).toBeLessThan(-20 * degrees);
      expect(Math.abs(struck(0).angle)).toBeLessThanOrEqual(3 * degrees);
      expect(struck(1).speed).toBeCloseTo(525);
    });

    it('takes nothing from a paddle pinned against a wall', () => {
      const simulation = court();
      rally(simulation, 760, 360, 500, 0);
      simulation.state.right.y = 340;
      simulation.state.right.direction = 1;
      simulation.state.right.held = 2;
      expect(simulation.step(0.03, 1)).toEqual(['paddle']);
      expect(Math.abs(simulation.state.ball.angle)).toBeLessThanOrEqual(3 * degrees);
    });

    it('leaves steeply for the ceiling off the top edge of a paddle, and for the floor off the bottom', () => {
      const simulation = court();
      // Falling toward the paddle, but catching its top corner.
      rally(simulation, 760, 150, 500, 500);
      expect(simulation.step(0.03, 0)).toEqual(['paddle']);
      expect(simulation.state.ball.angle).toBeLessThanOrEqual(-67 * degrees);
      expect(simulation.state.ball.angle).toBeGreaterThanOrEqual(-73 * degrees);

      Object.assign(simulation.state.ball, { x: 760, y: 220, ...path(500, 0) });
      expect(simulation.step(0.03, 0)).toEqual(['paddle']);
      expect(simulation.state.ball.angle).toBeGreaterThanOrEqual(67 * degrees);
      expect(simulation.state.ball.angle).toBeLessThanOrEqual(73 * degrees);
    });

    it('is knocked back steeply by the end of a paddle that runs into it behind the face', () => {
      const above = court();
      // Level with the paddle's face and just above its top, with the paddle on its way up.
      rally(above, 772, 150, 100, 0);
      above.state.right.direction = -1;
      above.state.right.held = 1;
      expect(above.step(1 / 60, -1)).toEqual(['paddle']);
      expect(above.state.ball.heading).toBe(-1);
      expect(above.state.ball.angle).toBeCloseTo(-80 * degrees);
      expect(above.state.ball.speed).toBeCloseTo(105);
      // The bottom of the ball, on the top end of the paddle.
      expect(above.state.contact.side).toBe('right');
      expect(above.state.contact.y).toBeCloseTo(165);
      expect(above.state.contact.x).toBeGreaterThan(777);
      expect(above.state.contact.x).toBeLessThan(785);
      expect(play(above, 1)).not.toContain('point');

      const below = court();
      rally(below, 772, 235, 100, 0);
      below.state.right.direction = 1;
      below.state.right.held = 1;
      expect(below.step(1 / 60, 1)).toEqual(['paddle']);
      expect(below.state.ball.heading).toBe(-1);
      expect(below.state.ball.angle).toBeCloseTo(80 * degrees);
    });

    it('is caught behind the face however far the paddle moves in one step', () => {
      const simulation = court();
      rally(simulation, 772, 100, 100, 0);
      simulation.step(0.001, 0);
      // Fast enough to go from below the ball to above it in a single step.
      simulation.state.right.direction = -1;
      simulation.state.right.held = 2;
      simulation.state.paddleSpeed = 5;
      expect(simulation.step(0.05, -1)).toEqual(['paddle']);
      expect(simulation.state.right.y).toBe(0);
      expect(simulation.state.ball.angle).toBeCloseTo(-80 * degrees);
    });

    it('still gets past a paddle that stays clear of it', () => {
      const simulation = court();
      rally(simulation, 772, 150, 100, 0);
      expect(play(simulation)).toEqual(['point']);
    });

    it('never leaves a paddle steeper than 80 degrees', () => {
      const simulation = court();
      // Already at 78 degrees, and the paddle is moving the same way.
      rally(simulation, 768, 150, 100, 470);
      simulation.state.right.y = 115;
      simulation.state.right.direction = 1;
      simulation.state.right.held = 1;
      expect(simulation.step(0.03, 1)).toEqual(['paddle']);
      expect(simulation.state.ball.angle).toBeCloseTo(80 * degrees);
    });
  });

  describe('paddles', () => {
    it('ease in to the paddle speed, in court heights per second, then keep accelerating while held', () => {
      const simulation = court();
      // A quarter of a 400px court per second: 100px/s, or 1px per 10ms step.
      simulation.setOptions({ winningScore: 11, difficulty: 'normal', paddleSpeed: 0.25 });
      const moved = () => {
        const before = simulation.state.right.y;
        simulation.step(0.01, 1);
        return simulation.state.right.y - before;
      };
      const first = moved();
      expect(first).toBeGreaterThan(0);
      expect(first).toBeLessThan(0.1);
      let last = first;
      for (let step = 0; step < 7; step++) {
        const next = moved();
        expect(next).toBeGreaterThan(last);
        last = next;
      }
      // 0.08s in, it is up to its starting speed and a little more.
      expect(last).toBeCloseTo(1.08);
      for (let step = 0; step < 92; step++) last = moved();
      expect(last).toBeCloseTo(2);
    });

    it('cross a court of any size in the same time', () => {
      const small = court();
      const large = createSimulation(seededRandom(1));
      large.setBounds(1600, 800, 15, 15, 15, 120);
      small.step(0.05, 1);
      large.step(0.05, 1);
      expect(large.state.right.y - 340).toBeCloseTo((small.state.right.y - 170) * 2);
    });

    it('lose their built-up speed when they stop or turn', () => {
      const simulation = court();
      simulation.step(0.05, 1);
      simulation.step(0.05, 1);
      expect(simulation.state.right.held).toBeCloseTo(0.1);
      simulation.step(0.05, -1);
      expect(simulation.state.right.held).toBeCloseTo(0.05);
      simulation.step(0.05, 0);
      expect(simulation.state.right.held).toBe(0);
    });

    it('stop at the walls', () => {
      const simulation = court();
      for (let frame = 0; frame < 60; frame++) simulation.step(0.05, 1);
      expect(simulation.state.right.y).toBe(340);
      for (let frame = 0; frame < 60; frame++) simulation.step(0.05, -1);
      expect(simulation.state.right.y).toBe(0);
    });

    it('move between points, but not while paused', () => {
      const simulation = court();
      simulation.step(0.05, 1);
      expect(simulation.state.right.y).toBeGreaterThan(170);
      rally(simulation, 400, 100, 100, 0);
      simulation.pause();
      const y = simulation.state.right.y;
      simulation.step(0.05, 1);
      expect(simulation.state.right.y).toBe(y);
    });

    it('sends the AI paddle to wait where it chose, once it has returned the ball', () => {
      const simulation = court();
      simulation.setOptions({ winningScore: 11, difficulty: 'easy', paddleSpeed: 1.2 });
      rally(simulation, 20, 190, -500, 0);
      expect(simulation.step(0.02, 0)).toEqual(['paddle']);
      const { target } = simulation.state.left;
      expect(target).not.toBeNull();
      // Far enough from the wall that the ball's path doesn't fold: straight across at its new angle.
      const { ball } = simulation.state;
      const arrival = ball.y + Math.tan(ball.angle) * (755 - ball.x);
      expect((target ?? 0) + 22.5).toBeCloseTo(arrival, 0);
      for (let frame = 0; frame < 30; frame++) simulation.step(1 / 60, 0);
      expect(simulation.state.left.y).toBe(target);
      expect(simulation.state.left.direction).toBe(0);
    });

    /** The ball after the AI returns a level one with the shot it was told to play. */
    const returned = (shot: 'center' | 'top' | 'bottom' | 'up' | 'down') => {
      // 0.5 never gives up on a ball in its zone, and adds no random nudge to the angle.
      const simulation = court(() => 0.5);
      rally(simulation, 700, 190, -500, 0);
      simulation.state.left.shot = shot;
      const events: string[] = [];
      for (let frame = 0; frame < 120 && !events.includes('paddle'); frame++) {
        events.push(...simulation.step(1 / 60, 0));
      }
      expect(events).toEqual(['paddle']);
      return simulation.state.ball.angle;
    };

    it('lets the AI meet the ball squarely, on a corner, or on the move', () => {
      expect(returned('center')).toBeCloseTo(0);
      expect(returned('top')).toBeCloseTo(-70 * degrees);
      expect(returned('bottom')).toBeCloseTo(70 * degrees);
      expect(returned('down')).toBeGreaterThan(20 * degrees);
      expect(returned('down')).toBeLessThan(40 * degrees);
      expect(returned('up')).toBeLessThan(-20 * degrees);
      expect(returned('up')).toBeGreaterThan(-40 * degrees);
    });

    it('has the AI choose a shot when the ball is sent its way', () => {
      const simulation = court(() => 0.2);
      rally(simulation, 760, 190, 500, 0);
      simulation.state.left.shot = 'center';
      expect(simulation.step(0.03, 0)).toEqual(['paddle']);
      expect(simulation.state.left.shot).toBe('up');
    });

    it('lets the AI play the left paddle during a rally', () => {
      const simulation = court();
      rally(simulation, 100, 380, -50, 0);
      for (let frame = 0; frame < 30; frame++) simulation.step(1 / 60, 0);
      expect(simulation.state.left.y).toBeGreaterThan(170);
    });
  });

  describe('game', () => {
    it('gives the next serve to the side that scored', () => {
      const simulation = court();
      rally(simulation, 760, 20, 500, 0);
      play(simulation);
      expect(simulation.state.server).toBe('left');
      simulation.serve();
      expect(simulation.state.ball.x).toBe(15);
      expect(simulation.state.ball.heading).toBe(1);
    });

    it('lets a harder AI start moving while the ball is farther away', () => {
      const leftY = (difficulty: 'easy' | 'normal' | 'hard') => {
        const simulation = court(() => 0.5);
        simulation.setOptions({ winningScore: 11, difficulty, paddleSpeed: 1.2 });
        rally(simulation, 450, 380, -0.001, 0);
        simulation.step(0.05, 0);
        return simulation.state.left.y;
      };
      expect(leftY('normal')).toBe(170);
      expect(leftY('hard')).toBeGreaterThan(170);
    });

    it('ends when a side reaches the winning score', () => {
      const simulation = court();
      simulation.setOptions({ winningScore: 2, difficulty: 'normal', paddleSpeed: 1.2 });
      rally(simulation, 760, 20, 500, 0);
      play(simulation);
      simulation.state.right.y = 170;
      rally(simulation, 760, 20, 500, 0);
      expect(play(simulation)).toEqual(['point', 'gameOver']);
      expect(simulation.state.phase).toBe('gameOver');
      expect(simulation.state.winner).toBe('left');
      simulation.serve();
      expect(simulation.state.phase).toBe('gameOver');
    });

    it('freezes while paused and carries on after', () => {
      const simulation = court();
      rally(simulation, 300, 100, 200, 0);
      simulation.pause();
      expect(simulation.state.phase).toBe('paused');
      expect(simulation.step(0.02, 0)).toEqual([]);
      expect(simulation.state.ball.x).toBe(300);
      simulation.resume();
      simulation.step(0.02, 0);
      expect(simulation.state.ball.x).toBeCloseTo(304);
    });

    it('resets to the start screen', () => {
      const simulation = court();
      rally(simulation, 760, 20, 500, 0);
      play(simulation);
      simulation.reset();
      expect(simulation.state.phase).toBe('start');
      expect(simulation.state.scores).toEqual({ left: 0, right: 0 });
      expect(simulation.state.server).toBeNull();
      expect(simulation.state.ball.x).toBeLessThan(-15);
    });

    it('plays whole games to the winning score', () => {
      for (let seed = 1; seed <= 3; seed++) {
        const simulation = court(seededRandom(seed));
        const { state } = simulation;
        for (let point = 0; point < 40 && state.phase !== 'gameOver'; point++) {
          simulation.serve();
          play(simulation, 120);
          expect(state.ball.y).toBeGreaterThanOrEqual(0);
          expect(state.ball.y).toBeLessThanOrEqual(385);
        }
        expect(state.phase).toBe('gameOver');
        expect(Math.max(state.scores.left, state.scores.right)).toBe(11);
      }
    });
  });

  describe('resize', () => {
    it('scales positions and speeds with the court', () => {
      const simulation = court();
      rally(simulation, 400, 100, 200, 50);
      simulation.state.right.y = 340;
      simulation.setBounds(1600, 200, 15, 15, 15, 30);
      expect(simulation.state.ball).toEqual({ x: 800, y: 50, ...path(400, 100) });
      expect(simulation.state.right.y).toBe(170);
      expect(simulation.state.left.y).toBe(85);
    });

    it('keeps the ball parked on the start screen', () => {
      const simulation = court();
      simulation.setBounds(1600, 200, 20, 20, 15, 30);
      expect(simulation.state.ball.x).toBe(-40);
    });
  });
});
