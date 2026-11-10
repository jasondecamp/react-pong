import { aiDestination, aiDirection, aiProfiles, aiShot, aiTarget } from './ai.js';
import type { AiShot } from './ai.js';
import type { PongDifficulty, PongPhase, PongScores, Side } from './types.js';

/** Up (`-1`), still (`0`), or down (`1`). */
export type Direction = -1 | 0 | 1;

export type SimulationEvent = 'wall' | 'paddle' | 'point' | 'gameOver';

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
  scores: PongScores;
  phase: PongPhase;
  /** The side that serves next; `null` picks one at random. */
  server: Side | null;
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
  setBounds: (
    width: number,
    height: number,
    ballWidth: number,
    ballHeight: number,
    paddleWidth: number,
    paddleHeight: number,
  ) => void;
  serve: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  /**
   * Advance by `dt` seconds with the right paddle steered in `input`. Returns
   * the events of this step in a buffer that the next step reuses.
   */
  step: (dt: number, input: Direction) => readonly SimulationEvent[];
};

// A step never covers more than this, so a stalled tab doesn't teleport the ball.
const maxDt = 0.05;
const degrees = Math.PI / 180;
// Serves travel at about this speed, in court widths per second, give or take
// a tenth, along a path slanted up or down by no more than the serve angle.
const serveSpeed = 0.65;
const serveSpeedVariation = 0.1;
const maxServeAngle = 30 * degrees;
// Each paddle hit returns the ball 5% faster.
const hitSpeedUp = 1.05;
// A paddle held in one direction gains its starting speed again every second,
// for two seconds.
const maxHold = 2;
// A moving paddle drags the ball with it: this fraction of the paddle's own
// vertical velocity is added to the ball's before its new path is worked out.
const paddleGrip = 0.5;
// A ball that catches a paddle within one ball size of its top or bottom edge
// has hit the corner, and leaves steeply toward the ceiling or the floor.
const edgeAngle = 70 * degrees;
// Each hit also nudges the path at random, by up to this much either way.
const hitJitter = 3 * degrees;
// The path never gets steeper than this, so the ball always makes headway
// across the court.
const maxAngle = 80 * degrees;
// Wall and paddle bounces resolved in one step; more than enough for 50ms.
const maxBounces = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The game itself: court, ball, paddles, scores, and phase. Pure: it touches
 * no DOM and draws every random number from `random`.
 */
export const createSimulation = (random: () => number): Simulation => {
  const state: SimulationState = {
    width: 0,
    height: 0,
    ballWidth: 0,
    ballHeight: 0,
    paddleWidth: 0,
    paddleHeight: 0,
    paddleSpeed: 1.2,
    ball: { x: 0, y: 0, speed: 0, heading: 1, angle: 0 },
    left: { y: 0, direction: 0, held: 0, target: null, shot: 'center' },
    right: { y: 0, direction: 0, held: 0, target: null, shot: 'center' },
    scores: { left: 0, right: 0 },
    phase: 'start',
    server: null,
    scorer: null,
    winner: null,
  };
  const events: SimulationEvent[] = [];
  let ai = aiProfiles.normal;
  let winningScore = 11;
  // Seconds since the AI last decided.
  let aiClock = 0;
  // The ball got past the paddle it was heading for, and is on its way out.
  let missed = false;

  /** Off the court, where the start screen keeps the ball. */
  const parkBall = () => {
    state.ball.x = -2 * state.ballWidth;
    state.ball.y = (state.height - state.ballHeight) / 2;
    state.ball.speed = 0;
  };

  const steer = (paddle: Paddle, direction: Direction) => {
    if (paddle.direction === direction) return;
    paddle.direction = direction;
    paddle.held = 0;
  };

  /** Move a paddle the way it is steered. One making for a particular place (`stopAt`) stops exactly there. */
  const movePaddle = (paddle: Paddle, dt: number, stopAt: number | null) => {
    const maxY = state.height - state.paddleHeight;
    if (paddle.direction === 0) return;
    // Pushing against a wall builds no more speed.
    if (paddle.direction === 1 ? paddle.y >= maxY : paddle.y <= 0) return;
    paddle.held = Math.min(paddle.held + dt, maxHold);
    const from = paddle.y;
    paddle.y = clamp(from + paddle.direction * state.paddleSpeed * state.height * (1 + paddle.held) * dt, 0, maxY);
    if (stopAt != null && (stopAt - from) * (stopAt - paddle.y) <= 0) paddle.y = stopAt;
  };

  const point = (scorer: Side) => {
    state.scores[scorer] += 1;
    state.scorer = scorer;
    // Scoring earns the next serve.
    state.server = scorer;
    state.ball.speed = 0;
    state.left.target = null;
    state.left.shot = 'center';
    steer(state.left, 0);
    events.push('point');
    if (state.scores[scorer] >= winningScore) {
      state.phase = 'gameOver';
      state.winner = scorer;
      events.push('gameOver');
    } else {
      state.phase = 'between';
    }
  };

  /**
   * The ball meets the paddle on `side`, whose top edge is at `paddleY` and
   * which is moving at `paddleVelocity` px per second (down is positive).
   */
  const hit = (side: Side, paddleY: number, paddleVelocity: number) => {
    const { ball } = state;
    if (paddleY >= ball.y + state.ballHeight || ball.y >= paddleY + state.paddleHeight) {
      missed = true;
      return;
    }
    const center = ball.y + state.ballHeight / 2;
    let angle: number;
    if (center < paddleY + state.ballHeight) {
      angle = -edgeAngle;
    } else if (center > paddleY + state.paddleHeight - state.ballHeight) {
      angle = edgeAngle;
    } else {
      const across = ball.speed * Math.cos(ball.angle);
      const down = ball.speed * Math.sin(ball.angle) + paddleVelocity * paddleGrip;
      angle = Math.atan2(down, across);
    }
    const jitter = (random() * 2 - 1) * hitJitter;
    ball.heading = side === 'left' ? 1 : -1;
    ball.angle = clamp(angle + jitter, -maxAngle, maxAngle);
    ball.speed *= hitSpeedUp;
    // Having sent the ball away, the AI decides at once where to wait for it.
    // With the ball on its way back, it decides how to return it.
    if (side === 'left') state.left.target = aiTarget(state, 'left', ai, random);
    else state.left.shot = aiShot(ai, random);
    events.push('paddle');
  };

  // Swept: the ball travels to whichever comes first of a wall, the face of
  // the paddle it is heading for, or the edge behind that paddle, and carries
  // on from there with the time left. The paddles have already moved, so each
  // is placed where it was at the moment the ball reached it.
  const moveBall = (dt: number, leftBefore: number, rightBefore: number) => {
    const { ball } = state;
    const maxY = state.height - state.ballHeight;
    const leftFace = state.paddleWidth;
    const rightFace = state.width - state.paddleWidth - state.ballWidth;
    let remaining = dt;
    for (let bounce = 0; bounce < maxBounces && remaining > 0 && state.phase === 'rally'; bounce++) {
      const vx = ball.heading * ball.speed * Math.cos(ball.angle);
      const vy = ball.speed * Math.sin(ball.angle);
      let time = remaining;
      let wall = false;
      if (vy !== 0) {
        const wallTime = ((vy < 0 ? 0 : maxY) - ball.y) / vy;
        if (wallTime < time) {
          time = Math.max(0, wallTime);
          wall = true;
        }
      }
      const heading: Side = ball.heading === -1 ? 'left' : 'right';
      const face = heading === 'left' ? leftFace : rightFace;
      const edge = heading === 'left' ? 0 : state.width - state.ballWidth;
      const target = missed ? edge : face;
      let reached = false;
      if (vx !== 0) {
        const targetTime = (target - ball.x) / vx;
        if (targetTime <= time) {
          time = Math.max(0, targetTime);
          wall = false;
          reached = true;
        }
      }
      ball.x += vx * time;
      ball.y = clamp(ball.y + vy * time, 0, maxY);
      remaining -= time;
      if (wall) {
        ball.angle = -ball.angle;
        events.push('wall');
      } else if (reached) {
        ball.x = target;
        if (missed) {
          point(heading === 'left' ? 'right' : 'left');
        } else {
          const progress = (dt - remaining) / dt;
          const paddle = state[heading];
          const before = heading === 'left' ? leftBefore : rightBefore;
          hit(heading, before + (paddle.y - before) * progress, (paddle.y - before) / dt);
        }
      }
    }
  };

  return {
    state,

    setOptions: (options) => {
      winningScore = options.winningScore;
      ai = aiProfiles[options.difficulty];
      state.paddleSpeed = options.paddleSpeed;
    },

    setBounds: (width, height, ballWidth, ballHeight, paddleWidth, paddleHeight) => {
      const { ball, left, right } = state;
      const wasSized = state.width > 0 && state.height > 0;
      const scaleX = wasSized ? width / state.width : 1;
      const scaleY = wasSized ? height / state.height : 1;
      const oldMaxPaddleY = state.height - state.paddleHeight;
      const maxPaddleY = Math.max(0, height - paddleHeight);
      state.width = width;
      state.height = height;
      state.ballWidth = ballWidth;
      state.ballHeight = ballHeight;
      state.paddleWidth = paddleWidth;
      state.paddleHeight = paddleHeight;
      if (width <= 0 || height <= 0) return;
      // Paddles keep their place along the travel they have; before the first
      // measurement they are centered.
      const paddleScale = wasSized && oldMaxPaddleY > 0 ? maxPaddleY / oldMaxPaddleY : null;
      left.y = paddleScale == null ? maxPaddleY / 2 : clamp(left.y * paddleScale, 0, maxPaddleY);
      if (left.target != null) left.target = paddleScale == null ? null : clamp(left.target * paddleScale, 0, maxPaddleY);
      right.y = paddleScale == null ? maxPaddleY / 2 : clamp(right.y * paddleScale, 0, maxPaddleY);
      if (state.phase === 'start') {
        parkBall();
        return;
      }
      ball.x *= scaleX;
      ball.y = clamp(ball.y * scaleY, 0, Math.max(0, height - ballHeight));
      ball.speed *= scaleX;
    },

    serve: () => {
      if (state.phase !== 'start' && state.phase !== 'between') return;
      if (state.width <= 0 || state.height <= 0) return;
      const { ball } = state;
      const server = state.server ?? (random() < 0.5 ? 'left' : 'right');
      // From the face of the server's paddle, heading away from it.
      ball.x = server === 'left' ? state.paddleWidth : state.width - state.paddleWidth - state.ballWidth;
      ball.y = clamp(
        state[server].y + (state.paddleHeight - state.ballHeight) / 2,
        0,
        Math.max(0, state.height - state.ballHeight),
      );
      ball.speed = state.width * serveSpeed * (1 + (random() * 2 - 1) * serveSpeedVariation);
      ball.heading = server === 'left' ? 1 : -1;
      ball.angle = (random() * 2 - 1) * maxServeAngle;
      state.server = server;
      state.left.target = server === 'left' ? aiTarget(state, 'left', ai, random) : null;
      state.left.shot = server === 'left' ? 'center' : aiShot(ai, random);
      state.phase = 'rally';
      aiClock = 0;
      missed = false;
    },

    pause: () => {
      if (state.phase === 'rally') state.phase = 'paused';
    },

    resume: () => {
      if (state.phase === 'paused') state.phase = 'rally';
    },

    reset: () => {
      state.scores.left = 0;
      state.scores.right = 0;
      state.phase = 'start';
      state.server = null;
      state.scorer = null;
      state.winner = null;
      state.left.target = null;
      state.left.shot = 'center';
      steer(state.left, 0);
      steer(state.right, 0);
      parkBall();
    },

    step: (dt, input) => {
      events.length = 0;
      if (state.phase === 'paused' || state.width <= 0 || state.height <= 0) return events;
      const elapsed = Math.min(dt, maxDt);
      if (!(elapsed > 0)) return events;
      const leftBefore = state.left.y;
      const rightBefore = state.right.y;
      steer(state.right, input);
      if (state.phase === 'rally') {
        // The AI decides at its own fixed rate, whatever the frame rate.
        aiClock += elapsed;
        while (aiClock >= 1 / ai.rate) {
          aiClock -= 1 / ai.rate;
          steer(state.left, aiDirection(state, 'left', ai, random));
        }
      }
      movePaddle(state.left, elapsed, state.phase === 'rally' ? aiDestination(state, 'left', ai) : null);
      movePaddle(state.right, elapsed, null);
      if (state.phase === 'rally') moveBall(elapsed, leftBefore, rightBefore);
      return events;
    },
  };
};
