// @vitest-environment node
import { seededRandom } from '../test/seededRandom.js';
import { createNetLink, standardCourt } from './net.js';
import type { NetLink, NetMessage } from './net.js';
import { createSimulation } from './simulation.js';
import type { Direction, Simulation } from './simulation.js';
import type { Side } from './types.js';

const frame = 1 / 60;

type Player = {
  simulation: Simulation;
  link: NetLink;
  /** Messages on their way to this player, each with the time it arrives. */
  mail: { message: NetMessage; due: number }[];
  /** How this player steers: the test's stand-in for a person at the keys. */
  steer: (simulation: Simulation) => Direction;
};

/** Follow a ball coming this way, and otherwise stay put. */
const follow = (simulation: Simulation): Direction => {
  const { ball, right, paddleHeight, ballHeight } = simulation.state;
  if (ball.heading !== 1 || ball.speed === 0) return 0;
  const gap = ball.y + ballHeight / 2 - (right.y + paddleHeight / 2);
  if (Math.abs(gap) < paddleHeight / 4) return 0;
  return gap > 0 ? 1 : -1;
};

const still = (): Direction => 0;

/**
 * Two games, each with itself on the right, joined by links whose messages
 * take `lag` seconds to arrive. `first` serves the first ball: `'right'` is
 * player a.
 */
const match = ({ lag = 0.05, winningScore = 3, first = 'right' as Side, seed = 1 } = {}) => {
  let now = 0;
  const players: Player[] = [];
  for (let index = 0; index < 2; index++) {
    const simulation = createSimulation(seededRandom(seed + index));
    const { width, height, ballSize, paddleWidth, paddleHeight, paddleSpeed } = standardCourt;
    simulation.setOptions({ winningScore, difficulty: 'normal', paddleSpeed, attract: true });
    simulation.setBounds(width, height, ballSize, ballSize, paddleWidth, paddleHeight);
    simulation.setRemote(true);
    const mail: Player['mail'] = [];
    players.push({ simulation, link: createNetLink(simulation, () => undefined), mail, steer: follow });
  }
  const [a, b] = players as [Player, Player];
  a.link = createNetLink(a.simulation, (message) => b.mail.push({ message, due: now + lag }));
  b.link = createNetLink(b.simulation, (message) => a.mail.push({ message, due: now + lag }));
  a.simulation.toss(false, first);
  b.simulation.toss(false, first === 'right' ? 'left' : 'right');

  /** One 60Hz frame for both players: deliver what has arrived, step, and report. */
  const tick = () => {
    now += frame;
    for (const player of players) {
      while (player.mail[0] != null && player.mail[0].due <= now + 1e-9) {
        const { message, due } = player.mail.shift() as Player['mail'][number];
        player.link.receive(message, now - due + lag);
      }
    }
    for (const player of players) {
      const { state } = player.simulation;
      if (state.phase === 'between' && state.server === 'right') player.link.serve();
      player.link.report(player.simulation.step(frame, player.steer(player.simulation)), frame);
    }
  };

  const run = (seconds: number, until: () => boolean = () => false) => {
    for (let time = 0; time < seconds && !until(); time += frame) tick();
  };

  /** No news of the ball is in the post, and neither player is waiting on the other. */
  const settled = () => players.every(({ mail, simulation }) => (
    !simulation.state.awaiting && mail.every(({ message }) => message.type === 'paddle')
  ));

  return { a, b, run, tick, settled };
};

/** Where player b's ball is, as player a's court shows it. */
const mirrored = ({ state }: Simulation) => state.width - state.ballWidth - state.ball.x;

describe('a match between two games', () => {
  it('serves from the side the toss gave, in both games', () => {
    const { a, b, run } = match({ first: 'right' });
    run(3, () => a.simulation.state.phase === 'rally' && b.simulation.state.phase === 'rally' && !b.simulation.state.awaiting);
    expect(a.simulation.state.server).toBe('right');
    expect(b.simulation.state.server).toBe('left');
    expect(a.simulation.state.ball.heading).toBe(-1);
    expect(b.simulation.state.ball.heading).toBe(1);
  });

  it('holds the ball on the other player\'s paddle until their serve arrives', () => {
    const { b, run } = match({ first: 'right', lag: 0.2 });
    run(3, () => b.simulation.state.awaiting);
    const { state } = b.simulation;
    expect(state.phase).toBe('rally');
    expect(state.ball.speed).toBe(0);
    expect(state.ball.x).toBe(state.paddleWidth);
    run(0.3);
    expect(state.awaiting).toBe(false);
    expect(state.ball.speed).toBeGreaterThan(0);
  });

  it('draws the ball in the same place for both, however long messages take', () => {
    for (const lag of [0, 0.05, 0.15]) {
      const { a, b, run, tick, settled } = match({ lag, winningScore: 50 });
      run(3, () => a.simulation.state.phase === 'rally');
      let compared = 0;
      for (let step = 0; step < 60 * 40; step++) {
        tick();
        const live = a.simulation.state.phase === 'rally' && b.simulation.state.phase === 'rally';
        if (!live || !settled()) continue;
        expect(mirrored(b.simulation)).toBeCloseTo(a.simulation.state.ball.x, 4);
        expect(b.simulation.state.ball.y).toBeCloseTo(a.simulation.state.ball.y, 4);
        compared++;
      }
      expect(compared).toBeGreaterThan(600);
    }
  });

  it('lets a ball heading for the other player pass their paddle and wait for word', () => {
    const { a, b, run } = match({ lag: 0.3 });
    a.steer = still;
    run(3, () => a.simulation.state.phase === 'rally');
    // Player a served. With messages this slow, the ball reaches b's side of a's court before b's hit is heard of.
    run(3, () => a.simulation.state.awaiting);
    expect(a.simulation.state.awaiting).toBe(true);
    expect(a.simulation.state.ball.x).toBe(0);
    expect(a.simulation.state.scores).toEqual({ left: 0, right: 0 });
    run(0.5, () => !a.simulation.state.awaiting);
    expect(a.simulation.state.ball.heading).toBe(1);
    expect(b.simulation.state.ball.heading).toBe(-1);
  });

  it('gives a point to the other player when a paddle misses, in both games', () => {
    const { a, b, run } = match({ winningScore: 5 });
    // Player a never moves, so sooner or later a ball gets past.
    a.steer = still;
    run(60, () => a.simulation.state.scores.left > 0 && b.simulation.state.scores.right > 0);
    expect(a.simulation.state.scores.left).toBe(1);
    expect(b.simulation.state.scores.right).toBe(1);
    expect(a.simulation.state.scores.right).toBe(b.simulation.state.scores.left);
    expect(a.simulation.state.scorer).toBe('left');
    expect(b.simulation.state.scorer).toBe('right');
    // The ball stopped in the same place for both: past a's paddle.
    expect(mirrored(b.simulation)).toBeCloseTo(a.simulation.state.ball.x, 4);
    expect(b.simulation.state.ball.y).toBeCloseTo(a.simulation.state.ball.y, 4);
  });

  it('plays a whole match to the same score and winner', () => {
    const { a, b, run } = match({ winningScore: 3 });
    a.steer = still;
    run(300, () => a.simulation.state.phase === 'gameOver' && b.simulation.state.phase === 'gameOver');
    expect(a.simulation.state.phase).toBe('gameOver');
    expect(b.simulation.state.phase).toBe('gameOver');
    expect(a.simulation.state.winner).toBe('left');
    expect(b.simulation.state.winner).toBe('right');
    expect(a.simulation.state.scores.left).toBe(3);
    expect(b.simulation.state.scores).toEqual({ left: a.simulation.state.scores.right, right: 3 });
  });

  it('moves the other player\'s paddle as they move it', () => {
    const { a, b, run, tick } = match({ lag: 0.05, winningScore: 50 });
    run(3, () => a.simulation.state.phase === 'rally');
    let furthest = 0;
    let moved = false;
    for (let step = 0; step < 60 * 20; step++) {
      tick();
      if (b.simulation.state.right.y !== (standardCourt.height - standardCourt.paddleHeight) / 2) moved = true;
      furthest = Math.max(furthest, Math.abs(a.simulation.state.left.y - b.simulation.state.right.y));
    }
    expect(moved).toBe(true);
    // Never further out than the paddle goes in the time its report takes, at full speed.
    expect(furthest).toBeLessThan(standardCourt.height * standardCourt.paddleSpeed * 3 * 0.05 + 1);
  });

  it('serves only its own serves', () => {
    const { a, b, run } = match({ winningScore: 5 });
    a.steer = still;
    run(60, () => a.simulation.state.phase === 'between');
    // Player b scored, so b serves next.
    expect(a.simulation.state.server).toBe('left');
    expect(a.link.serve()).toBe(false);
    expect(a.simulation.state.phase).toBe('between');
    run(1, () => b.simulation.state.phase === 'rally');
    expect(b.simulation.state.phase).toBe('rally');
  });

  it('agrees on the ball again when asked to', () => {
    const { a, b, run, settled } = match({ lag: 0.05, winningScore: 50 });
    run(3, () => a.simulation.state.phase === 'rally');
    run(5, () => settled() && a.simulation.state.ball.heading === -1 && a.simulation.state.ball.x > 400);
    // Knock b's ball off its path, as a pause that the two games took at different moments would.
    b.simulation.state.ball.y = Math.min(b.simulation.state.ball.y + 40, 600);
    a.link.sync();
    run(0.2, () => b.mail.length === 0);
    run(0.05);
    expect(mirrored(b.simulation)).toBeCloseTo(a.simulation.state.ball.x, 4);
    expect(b.simulation.state.ball.y).toBeCloseTo(a.simulation.state.ball.y, 4);
  });
});

describe('a game against a remote player', () => {
  const court = () => {
    const simulation = createSimulation(seededRandom(3));
    const { width, height, ballSize, paddleWidth, paddleHeight, paddleSpeed } = standardCourt;
    simulation.setOptions({ winningScore: 11, difficulty: 'impossible', paddleSpeed, attract: true });
    simulation.setBounds(width, height, ballSize, ballSize, paddleWidth, paddleHeight);
    simulation.setRemote(true);
    return simulation;
  };

  it('plays no attract rally and no AI', () => {
    const simulation = court();
    for (let step = 0; step < 120; step++) simulation.step(frame, 0);
    expect(simulation.state.attract).toBe(false);
    expect(simulation.state.ball.speed).toBe(0);
    simulation.toss(false, 'right');
    for (let step = 0; step < 60 * 4; step++) simulation.step(frame, 0);
    expect(simulation.state.phase).toBe('rally');
    // The impossible AI would be on its way to the ball by now.
    expect(simulation.state.left.y).toBe((standardCourt.height - standardCourt.paddleHeight) / 2);
  });

  it('starts a match with both paddles in the middle, wherever they were left', () => {
    const simulation = court();
    const { left, right } = simulation.state;
    const middle = (standardCourt.height - standardCourt.paddleHeight) / 2;
    // The player moved before the match, and the other player's paddle was last shown elsewhere.
    for (let step = 0; step < 30; step++) simulation.step(frame, 1);
    simulation.remotePaddle(50, 0, 0, 1);
    simulation.step(frame, 0);
    expect(right.y).not.toBe(middle);
    expect(left.y).toBe(50);
    simulation.toss(false, 'right');
    expect(right.y).toBe(middle);
    expect(left.y).toBe(middle);
  });

  it('shows a reported paddle a moment behind, as it was reported', () => {
    const simulation = court();
    const { left } = simulation.state;
    const rest = left.y;
    // They have just started down from 100.
    simulation.remotePaddle(100, 1, 0, 0);
    simulation.step(frame, 0);
    expect(left.y).toBe(rest);
    for (let step = 0; step < 4; step++) simulation.step(frame, 0);
    expect(left.y).toBeGreaterThan(100);
    expect(left.y).toBeLessThan(110);
    // They stop at 200: the paddle here runs on to there, stops, and never passes it.
    simulation.remotePaddle(200, 0, 0, 0);
    let furthest = 0;
    for (let step = 0; step < 10; step++) {
      simulation.step(frame, 0);
      furthest = Math.max(furthest, left.y);
    }
    expect(furthest).toBe(200);
    expect(left.y).toBe(200);
    expect(left.direction).toBe(0);
  });

  it('carries a report that arrives late forward by how late it is', () => {
    const simulation = court();
    const { left } = simulation.state;
    // Moving down at full speed, as of a quarter of a second before the end of the step to come: later than the paddle is shown behind.
    simulation.remotePaddle(100, 1, 1, 0.25);
    simulation.step(frame, 0);
    expect(left.y).toBeGreaterThan(100 + standardCourt.height * standardCourt.paddleSpeed * 0.1);
    const { y } = left;
    // With nothing new reported, it carries on the way it was going.
    simulation.step(frame, 0);
    expect(left.y).toBeGreaterThan(y);
  });

  /** Win the toss, and step until the serve has left the other player's end, with their paddle kept on or off the ball. */
  const toTheirEnd = (simulation: Simulation, covered: boolean) => {
    const { state } = simulation;
    simulation.toss(false, 'right');
    let hits = 0;
    for (let step = 0; step < 60 * 10; step++) {
      if (state.phase === 'rally' && (state.ball.heading === 1 || state.awaiting)) break;
      const on = state.ball.y + state.ballHeight / 2 - state.paddleHeight / 2;
      const off = state.ball.y > state.height / 2 ? 0 : state.height - state.paddleHeight;
      simulation.remotePaddle(covered ? on : off, 0, 0, 0);
      const events = simulation.step(frame, 0);
      if (state.phase === 'rally') hits += events.filter((event) => event === 'paddle').length;
    }
    return hits;
  };

  it('stops the ball at the face of their paddle until their word arrives', () => {
    const simulation = court();
    const { state } = simulation;
    expect(toTheirEnd(simulation, true)).toBe(0);
    expect(state.awaiting).toBe(true);
    expect(state.ball.x).toBe(state.paddleWidth);
    expect(state.ball.heading).toBe(-1);
    const { y } = state.ball;
    simulation.step(frame, 0);
    expect(state.ball.x).toBe(state.paddleWidth);
    expect(state.ball.y).toBe(y);
    // Their hit sends it back on the path they report.
    simulation.remoteBall({ x: 100, y: 300, speed: state.ball.speed, heading: 1, angle: 0.2 }, 'hit', 310, 0);
    expect(simulation.step(frame, 0)).toContain('paddle');
    expect(state.awaiting).toBe(false);
    expect(state.ball.x).toBe(100);
    expect(state.ball.y).toBe(300);
    expect(state.ball.angle).toBe(0.2);
  });

  it('moves a ball it had stopped at their paddle to where it lies when they missed it', () => {
    const simulation = court();
    const { state } = simulation;
    toTheirEnd(simulation, true);
    expect(state.awaiting).toBe(true);
    // For them it went on past the paddle to the edge of the court.
    simulation.remoteMiss(0, 400);
    expect(simulation.step(frame, 0)).toContain('point');
    expect(state.awaiting).toBe(false);
    expect(state.ball.x).toBe(0);
    expect(state.ball.y).toBe(400);
    expect(state.scores).toEqual({ left: 0, right: 1 });
  });

  it('lets the ball past a paddle that looks to have missed, and waits for their word', () => {
    const simulation = court();
    const { state } = simulation;
    expect(toTheirEnd(simulation, false)).toBe(0);
    expect(state.awaiting).toBe(true);
    expect(state.ball.x).toBe(0);
    expect(state.scores).toEqual({ left: 0, right: 0 });
    // They did reach it: their hit is news here.
    simulation.remoteBall({ x: 100, y: 300, speed: 500, heading: 1, angle: 0 }, 'hit', 310, 0);
    expect(simulation.step(frame, 0)).toContain('paddle');
    expect(state.awaiting).toBe(false);
  });

  it('draws a reported paddle easing to where it is, not jumping', () => {
    const simulation = court();
    const { left } = simulation.state;
    const shown = left.y;
    // Late enough to be shown at once.
    simulation.remotePaddle(shown + 60, 0, 0, 0.2);
    simulation.step(frame, 0);
    expect(left.y).toBe(shown + 60);
    expect(left.y + left.offset).toBeCloseTo(shown, 6);
    simulation.step(frame, 0);
    expect(left.y + left.offset).toBeGreaterThan(shown);
    expect(left.y + left.offset).toBeLessThan(shown + 60);
    for (let step = 0; step < 30; step++) simulation.step(frame, 0);
    expect(left.offset).toBe(0);
  });

  it('ignores reports when it is not playing a remote player', () => {
    const simulation = court();
    simulation.setRemote(false);
    const { y } = simulation.state.left;
    simulation.remotePaddle(10, 1, 0, 0);
    simulation.remoteMiss(0, 0);
    simulation.step(frame, 0);
    expect(simulation.state.left.y).toBe(y);
    expect(simulation.state.scores).toEqual({ left: 0, right: 0 });
  });
});
