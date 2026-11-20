import { paddleTravel } from './paddle.js';
import type { Direction, SimulationState } from './simulation.js';
import type { PongDifficulty, Side } from './types.js';

/** How an AI paddle plays. Distances are fractions of the court width, measured from the paddle's own edge. */
export type AiProfile = {
  /** Decisions per second. */
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
};

/**
 * How an AI paddle means to return the ball coming at it: squarely with its
 * middle, on its top or bottom corner, or on the move, swinging up or down.
 */
export type AiShot = 'center' | 'top' | 'bottom' | 'up' | 'down';

// The original AI's character, which decided every 10ms: mostly it follows the
// ball once the ball is close, now and then it gives up for a moment (which
// also costs it the speed it had built up), and it stops chasing once the ball
// is level with its paddle.
const character = {
  rate: 100,
  nearZone: 0.05,
  nearChance: 0.26,
  trackChance: 0.96,
  wanderChance: 0.06,
  cornerChance: 0.15,
  swingChance: 0.5,
  swingLead: 0.2,
};

// The difficulties differ in how early the paddle starts to react to a ball
// coming at it (in the last third of the court before its edge, in its own
// half, or in the two thirds nearest to it) and in where it waits meanwhile.
export const aiProfiles: Record<PongDifficulty, AiProfile> = {
  easy: { ...character, trackZone: 1 / 3, positioning: 'opponent' },
  normal: { ...character, trackZone: 1 / 2, positioning: 'random' },
  hard: { ...character, trackZone: 2 / 3, positioning: 'return' },
};

/** The ball's distance from the edge that `side` defends. */
const distanceFrom = (state: SimulationState, side: Side) => (
  side === 'left' ? state.ball.x : state.width - state.ballWidth - state.ball.x
);

/** Walls fold a straight path back into the court: where a ball's top edge is after travelling to `y`. */
const fold = (y: number, maxBallY: number) => {
  if (maxBallY <= 0) return 0;
  const folded = ((y % (2 * maxBallY)) + 2 * maxBallY) % (2 * maxBallY);
  return folded > maxBallY ? 2 * maxBallY - folded : folded;
};

const swingOf = (shot: AiShot): Direction => {
  if (shot === 'up') return -1;
  return shot === 'down' ? 1 : 0;
};

/** Seconds until the ball reaches the face of the paddle on `side`, or `Infinity` if it isn't coming. */
const timeToReach = (state: SimulationState, side: Side) => {
  const { ball } = state;
  if (ball.heading !== (side === 'left' ? -1 : 1)) return Infinity;
  const across = ball.speed * Math.cos(ball.angle);
  if (across <= 0) return Infinity;
  const gap = side === 'left'
    ? ball.x - state.paddleWidth
    : state.width - state.paddleWidth - state.ballWidth - ball.x;
  return Math.max(0, gap) / across;
};

/**
 * Where the top edge of the paddle on `side` should be right now to play its
 * shot, with the ball `time` seconds away. It lines up the part of the paddle
 * the shot calls for with where the ball will be a moment from now (when it
 * arrives, once that is within the swing lead). For a swing it also hangs
 * back by the distance it has yet to cover on the way in, picking up speed
 * from a standstill.
 */
const shotPosition = (state: SimulationState, side: Side, profile: AiProfile, time: number) => {
  const { ball } = state;
  const { shot } = state[side];
  const lead = Math.min(time, profile.swingLead);
  const ballY = fold(ball.y + ball.speed * Math.sin(ball.angle) * lead, state.height - state.ballHeight);
  let contact = state.paddleHeight / 2;
  if (shot === 'top') contact = state.ballHeight / 4;
  else if (shot === 'bottom') contact = state.paddleHeight - state.ballHeight / 4;
  const remaining = paddleTravel(profile.swingLead) - paddleTravel(profile.swingLead - lead);
  const runUp = swingOf(shot) * state.paddleSpeed * state.height * remaining;
  const maxPaddleY = Math.max(0, state.height - state.paddleHeight);
  return Math.min(maxPaddleY, Math.max(0, ballY + state.ballHeight / 2 - contact - runUp));
};

/**
 * Whether the paddle on `side` is on its way to the place it chose to wait,
 * rather than following the ball: it has such a place, and the ball is either
 * heading away or not yet inside its track zone.
 */
const aiSeeking = (state: SimulationState, side: Side, profile: AiProfile) => {
  if (state[side].target == null) return false;
  const away = state.ball.heading === (side === 'left' ? 1 : -1);
  return away || distanceFrom(state, side) >= state.width * profile.trackZone;
};

/**
 * The y that the paddle on `side` is making for and should stop exactly at:
 * the place it chose to wait, or the position its shot calls for. `null`
 * while it swings, when it means to keep moving through the ball.
 */
export const aiDestination = (state: SimulationState, side: Side, profile: AiProfile) => {
  const paddle = state[side];
  if (aiSeeking(state, side, profile)) return paddle.target;
  const time = timeToReach(state, side);
  if (swingOf(paddle.shot) !== 0 && time <= profile.swingLead) return null;
  return shotPosition(state, side, profile, time);
};

/**
 * How to return the next ball, decided the moment the opponent sends it:
 * sometimes on a corner, often on the move, otherwise squarely.
 */
export const aiShot = (profile: AiProfile, random: () => number): AiShot => {
  const roll = random();
  if (roll < profile.cornerChance) return random() < 0.5 ? 'top' : 'bottom';
  if (roll < profile.cornerChance + profile.swingChance) return random() < 0.5 ? 'up' : 'down';
  return 'center';
};

/**
 * Where the paddle on `side` should wait, as the y of its top edge, decided
 * the moment it sends the ball away. The ball is taken to bounce off the walls
 * and the far paddle like a mirror, keeping its angle.
 */
export const aiTarget = (state: SimulationState, side: Side, profile: AiProfile, random: () => number) => {
  const { ball } = state;
  const maxPaddleY = Math.max(0, state.height - state.paddleHeight);
  if (profile.positioning === 'random') return random() * maxPaddleY;
  // One crossing, from the face of one paddle to the face of the other.
  const crossing = state.width - 2 * state.paddleWidth - state.ballWidth;
  const crossings = profile.positioning === 'return' ? 2 : 1;
  const arrival = fold(ball.y + Math.tan(ball.angle) * crossing * crossings, state.height - state.ballHeight);
  // The middle of the paddle level with the middle of the ball.
  return Math.min(maxPaddleY, Math.max(0, arrival + (state.ballHeight - state.paddleHeight) / 2));
};

/**
 * One decision for the paddle on `side`: the direction to move in until the
 * next decision. A pure function of the simulation state, the profile, and
 * the random source.
 */
export const aiDirection = (
  state: SimulationState,
  side: Side,
  profile: AiProfile,
  random: () => number,
): Direction => {
  const paddle = state[side];
  if (paddle.target != null && aiSeeking(state, side, profile)) {
    if (paddle.target === paddle.y) return 0;
    return paddle.target > paddle.y ? 1 : -1;
  }
  const distance = distanceFrom(state, side);
  const swing = swingOf(paddle.shot);
  const time = timeToReach(state, side);
  const offset = shotPosition(state, side, profile, time) - paddle.y;
  // How far the middle of the paddle can be from the ball and still meet it squarely.
  const slack = Math.max(0, state.paddleHeight / 2 - state.ballHeight);
  let toward: Direction = 0;
  if (offset !== 0) toward = offset > 0 ? 1 : -1;
  // Swing through the ball, unless the paddle has got too far ahead of it.
  if (swing !== 0 && time <= profile.swingLead && swing * offset >= -slack) toward = swing;
  if (distance < state.width * profile.nearZone && random() < profile.nearChance) return toward;
  if (
    (distance < state.width * profile.trackZone && random() < profile.trackChance)
    || random() < profile.wanderChance
  ) {
    // Close enough for a square hit: keep going if already headed that way, but don't set off.
    if (paddle.shot === 'center' && Math.abs(offset) <= slack && paddle.direction !== toward) return 0;
    return toward;
  }
  return 0;
};
