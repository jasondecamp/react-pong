import { paddleTravel } from './paddle.js';
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
export const aiProfiles = {
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
const distanceFrom = (state, side) => (side === 'left' ? state.ball.x : state.width - state.ballWidth - state.ball.x);
/** Walls fold a straight path back into the court: where a ball's top edge is after travelling to `y`. */
const fold = (y, maxBallY) => {
    if (maxBallY <= 0)
        return 0;
    const folded = ((y % (2 * maxBallY)) + 2 * maxBallY) % (2 * maxBallY);
    return folded > maxBallY ? 2 * maxBallY - folded : folded;
};
const swingOf = (shot) => {
    if (shot === 'up')
        return -1;
    return shot === 'down' ? 1 : 0;
};
/** Seconds until the ball reaches the face of the paddle on `side`, or `Infinity` if it isn't coming. */
const timeToReach = (state, side) => {
    const { ball } = state;
    if (ball.heading !== (side === 'left' ? -1 : 1))
        return Infinity;
    const across = ball.speed * Math.cos(ball.angle);
    if (across <= 0)
        return Infinity;
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
const timeToArrive = (state, side) => {
    const { ball } = state;
    const coming = timeToReach(state, side);
    if (coming !== Infinity)
        return coming;
    const across = ball.speed * Math.cos(ball.angle);
    if (across <= 0)
        return 0;
    const crossing = state.width - 2 * state.paddleWidth - state.ballWidth;
    const gap = side === 'left'
        ? state.width - state.paddleWidth - state.ballWidth - ball.x
        : ball.x - state.paddleWidth;
    return (Math.max(0, gap) + crossing) / across;
};
/** How far ahead the paddle on `side` looks when it places itself: all the way, with foresight. */
const lookAhead = (state, side, profile) => (profile.foresight ? timeToArrive(state, side) : timeToReach(state, side));
/**
 * Where the top edge of the paddle on `side` should be right now to play its
 * shot, with the ball `time` seconds away. It lines up the part of the paddle
 * the shot calls for with where the ball will be a moment from now (when it
 * arrives, once that is within the swing lead; with foresight, always when it
 * arrives). For a swing it also hangs
 * back by the distance it has yet to cover on the way in, picking up speed
 * from a standstill. All of it is off by the paddle's aiming error.
 */
const shotPosition = (state, side, profile, time) => {
    const { ball } = state;
    const { aim } = state[side];
    // A shot is chosen for a ball on its way; one going away is simply waited for.
    const shot = ball.heading === (side === 'left' ? -1 : 1) ? state[side].shot : 'center';
    const lead = Math.min(time, profile.swingLead);
    const ahead = profile.foresight ? time : lead;
    const ballY = fold(ball.y + ball.speed * Math.sin(ball.angle) * ahead, state.height - state.ballHeight);
    let contact = state.paddleHeight / 2;
    if (shot === 'top')
        contact = state.ballHeight / 4;
    else if (shot === 'bottom')
        contact = state.paddleHeight - state.ballHeight / 4;
    contact += aim * state.paddleHeight;
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
const aiSeeking = (state, side, profile) => {
    if (state[side].target == null || profile.foresight)
        return false;
    const away = state.ball.heading === (side === 'left' ? 1 : -1);
    return away || distanceFrom(state, side) >= state.width * profile.trackZone;
};
/**
 * The y that the paddle on `side` is making for and should stop exactly at:
 * the place it chose to wait, or the position its shot calls for. `null`
 * while it swings, when it means to keep moving through the ball.
 */
export const aiDestination = (state, side, profile) => {
    const paddle = state[side];
    if (aiSeeking(state, side, profile))
        return paddle.target;
    if (swingOf(paddle.shot) !== 0 && timeToReach(state, side) <= profile.swingLead)
        return null;
    return shotPosition(state, side, profile, lookAhead(state, side, profile));
};
/**
 * Whether the paddle on `side` should be swinging through the ball right
 * now: it means to, and the ball is within the swing's lead of arriving.
 */
export const aiSwinging = (state, side, profile) => (swingOf(state[side].shot) !== 0
    && !aiSeeking(state, side, profile)
    && timeToReach(state, side) <= profile.swingLead);
/**
 * How far off the mark the next return will be, as a fraction of the
 * paddle's height, decided along with the shot.
 */
export const aiAim = (profile, random) => (random() * 2 - 1) * profile.aimError;
/**
 * Which way the ball just sent across the court will be moving when it gets
 * there, up (`-1`) or down (`1`): each wall it meets on the way turns it round.
 */
const arrivalDrift = (state) => {
    const { ball } = state;
    const maxBallY = state.height - state.ballHeight;
    if (ball.angle === 0 || maxBallY <= 0)
        return 0;
    const crossing = state.width - 2 * state.paddleWidth - state.ballWidth;
    const walls = Math.abs(Math.floor((ball.y + Math.tan(ball.angle) * crossing) / maxBallY));
    const setOff = ball.angle > 0 ? 1 : -1;
    if (walls % 2 === 1)
        return setOff > 0 ? -1 : 1;
    return setOff;
};
/**
 * How to return the ball in `state`, decided the moment the opponent sends
 * it: sometimes on a corner, often on the move, otherwise squarely. A swing
 * goes either way, unless the ball is on a steep path: then it goes against
 * the ball, which flattens the path instead of steepening it further.
 */
export const aiShot = (state, profile, random) => {
    const roll = random();
    if (roll < profile.cornerChance)
        return random() < 0.5 ? 'top' : 'bottom';
    if (roll >= profile.cornerChance + profile.swingChance)
        return 'center';
    const drift = arrivalDrift(state);
    if (drift !== 0 && Math.abs(state.ball.angle) > profile.steepAngle)
        return drift > 0 ? 'up' : 'down';
    return random() < 0.5 ? 'up' : 'down';
};
/**
 * Where the paddle on `side` should wait, as the y of its top edge, decided
 * the moment it sends the ball away. The ball is taken to bounce off the walls
 * and the far paddle like a mirror, keeping its angle.
 */
export const aiTarget = (state, side, profile, random) => {
    const { ball } = state;
    const maxPaddleY = Math.max(0, state.height - state.paddleHeight);
    if (profile.positioning === 'random')
        return random() * maxPaddleY;
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
export const aiDirection = (state, side, profile, random) => {
    const paddle = state[side];
    if (paddle.target != null && aiSeeking(state, side, profile)) {
        if (paddle.target === paddle.y)
            return 0;
        return paddle.target > paddle.y ? 1 : -1;
    }
    const distance = distanceFrom(state, side);
    const swing = swingOf(paddle.shot);
    const time = timeToReach(state, side);
    const offset = shotPosition(state, side, profile, lookAhead(state, side, profile)) - paddle.y;
    // How far the middle of the paddle can be from the ball and still meet it squarely.
    const slack = Math.max(0, state.paddleHeight / 2 - state.ballHeight);
    let toward = 0;
    if (offset !== 0)
        toward = offset > 0 ? 1 : -1;
    // Swing through the ball, unless the paddle has got too far ahead of it.
    if (swing !== 0 && time <= profile.swingLead && swing * offset >= -slack)
        toward = swing;
    if (distance < state.width * profile.nearZone && random() < profile.nearChance)
        return toward;
    if ((distance < state.width * profile.trackZone && random() < profile.trackChance)
        || random() < profile.wanderChance) {
        // Close enough for a square hit: keep going if already headed that way, but don't set off.
        if (paddle.shot === 'center' && Math.abs(offset) <= slack && paddle.direction !== toward)
            return 0;
        return toward;
    }
    return 0;
};
//# sourceMappingURL=ai.js.map