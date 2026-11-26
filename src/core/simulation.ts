import { aiAim, aiDestination, aiDirection, aiProfiles, aiShot, aiSwinging, aiTarget } from './ai.js';
import type { AiShot } from './ai.js';
import { maxHold, paddleTravel } from './paddle.js';
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
  /**
   * How far from `y` to draw it, in px. A remote player's paddle is put
   * where they last reported it, and drawn easing there from where it was
   * shown rather than jumping. Otherwise `0`.
   */
  offset: number;
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
  contact: { side: Side; x: number; y: number };
  scores: PongScores;
  phase: PongPhase;
  /** The side that serves next; `null` picks one at random. */
  server: Side | null;
  /** The number the countdown to the first serve is on, or `0` when nothing is counting. */
  countdown: number;
  /** The side that scored the last point. */
  scorer: Side | null;
  winner: Side | null;
  /** The start screen is playing itself: both paddles are the AI's, and nothing scores. */
  attract: boolean;
  /**
   * The left paddle is another player's, in another browser. Nothing here
   * plays it: it moves as that player reports, and that player decides
   * whether it met a ball heading its way.
   */
  remote: boolean;
  /**
   * In a game against a remote player, the ball has gone as far as this side
   * can take it, and is waiting to hear from the other: for their serve, or
   * for whether their paddle met it.
   */
  awaiting: boolean;
  /**
   * In a game against a remote player, the ball is coming back from their
   * paddle on this side's guess that it met the ball there, ahead of their
   * word on it. Their report, or their miss, replaces the guess.
   */
  predicted: boolean;
};

/** A ball as one player reports it to the other: where it is and how it is moving. */
export type BallReport = {
  x: number;
  y: number;
  speed: number;
  heading: -1 | 1;
  angle: number;
};

/**
 * Why a ball is reported: it was served, a paddle hit it (`contactY` is where,
 * down the court), or the two players are only agreeing on where it is.
 */
export type BallReportKind = 'serve' | 'hit' | 'sync';

export type SimulationOptions = {
  winningScore: number;
  difficulty: PongDifficulty;
  /** Court heights per second. */
  paddleSpeed: number;
  /** On the start screen the AI plays both paddles, for show. Default `false`. */
  attract?: boolean;
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
  /**
   * Serve at once, from the start screen or between points, and say whether
   * a ball left. Against a remote player only this side's own serves do: the
   * other's arrive through `remoteBall`.
   */
  serve: () => boolean;
  /**
   * From the start screen, toss for the first serve: the ball bounces between
   * the paddles (unless `animate` is false) and comes to rest on the side that
   * won it, a countdown runs, and the ball is served. The toss goes to
   * `server` if one is given, as it is against a remote player, whose game
   * has to settle on the same side.
   */
  toss: (animate: boolean, server?: Side) => void;
  /**
   * Play against a remote player (`true`) or the AI (`false`). Set it on the
   * start screen, before the match.
   */
  setRemote: (remote: boolean) => void;
  /**
   * The remote player's paddle, as they reported it: its top edge, the way it
   * was moving, and for how long. `age` is the seconds from the report to
   * the end of the next step. The paddle is shown a constant moment behind
   * the player, so the report takes effect once it is that old; one that
   * arrives older is carried forward by the difference.
   */
  remotePaddle: (y: number, direction: Direction, held: number, age: number) => void;
  /**
   * A ball as the remote player reported it, already turned to this side's
   * view. It takes the place of this side's ball at the next step, carried
   * forward along its path by `age`, the seconds from the report to the end
   * of that step.
   */
  remoteBall: (ball: BallReport, kind: BallReportKind, contactY: number, age: number) => void;
  /**
   * The remote player's paddle missed the ball: the point is this side's, at
   * the next step, with the ball left at `x`, `y`, where it came to rest for
   * them, already turned to this side's view.
   */
  remoteMiss: (x: number, y: number) => void;
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
// The toss for the first serve: the ball crosses the court this many times in
// this many seconds, slowing to a stop on the server's paddle. The half is the
// run from the middle of the court, where it starts, to the first paddle.
const tossSpans = 3.5;
const tossDuration = 1.8;
// Then a countdown from this number, with this many seconds on each.
const countFrom = 3;
const countInterval = 0.6;
// In attract mode, the wait before each serve, in seconds.
const attractRest = 0.8;
// Each paddle hit returns the ball 5% faster.
const hitSpeedUp = 1.05;
// A moving paddle drags the ball with it: this fraction of the paddle's own
// vertical velocity is added to the ball's before its new path is worked out.
const paddleGrip = 0.5;
// The face of a paddle also flattens the ball's path: it leaves with this
// fraction of the slant it arrived with, before the paddle's drag is added.
// Without it nothing ever brought a steep rally back toward level.
const slantKept = 0.65;
// A ball that catches a paddle within one ball size of its top or bottom edge
// has hit the corner, and leaves steeply toward the ceiling or the floor. One
// that has got past the paddle's face and is caught by its end leaves at the
// steepest angle there is.
const edgeAngle = 60 * degrees;
// Each hit on a paddle's face also nudges the path at random, by up to this much either way.
const hitJitter = 3 * degrees;
// The path never gets steeper than this, so the ball always makes headway
// across the court.
const maxAngle = 70 * degrees;
// Wall and paddle bounces resolved in one step; more than enough for 50ms.
const maxBounces = 8;
// A report from a remote player is never carried forward by more than this
// many seconds: a staler one is a connection problem, not a game to catch up.
const maxAge = 1;
// A remote player's paddle is drawn closing this much of the gap to where
// they reported it every this many seconds, so that late news of it shows as
// a quick slide and not a jump.
const paddleEase = 0.05;
// A remote player's paddle is shown a constant moment behind them, so that
// every start and stop they report is replayed as it happened: carried
// forward to the present instead, it overran each stop and had to come back.
// The moment is as long as their reports take to arrive, in seconds: it
// starts here, grows at once to cover a slower report plus a margin, shrinks
// slowly when they come quicker, and never passes the limit.
const paddleDelayStart = 0.05;
const paddleDelayMargin = 0.01;
const paddleDelayShrink = 0.02;
const paddleDelayMax = 0.25;
// More reports than arrive in that time.
const paddleReportsKept = 16;

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
    left: { y: 0, direction: 0, held: 0, offset: 0, target: null, shot: 'center', aim: 0 },
    right: { y: 0, direction: 0, held: 0, offset: 0, target: null, shot: 'center', aim: 0 },
    contact: { side: 'left', x: 0, y: 0 },
    scores: { left: 0, right: 0 },
    phase: 'start',
    server: null,
    countdown: 0,
    scorer: null,
    winner: null,
    attract: false,
    remote: false,
    awaiting: false,
    predicted: false,
  };
  const events: SimulationEvent[] = [];
  // What the remote player has reported since the last step, which the next one takes in.
  const inbox = {
    ball: { x: 0, y: 0, speed: 0, heading: 1 as -1 | 1, angle: 0 },
    hasBall: false,
    kind: 'sync' as BallReportKind,
    contactY: 0,
    age: 0,
    miss: false,
    missX: 0,
    missY: 0,
  };
  // The remote player's paddle reports not yet shown, oldest first from
  // `paddleNext`: a ring, so that taking them in allocates nothing. `due` is
  // the seconds from the end of the coming step to the moment the report
  // takes effect; `fresh` marks one that arrived since the last step.
  const paddleReports = Array.from({ length: paddleReportsKept }, () => ({
    y: 0,
    direction: 0 as Direction,
    held: 0,
    due: 0,
    fresh: false,
  }));
  let paddleNext = 0;
  let paddleCount = 0;
  let paddleDelay = paddleDelayStart;
  let ai = aiProfiles.normal;
  let winningScore = 11;
  // For each paddle the AI plays: the seconds since it last decided, and
  // whether it has begun the swing it planned for the ball coming at it.
  const minds = { left: { clock: 0, swung: false }, right: { clock: 0, swung: false } };
  // Attract mode is wanted on the start screen.
  let attractWanted = false;
  // Seconds an attract rally has waited for its next serve.
  let attractClock = 0;
  // The ball got past the paddle it was heading for, and is on its way out.
  let missed = false;
  // Seconds into the toss for the first serve.
  let tossClock = 0;

  const steer = (paddle: Paddle, direction: Direction) => {
    if (paddle.direction === direction) return;
    paddle.direction = direction;
    paddle.held = 0;
  };

  /** Off the court, where the start screen keeps the ball. */
  const parkBall = () => {
    state.ball.x = -2 * state.ballWidth;
    state.ball.y = (state.height - state.ballHeight) / 2;
    state.ball.speed = 0;
  };

  /** How far the tossed ball has travelled `time` seconds in, in crossings of the court: fast at first, still at the end. */
  const tossTravel = (time: number) => {
    const left = 1 - Math.min(1, time / tossDuration);
    return tossSpans * (1 - left * left);
  };

  /** Put the tossed ball where it is `time` seconds in, level with the paddles it runs between. */
  const placeTossed = (time: number) => {
    const { ball } = state;
    // It sets off away from the server, so that its last crossing brings it back.
    const from = state.server === 'left' ? 0.5 + tossTravel(time) : 0.5 - tossTravel(time);
    const folded = ((from % 2) + 2) % 2;
    // 0 on the left paddle's face, 1 on the right's.
    const across = folded > 1 ? 2 - folded : folded;
    const leftFace = state.paddleWidth;
    const rightFace = state.width - state.paddleWidth - state.ballWidth;
    const level = state.left.y + (state.right.y - state.left.y) * across;
    ball.x = leftFace + (rightFace - leftFace) * across;
    ball.y = clamp(
      level + (state.paddleHeight - state.ballHeight) / 2,
      0,
      Math.max(0, state.height - state.ballHeight),
    );
  };

  /** The AI playing `side` plans for a serve: where to wait if it is serving, and how to return it if not. */
  const brief = (side: Side, server: Side) => {
    const paddle = state[side];
    paddle.target = server === side ? aiTarget(state, side, ai, random) : null;
    paddle.aim = server === side ? 0 : aiAim(ai, random);
    paddle.shot = server === side ? 'center' : aiShot(state, side, ai, random);
    minds[side].clock = 0;
  };

  /** The AI playing `side` forgets its plans and stops. */
  const dismiss = (side: Side) => {
    const paddle = state[side];
    paddle.target = null;
    paddle.shot = 'center';
    paddle.aim = 0;
    steer(paddle, 0);
  };

  /** Clear the court of an attract rally, leaving the start screen as it was before one. */
  const endAttract = () => {
    state.attract = false;
    state.server = null;
    dismiss('left');
    dismiss('right');
    parkBall();
  };

  /** Send the ball off from the face of the server's paddle. */
  const launch = (server: Side) => {
    const { ball } = state;
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
    state.countdown = 0;
    state.awaiting = false;
    state.predicted = false;
    if (!state.remote) brief('left', server);
    if (state.attract) brief('right', server);
    else state.phase = 'rally';
    missed = false;
  };

  // The toss, the countdown, and the serve at the end of it.
  const stepToss = (dt: number) => {
    const server = state.server ?? 'left';
    const before = tossClock;
    tossClock += dt;
    // Each time the ball reaches a paddle on the way, it bounces like any other hit.
    const bounces = Math.floor(tossTravel(tossClock) + 0.5);
    if (bounces < tossSpans && bounces > Math.floor(tossTravel(before) + 0.5)) {
      placeTossed(tossClock);
      const { contact } = state;
      // The first paddle it meets is the receiver's, and from there they alternate.
      contact.side = (bounces % 2 === 1) === (server === 'left') ? 'right' : 'left';
      contact.x = contact.side === 'left' ? state.paddleWidth : state.width - state.paddleWidth;
      contact.y = state[contact.side].y + state.paddleHeight / 2;
      events.push('paddle');
    }
    const count = countFrom - Math.floor(Math.max(0, tossClock - tossDuration) / countInterval);
    if (tossClock < tossDuration) {
      placeTossed(tossClock);
    } else if (count <= 0 && state.remote && server === 'left') {
      // The remote player serves: the ball stays on their paddle until their serve arrives.
      placeTossed(tossDuration);
      state.phase = 'rally';
      state.awaiting = true;
    } else if (count <= 0) {
      launch(server);
      events.push('serve');
    } else {
      placeTossed(tossDuration);
      if (count !== state.countdown) {
        events.push(state.countdown === 0 ? 'toss' : 'count');
        state.countdown = count;
      }
    }
  };

  /**
   * Move a paddle the way it is steered. One making for a particular place
   * (`stopAt`) stops exactly there, and stays there if the place then shifts
   * by less than the paddle moves in a step: without that, a paddle already
   * in place would run on past a place that moved back by a hair.
   */
  const movePaddle = (paddle: Paddle, dt: number, stopAt: number | null) => {
    const maxY = state.height - state.paddleHeight;
    if (paddle.direction === 0) return;
    // Pushing against a wall builds no more speed.
    if (paddle.direction === 1 ? paddle.y >= maxY : paddle.y <= 0) return;
    const from = paddle.y;
    // The distance its speed adds up to over the step, so that it moves the same at any frame rate.
    const travel = paddleTravel(paddle.held + dt) - paddleTravel(paddle.held);
    paddle.held = Math.min(paddle.held + dt, maxHold);
    const reach = state.paddleSpeed * state.height * travel;
    if (stopAt != null && Math.abs(stopAt - from) <= reach) paddle.y = stopAt;
    else paddle.y = clamp(from + paddle.direction * reach, 0, maxY);
  };

  const point = (scorer: Side) => {
    state.scores[scorer] += 1;
    state.scorer = scorer;
    // Scoring earns the next serve.
    state.server = scorer;
    state.ball.speed = 0;
    state.awaiting = false;
    state.predicted = false;
    if (!state.remote) dismiss('left');
    events.push('point');
    if (state.scores[scorer] >= winningScore) {
      state.phase = 'gameOver';
      state.winner = scorer;
      events.push('gameOver');
    } else {
      state.phase = 'between';
    }
  };

  /** The paddle on `side` sends the ball back along a path slanted by `angle`. */
  const deflect = (side: Side, angle: number) => {
    const { ball, contact } = state;
    // The middle of the ball's side that faces the paddle.
    contact.side = side;
    contact.x = side === 'left' ? ball.x : ball.x + state.ballWidth;
    contact.y = ball.y + state.ballHeight / 2;
    ball.heading = side === 'left' ? 1 : -1;
    ball.angle = clamp(angle, -maxAngle, maxAngle);
    ball.speed *= hitSpeedUp;
    // Having sent the ball away, an AI decides at once where to wait for it.
    // With the ball on its way to it, an AI decides how to return it.
    const receiver: Side = side === 'left' ? 'right' : 'left';
    if ((side === 'left' && !state.remote) || state.attract) state[side].target = aiTarget(state, side, ai, random);
    if ((receiver === 'left' && !state.remote) || state.attract) {
      state[receiver].aim = aiAim(ai, random);
      state[receiver].shot = aiShot(state, receiver, ai, random);
    }
    events.push('paddle');
  };

  /**
   * The ball meets the face of the paddle on `side`, whose top edge is at
   * `paddleY` and which is moving at `paddleVelocity` px per second (down is
   * positive).
   */
  const hit = (side: Side, paddleY: number, paddleVelocity: number, jitter: boolean) => {
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
      const slant = ball.angle * slantKept;
      const across = ball.speed * Math.cos(slant);
      const down = ball.speed * Math.sin(slant) + paddleVelocity * paddleGrip;
      angle = Math.atan2(down, across);
    }
    deflect(side, jitter ? angle + (random() * 2 - 1) * hitJitter : angle);
  };

  /**
   * For a ball that has got past the face of a paddle: how far through a
   * stretch of its path, from 0 to 1, the end of the paddle catches it, or
   * `-1` if it doesn't. `from` and `to` are the ball's top edge measured from
   * the paddle's, at the start and the end of the stretch. The paddle may
   * have run into the ball or the ball into the paddle.
   */
  const caughtAt = (from: number, to: number) => {
    const above = -state.ballHeight;
    const below = state.paddleHeight;
    if (Math.max(from, to) <= above || Math.min(from, to) >= below) return -1;
    if (from > above && from < below) return 0;
    return ((from <= above ? above : below) - from) / (to - from);
  };

  /** The ball is live: in a rally, or in attract mode's imitation of one. */
  const inPlay = () => state.phase === 'rally' || state.attract;

  // The AI playing `side` decides at its own fixed rate, whatever the frame
  // rate. A swing is planned rather than a reaction, so it begins on time
  // instead of waiting for the next decision.
  const think = (side: Side, elapsed: number) => {
    const mind = minds[side];
    mind.clock += elapsed;
    const swinging = aiSwinging(state, side, ai);
    if (swinging && !mind.swung && ai.rate !== Infinity) mind.clock = Math.max(mind.clock, 1 / ai.rate);
    mind.swung = swinging;
    const interval = 1 / ai.rate;
    if (interval <= 0) {
      // No reaction time at all: it decides at every step.
      mind.clock = 0;
      steer(state[side], aiDirection(state, side, ai, random));
    }
    while (interval > 0 && mind.clock >= interval) {
      mind.clock -= interval;
      steer(state[side], aiDirection(state, side, ai, random));
    }
  };

  // Swept: the ball travels to whichever comes first of a wall, the face of
  // the paddle it is heading for, or the edge behind that paddle, and carries
  // on from there with the time left. The paddles have already moved, so each
  // is placed where it was at the moment the ball reached it. A remote
  // player's paddle is theirs to judge. Until their word arrives, a ball that
  // meets it as it shows here comes back on a guess, and one that doesn't
  // carries on to the edge of the court and waits there, where it will lie
  // if their word is that it was a miss.
  const moveBall = (dt: number, leftBefore: number, rightBefore: number) => {
    const { ball } = state;
    const maxY = state.height - state.ballHeight;
    const leftFace = state.paddleWidth;
    const rightFace = state.width - state.paddleWidth - state.ballWidth;
    let remaining = dt;
    for (let bounce = 0; bounce < maxBounces && remaining > 0 && ball.speed > 0 && !state.awaiting && inPlay(); bounce++) {
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
      const theirs = state.remote && heading === 'left';
      const edge = heading === 'left' ? 0 : state.width - state.ballWidth;
      const target = missed ? edge : face;
      let reached = false;
      const fromX = ball.x;
      const fromY = ball.y;
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
      const paddle = state[heading];
      const before = heading === 'left' ? leftBefore : rightBefore;
      // Where the paddle's top edge was when this stretch began, and where it is at its end.
      const paddleFrom = before + (paddle.y - before) * ((dt - remaining - time) / dt);
      const paddleTo = before + (paddle.y - before) * ((dt - remaining) / dt);
      const caught = missed && !theirs ? caughtAt(fromY - paddleFrom, ball.y - paddleTo) : -1;
      if (caught >= 0) {
        // Behind the face, the top or bottom end of the paddle has met the
        // ball, which goes back from where they touched as steeply as it can.
        ball.x = fromX + vx * time * caught;
        ball.y = clamp(fromY + vy * time * caught, 0, maxY);
        remaining += time * (1 - caught);
        missed = false;
        const paddleY = paddleFrom + (paddleTo - paddleFrom) * caught;
        const top = ball.y + state.ballHeight / 2 < paddleY + state.paddleHeight / 2;
        deflect(heading, top ? -maxAngle : maxAngle);
        // They touched at the ball's bottom or top, not its side.
        state.contact.x = ball.x + state.ballWidth / 2;
        state.contact.y = top ? ball.y + state.ballHeight : ball.y;
      } else if (wall) {
        ball.angle = -ball.angle;
        events.push('wall');
      } else if (reached) {
        ball.x = target;
        if (theirs && missed) {
          state.awaiting = true;
        } else if (theirs) {
          // A guess at what their game is deciding now, so the ball doesn't stall
          // until their word arrives: with their paddle where it shows here, and
          // without the nudge only their game can roll. Off the paddle as this
          // side sees it, the ball goes on past and waits.
          hit(heading, paddleTo, (paddle.y - before) / dt, false);
          state.predicted = !missed;
        } else if (missed && state.attract) {
          // Nothing scores in attract mode: the side that would have serves the next ball.
          state.server = heading === 'left' ? 'right' : 'left';
          parkBall();
          attractClock = 0;
        } else if (missed) {
          point(heading === 'left' ? 'right' : 'left');
        } else {
          hit(heading, paddleTo, (paddle.y - before) / dt, true);
        }
      }
    }
  };

  /**
   * Show the remote player's paddle as their reports that have come due
   * describe it, and say whether one had: the paddle has then been carried
   * to the end of this step already.
   */
  const takePaddle = (elapsed: number) => {
    const { left } = state;
    let taken = false;
    for (let index = 0; index < paddleCount; index++) {
      const report = paddleReports[(paddleNext + index) % paddleReportsKept];
      if (report == null) continue;
      if (report.fresh) report.fresh = false;
      else report.due -= elapsed;
    }
    for (let report = paddleReports[paddleNext]; paddleCount > 0 && report != null && report.due <= 0; report = paddleReports[paddleNext]) {
      paddleNext = (paddleNext + 1) % paddleReportsKept;
      paddleCount -= 1;
      const shown = left.y + left.offset;
      left.y = clamp(report.y, 0, Math.max(0, state.height - state.paddleHeight));
      left.direction = report.direction;
      left.held = Math.min(Math.max(0, report.held), maxHold);
      // It took effect this long before the end of the step.
      movePaddle(left, Math.min(-report.due, maxAge), null);
      // Drawn from where it was showing, and eased from there.
      left.offset = shown - left.y;
      taken = true;
    }
    return taken;
  };

  /**
   * Take in the ball or the miss the remote player has reported since the
   * last step, and say whether a ball was: it has then been carried to the
   * end of this step already.
   */
  const takeBall = () => {
    if (inbox.miss) {
      inbox.miss = false;
      inbox.hasBall = false;
      state.predicted = false;
      if (state.phase === 'rally') {
        // Where it ended up for them, wherever this side's guesses had taken it.
        state.ball.x = clamp(inbox.missX, -state.ballWidth, state.width);
        state.ball.y = clamp(inbox.missY, 0, Math.max(0, state.height - state.ballHeight));
        point('right');
      }
      return false;
    }
    if (!inbox.hasBall) return false;
    inbox.hasBall = false;
    const { ball, contact } = state;
    const serve = inbox.kind === 'serve';
    // A serve starts a rally from the toss or between points; anything else belongs to one under way.
    if (serve ? state.phase !== 'toss' && state.phase !== 'between' && state.phase !== 'rally' : state.phase !== 'rally') return false;
    ball.x = inbox.ball.x;
    ball.y = clamp(inbox.ball.y, 0, Math.max(0, state.height - state.ballHeight));
    ball.speed = inbox.ball.speed;
    ball.heading = inbox.ball.heading;
    ball.angle = inbox.ball.angle;
    state.awaiting = false;
    missed = false;
    // A hit this side guessed at has been heard and seen already.
    const guessed = state.predicted;
    state.predicted = false;
    if (serve) {
      state.phase = 'rally';
      state.server = 'left';
      state.countdown = 0;
      events.push('serve');
    } else if (inbox.kind === 'hit') {
      contact.side = 'left';
      contact.x = state.paddleWidth;
      contact.y = inbox.contactY;
      if (!guessed) events.push('paddle');
    }
    // Carry it forward to the end of this step. The paddles stay where the step has put them.
    for (let rest = Math.min(inbox.age, maxAge); rest > 0; rest -= maxDt) {
      moveBall(Math.min(rest, maxDt), state.left.y, state.right.y);
    }
    return true;
  };

  return {
    state,

    setOptions: (options) => {
      winningScore = options.winningScore;
      ai = aiProfiles[options.difficulty];
      state.paddleSpeed = options.paddleSpeed;
      attractWanted = options.attract === true;
      if (!attractWanted && state.attract) endAttract();
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
      if (state.phase !== 'start' && state.phase !== 'between') return false;
      if (state.width <= 0 || state.height <= 0) return false;
      // Against a remote player, their serves are theirs to make.
      if (state.remote && state.server !== 'right') return false;
      if (state.attract) endAttract();
      launch(state.server ?? (random() < 0.5 ? 'left' : 'right'));
      return true;
    },

    toss: (animate, server) => {
      if (state.phase !== 'start' || state.width <= 0 || state.height <= 0) return;
      if (state.attract) endAttract();
      state.server = server ?? (random() < 0.5 ? 'left' : 'right');
      if (state.remote) {
        // Each game has only ever been told of the other's paddle moving, not
        // where it stood, so a match starts with both in the middle for both.
        for (const paddle of [state.left, state.right] as const) {
          paddle.y = Math.max(0, state.height - state.paddleHeight) / 2;
          paddle.held = 0;
          paddle.offset = 0;
        }
        state.left.direction = 0;
        paddleCount = 0;
      }
      state.phase = 'toss';
      state.countdown = 0;
      state.ball.speed = 0;
      tossClock = animate ? 0 : tossDuration;
      placeTossed(tossClock);
    },

    setRemote: (remote) => {
      if (state.remote === remote) return;
      if (state.attract) endAttract();
      state.remote = remote;
      state.awaiting = false;
      state.predicted = false;
      state.left.offset = 0;
      inbox.hasBall = false;
      inbox.miss = false;
      paddleCount = 0;
      paddleDelay = paddleDelayStart;
      dismiss('left');
    },

    remotePaddle: (y, direction, held, age) => {
      if (!state.remote) return;
      const old = Math.max(0, age);
      // With the ring full, the newest report gives way: the next one says where the paddle is anyway.
      const report = paddleReports[(paddleNext + Math.min(paddleCount, paddleReportsKept - 1)) % paddleReportsKept];
      if (report == null) return;
      if (paddleCount < paddleReportsKept) paddleCount += 1;
      report.y = y;
      report.direction = direction;
      report.held = held;
      report.due = paddleDelay - old;
      report.fresh = true;
      const wanted = Math.min(old + paddleDelayMargin, paddleDelayMax);
      paddleDelay += (wanted - paddleDelay) * (wanted > paddleDelay ? 1 : paddleDelayShrink);
    },

    remoteBall: (ball, kind, contactY, age) => {
      if (!state.remote) return;
      inbox.ball.x = ball.x;
      inbox.ball.y = ball.y;
      inbox.ball.speed = ball.speed;
      inbox.ball.heading = ball.heading;
      inbox.ball.angle = ball.angle;
      inbox.hasBall = true;
      inbox.kind = kind;
      inbox.contactY = contactY;
      inbox.age = Math.max(0, age);
    },

    remoteMiss: (x, y) => {
      if (!state.remote) return;
      inbox.miss = true;
      inbox.missX = x;
      inbox.missY = y;
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
      state.countdown = 0;
      state.scorer = null;
      state.winner = null;
      state.attract = false;
      state.awaiting = false;
      state.predicted = false;
      state.left.offset = 0;
      inbox.hasBall = false;
      inbox.miss = false;
      paddleCount = 0;
      paddleDelay = paddleDelayStart;
      dismiss('left');
      dismiss('right');
      parkBall();
    },

    step: (dt, input) => {
      events.length = 0;
      if (state.phase === 'paused' || state.width <= 0 || state.height <= 0) return events;
      const elapsed = Math.min(dt, maxDt);
      if (!(elapsed > 0)) return events;
      const leftBefore = state.left.y;
      const rightBefore = state.right.y;
      if (state.phase === 'start' && attractWanted && !state.attract && !state.remote) {
        state.attract = true;
        attractClock = 0;
      }
      if (state.attract && state.ball.speed === 0) {
        // Between attract rallies the paddles stand still until the next serve.
        steer(state.left, 0);
        steer(state.right, 0);
        attractClock += elapsed;
        if (attractClock < attractRest) return events;
        launch(state.server ?? (random() < 0.5 ? 'left' : 'right'));
      }
      const playing = inPlay();
      // In attract mode the AI has the right paddle too, and the keys do nothing.
      if (!state.attract) steer(state.right, input);
      // A remote player's paddle carries on the way they last reported it moving.
      const aiLeft = playing && !state.remote;
      if (aiLeft) think('left', elapsed);
      if (state.attract) think('right', elapsed);
      // A paddle or ball they have just reported is carried to the end of this step as it is taken in.
      if (state.left.offset !== 0) {
        state.left.offset *= Math.exp(-elapsed / paddleEase);
        if (Math.abs(state.left.offset) < 0.1) state.left.offset = 0;
      }
      if (!(state.remote && takePaddle(elapsed))) {
        movePaddle(state.left, elapsed, aiLeft ? aiDestination(state, 'left', ai) : null);
      }
      movePaddle(state.right, elapsed, state.attract ? aiDestination(state, 'right', ai) : null);
      if (state.remote && takeBall()) return events;
      if (inPlay()) moveBall(elapsed, leftBefore, rightBefore);
      else if (state.phase === 'toss') stepToss(elapsed);
      return events;
    },
  };
};
