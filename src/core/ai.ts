import { paddleTravel } from './paddle.js';
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

// The original AI's character: mostly it follows the ball once the ball is
// close, now and then it gives up for a moment (which also costs it the speed
// it had built up), and it stops chasing once the ball is level with its
// paddle. The original decided every 10ms; this one reacts ten times a second,
// which is nearer to what a person can do.
const character = {
  rate: 10,
  nearZone: 0.05,
  nearChance: 0.26,
  trackChance: 0.96,
  wanderChance: 0.06,
  cornerChance: 0.15,
  swingChance: 0.5,
  swingLead: 0.2,
  foresight: false,
  steepAngle: Math.PI / 6,
};

// The difficulties differ in how early the paddle starts to react to a ball
// coming at it (in the last third of the court before its edge, in its own
// half, or in the two thirds nearest to it), in where it waits meanwhile, and
// in how well it aims.
export const aiProfiles: Record<PongDifficulty, AiProfile> = {
  easy: { ...character, trackZone: 1 / 3, positioning: 'opponent', aimError: 0.175 },
  normal: { ...character, trackZone: 1 / 2, positioning: 'random', aimError: 0.1 },
  hard: { ...character, trackZone: 2 / 3, positioning: 'return', aimError: 0.04 },
  // No handicap at all: it decides at every step, never hesitates, aims
  // exactly, and knows where the ball is going from the moment it is hit. Only
  // the speed of its paddle, which is the same as yours, can beat it.
  impossible: {
    ...character,
    rate: Infinity,
    nearChance: 1,
    trackZone: Infinity,
    trackChance: 1,
    positioning: 'return',
    aimError: 0,
    foresight: true,
  },
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
 * Seconds until the ball is next at the face of the paddle on `side`: when it
 * arrives if it is coming, and otherwise when it would be back if the far
 * paddle returned it without changing its speed.
 */
const timeToArrive = (state: SimulationState, side: Side) => {
  const { ball } = state;
  const coming = timeToReach(state, side);
  if (coming !== Infinity) return coming;
  const across = ball.speed * Math.cos(ball.angle);
  if (across <= 0) return 0;
  const crossing = state.width - 2 * state.paddleWidth - state.ballWidth;
  const gap = side === 'left'
    ? state.width - state.paddleWidth - state.ballWidth - ball.x
    : ball.x - state.paddleWidth;
  return (Math.max(0, gap) + crossing) / across;
};

/** How far ahead the paddle on `side` looks when it places itself: all the way, with foresight. */
const lookAhead = (state: SimulationState, side: Side, profile: AiProfile) => (
  profile.foresight ? timeToArrive(state, side) : timeToReach(state, side)
);

/** Where the ball's top edge will be `time` seconds from now, walls included. */
const ballAhead = (state: SimulationState, time: number) => {
  const { ball } = state;
  return fold(ball.y + ball.speed * Math.sin(ball.angle) * time, state.height - state.ballHeight);
};

/**
 * Where the top edge of the paddle on `side` has to be for a ball whose top
 * edge is at `ballY` to land on the part of the paddle its shot calls for,
 * off by the paddle's aiming error.
 */
const meetingPosition = (state: SimulationState, side: Side, shot: AiShot, ballY: number) => {
  let contact = state.paddleHeight / 2;
  if (shot === 'top') contact = state.ballHeight / 4;
  else if (shot === 'bottom') contact = state.paddleHeight - state.ballHeight / 4;
  contact += state[side].aim * state.paddleHeight;
  return ballY + state.ballHeight / 2 - contact;
};

/** How far the middle of a paddle can be from the ball and still meet it squarely. */
const squareSlack = (state: SimulationState) => Math.max(0, state.paddleHeight / 2 - state.ballHeight);

/**
 * Where the top edge of the paddle on `side` should be right now to play its
 * shot, with the ball `time` seconds away. It lines up the part of the paddle
 * the shot calls for with where the ball will be a moment from now (when it
 * arrives, once that is within the swing lead; with foresight, always when it
 * arrives). For a swing it also hangs
 * back by the distance it has yet to cover on the way in, picking up speed
 * from a standstill. All of it is off by the paddle's aiming error.
 */
const shotPosition = (state: SimulationState, side: Side, profile: AiProfile, time: number) => {
  const { ball } = state;
  // A shot is chosen for a ball on its way; one going away is simply waited for.
  const shot = ball.heading === (side === 'left' ? -1 : 1) ? state[side].shot : 'center';
  const lead = Math.min(time, profile.swingLead);
  const ballY = ballAhead(state, profile.foresight ? time : lead);
  const remaining = paddleTravel(profile.swingLead) - paddleTravel(profile.swingLead - lead);
  const runUp = swingOf(shot) * state.paddleSpeed * state.height * remaining;
  const maxPaddleY = Math.max(0, state.height - state.paddleHeight);
  return Math.min(maxPaddleY, Math.max(0, meetingPosition(state, side, shot, ballY) - runUp));
};

/**
 * Where the top edge of the paddle on `side` has to be when the ball coming
 * at it arrives, `time` seconds from now, for its shot to land.
 */
const arrivalPosition = (state: SimulationState, side: Side, time: number) => {
  const maxPaddleY = Math.max(0, state.height - state.paddleHeight);
  const position = meetingPosition(state, side, state[side].shot, ballAhead(state, time));
  return Math.min(maxPaddleY, Math.max(0, position));
};

/**
 * Whether the paddle on `side`, swinging from this moment until the ball
 * arrives `time` seconds from now, would still meet the ball rather than
 * carry on past it. A swing yet to begin has to land the ball squarely. One
 * under way only has to land it on the paddle at all, since breaking off
 * would cost the paddle all the speed it has. A paddle that would fall short
 * is swinging as well as it can, so that counts too.
 */
const swingLands = (state: SimulationState, side: Side, swing: Direction, time: number) => {
  const paddle = state[side];
  const underWay = paddle.direction === swing;
  const held = underWay ? paddle.held : 0;
  const travel = state.paddleSpeed * state.height * (paddleTravel(held + time) - paddleTravel(held));
  const maxPaddleY = Math.max(0, state.height - state.paddleHeight);
  const reached = Math.min(maxPaddleY, Math.max(0, paddle.y + swing * travel));
  const past = swing * (reached - arrivalPosition(state, side, time));
  return past <= (underWay ? Math.max(0, (state.paddleHeight - state.ballHeight) / 2) : squareSlack(state));
};

/**
 * Whether the paddle on `side` has what a swing at the ball just sent its
 * way needs: room on the court for the run-up, and time to get to the start
 * of it from where the paddle is now.
 */
const swingFeasible = (state: SimulationState, side: Side, profile: AiProfile, shot: AiShot) => {
  const spare = timeToReach(state, side) - profile.swingLead;
  if (spare < 0 || spare === Infinity) return false;
  const reach = state.paddleSpeed * state.height;
  const meeting = meetingPosition(state, side, shot, ballAhead(state, spare + profile.swingLead));
  const start = meeting - swingOf(shot) * reach * paddleTravel(profile.swingLead);
  if (start < 0 || start > state.height - state.paddleHeight) return false;
  return Math.abs(start - state[side].y) <= reach * paddleTravel(spare);
};

/**
 * Whether the paddle on `side` is on its way to the place it chose to wait,
 * rather than following the ball: it has such a place, and the ball is either
 * heading away or not yet inside its track zone.
 */
const aiSeeking = (state: SimulationState, side: Side, profile: AiProfile) => {
  if (state[side].target == null || profile.foresight) return false;
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
  const swing = swingOf(paddle.shot);
  const time = timeToReach(state, side);
  if (swing !== 0 && time <= profile.swingLead) {
    // A swing that would carry the paddle past the ball is held back: it makes for the ball instead.
    return swingLands(state, side, swing, time) ? null : arrivalPosition(state, side, time);
  }
  return shotPosition(state, side, profile, lookAhead(state, side, profile));
};

/**
 * Whether the paddle on `side` should be swinging through the ball right
 * now: it means to, the ball is within the swing's lead of arriving, and a
 * swing from here would meet it. A paddle nearer the ball than its run-up
 * needs holds still until that last part comes true.
 */
export const aiSwinging = (state: SimulationState, side: Side, profile: AiProfile) => {
  const swing = swingOf(state[side].shot);
  if (swing === 0 || aiSeeking(state, side, profile)) return false;
  const time = timeToReach(state, side);
  return time <= profile.swingLead && swingLands(state, side, swing, time);
};

/**
 * How far off the mark the next return will be, as a fraction of the
 * paddle's height, decided along with the shot.
 */
export const aiAim = (profile: AiProfile, random: () => number) => (random() * 2 - 1) * profile.aimError;

/**
 * Which way the ball just sent across the court will be moving when it gets
 * there, up (`-1`) or down (`1`): each wall it meets on the way turns it round.
 */
const arrivalDrift = (state: SimulationState): Direction => {
  const { ball } = state;
  const maxBallY = state.height - state.ballHeight;
  if (ball.angle === 0 || maxBallY <= 0) return 0;
  const crossing = state.width - 2 * state.paddleWidth - state.ballWidth;
  const walls = Math.abs(Math.floor((ball.y + Math.tan(ball.angle) * crossing) / maxBallY));
  const setOff: Direction = ball.angle > 0 ? 1 : -1;
  if (walls % 2 === 1) return setOff > 0 ? -1 : 1;
  return setOff;
};

/**
 * How the paddle on `side` should return the ball in `state`, decided the
 * moment the opponent sends it: sometimes on a corner, often on the move,
 * otherwise squarely. A swing goes either way, unless the ball is on a steep
 * path: then it goes against the ball, which flattens the path instead of
 * steepening it further. A swing it has no room or time to run up to is
 * given up for a square return, so that it never leaves a ball it could have
 * met for a run-up it can't finish.
 */
export const aiShot = (state: SimulationState, side: Side, profile: AiProfile, random: () => number): AiShot => {
  const roll = random();
  if (roll < profile.cornerChance) return random() < 0.5 ? 'top' : 'bottom';
  if (roll >= profile.cornerChance + profile.swingChance) return 'center';
  const drift = arrivalDrift(state);
  let shot: AiShot;
  if (drift !== 0 && Math.abs(state.ball.angle) > profile.steepAngle) shot = drift > 0 ? 'up' : 'down';
  else shot = random() < 0.5 ? 'up' : 'down';
  return swingFeasible(state, side, profile, shot) ? shot : 'center';
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
  const offset = shotPosition(state, side, profile, lookAhead(state, side, profile)) - paddle.y;
  const slack = squareSlack(state);
  let toward: Direction = 0;
  if (offset !== 0) toward = offset > 0 ? 1 : -1;
  if (swing !== 0 && time <= profile.swingLead) {
    const gap = arrivalPosition(state, side, time) - paddle.y;
    // Swing through the ball. The swing is planned, not a reaction, so no
    // hesitation breaks it off. A swing begun now that would carry the paddle
    // past the ball waits until it wouldn't; a paddle already past the ball
    // comes back to it. It never moves off a ball it is level with.
    if (swingLands(state, side, swing, time)) return swing;
    if (swing * gap > 0 || Math.abs(gap) <= slack) toward = 0;
    else toward = gap > 0 ? 1 : -1;
  }
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
