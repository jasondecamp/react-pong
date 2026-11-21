import { aiAim, aiDestination, aiDirection, aiProfiles, aiShot, aiSwinging, aiTarget } from './ai.js';
import { maxHold, paddleRate } from './paddle.js';
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
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
/**
 * The game itself: court, ball, paddles, scores, and phase. Pure: it touches
 * no DOM and draws every random number from `random`.
 */
export const createSimulation = (random) => {
    const state = {
        width: 0,
        height: 0,
        ballWidth: 0,
        ballHeight: 0,
        paddleWidth: 0,
        paddleHeight: 0,
        paddleSpeed: 1.2,
        ball: { x: 0, y: 0, speed: 0, heading: 1, angle: 0 },
        left: { y: 0, direction: 0, held: 0, target: null, shot: 'center', aim: 0 },
        right: { y: 0, direction: 0, held: 0, target: null, shot: 'center', aim: 0 },
        contact: { side: 'left', x: 0, y: 0 },
        scores: { left: 0, right: 0 },
        phase: 'start',
        server: null,
        countdown: 0,
        scorer: null,
        winner: null,
    };
    const events = [];
    let ai = aiProfiles.normal;
    let winningScore = 11;
    // Seconds since the AI last decided.
    let aiClock = 0;
    // The AI has begun the swing it planned for the ball coming at it.
    let aiSwung = false;
    // The ball got past the paddle it was heading for, and is on its way out.
    let missed = false;
    // Seconds into the toss for the first serve.
    let tossClock = 0;
    /** Off the court, where the start screen keeps the ball. */
    const parkBall = () => {
        state.ball.x = -2 * state.ballWidth;
        state.ball.y = (state.height - state.ballHeight) / 2;
        state.ball.speed = 0;
    };
    /** How far the tossed ball has travelled `time` seconds in, in crossings of the court: fast at first, still at the end. */
    const tossTravel = (time) => {
        const left = 1 - Math.min(1, time / tossDuration);
        return tossSpans * (1 - left * left);
    };
    /** Put the tossed ball where it is `time` seconds in, level with the paddles it runs between. */
    const placeTossed = (time) => {
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
        ball.y = clamp(level + (state.paddleHeight - state.ballHeight) / 2, 0, Math.max(0, state.height - state.ballHeight));
    };
    /** Send the ball off from the face of the server's paddle. */
    const launch = (server) => {
        const { ball } = state;
        ball.x = server === 'left' ? state.paddleWidth : state.width - state.paddleWidth - state.ballWidth;
        ball.y = clamp(state[server].y + (state.paddleHeight - state.ballHeight) / 2, 0, Math.max(0, state.height - state.ballHeight));
        ball.speed = state.width * serveSpeed * (1 + (random() * 2 - 1) * serveSpeedVariation);
        ball.heading = server === 'left' ? 1 : -1;
        ball.angle = (random() * 2 - 1) * maxServeAngle;
        state.server = server;
        state.countdown = 0;
        state.left.target = server === 'left' ? aiTarget(state, 'left', ai, random) : null;
        state.left.shot = server === 'left' ? 'center' : aiShot(state, ai, random);
        state.left.aim = server === 'left' ? 0 : aiAim(ai, random);
        state.phase = 'rally';
        aiClock = 0;
        missed = false;
    };
    // The toss, the countdown, and the serve at the end of it.
    const stepToss = (dt) => {
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
        }
        else if (count <= 0) {
            launch(server);
            events.push('serve');
        }
        else {
            placeTossed(tossDuration);
            if (count !== state.countdown) {
                events.push(state.countdown === 0 ? 'toss' : 'count');
                state.countdown = count;
            }
        }
    };
    const steer = (paddle, direction) => {
        if (paddle.direction === direction)
            return;
        paddle.direction = direction;
        paddle.held = 0;
    };
    /** Move a paddle the way it is steered. One making for a particular place (`stopAt`) stops exactly there. */
    const movePaddle = (paddle, dt, stopAt) => {
        const maxY = state.height - state.paddleHeight;
        if (paddle.direction === 0)
            return;
        // Pushing against a wall builds no more speed.
        if (paddle.direction === 1 ? paddle.y >= maxY : paddle.y <= 0)
            return;
        paddle.held = Math.min(paddle.held + dt, maxHold);
        const from = paddle.y;
        const speed = state.paddleSpeed * state.height * paddleRate(paddle.held);
        paddle.y = clamp(from + paddle.direction * speed * dt, 0, maxY);
        if (stopAt != null && (stopAt - from) * (stopAt - paddle.y) <= 0)
            paddle.y = stopAt;
    };
    const point = (scorer) => {
        state.scores[scorer] += 1;
        state.scorer = scorer;
        // Scoring earns the next serve.
        state.server = scorer;
        state.ball.speed = 0;
        state.left.target = null;
        state.left.shot = 'center';
        state.left.aim = 0;
        steer(state.left, 0);
        events.push('point');
        if (state.scores[scorer] >= winningScore) {
            state.phase = 'gameOver';
            state.winner = scorer;
            events.push('gameOver');
        }
        else {
            state.phase = 'between';
        }
    };
    /** The paddle on `side` sends the ball back along a path slanted by `angle`. */
    const deflect = (side, angle) => {
        const { ball, contact } = state;
        // The middle of the ball's side that faces the paddle.
        contact.side = side;
        contact.x = side === 'left' ? ball.x : ball.x + state.ballWidth;
        contact.y = ball.y + state.ballHeight / 2;
        ball.heading = side === 'left' ? 1 : -1;
        ball.angle = clamp(angle, -maxAngle, maxAngle);
        ball.speed *= hitSpeedUp;
        // Having sent the ball away, the AI decides at once where to wait for it.
        // With the ball on its way back, it decides how to return it.
        if (side === 'left') {
            state.left.target = aiTarget(state, 'left', ai, random);
        }
        else {
            state.left.shot = aiShot(state, ai, random);
            state.left.aim = aiAim(ai, random);
        }
        events.push('paddle');
    };
    /**
     * The ball meets the face of the paddle on `side`, whose top edge is at
     * `paddleY` and which is moving at `paddleVelocity` px per second (down is
     * positive).
     */
    const hit = (side, paddleY, paddleVelocity) => {
        const { ball } = state;
        if (paddleY >= ball.y + state.ballHeight || ball.y >= paddleY + state.paddleHeight) {
            missed = true;
            return;
        }
        const center = ball.y + state.ballHeight / 2;
        let angle;
        if (center < paddleY + state.ballHeight) {
            angle = -edgeAngle;
        }
        else if (center > paddleY + state.paddleHeight - state.ballHeight) {
            angle = edgeAngle;
        }
        else {
            const slant = ball.angle * slantKept;
            const across = ball.speed * Math.cos(slant);
            const down = ball.speed * Math.sin(slant) + paddleVelocity * paddleGrip;
            angle = Math.atan2(down, across);
        }
        deflect(side, angle + (random() * 2 - 1) * hitJitter);
    };
    /**
     * For a ball that has got past the face of a paddle: how far through a
     * stretch of its path, from 0 to 1, the end of the paddle catches it, or
     * `-1` if it doesn't. `from` and `to` are the ball's top edge measured from
     * the paddle's, at the start and the end of the stretch. The paddle may
     * have run into the ball or the ball into the paddle.
     */
    const caughtAt = (from, to) => {
        const above = -state.ballHeight;
        const below = state.paddleHeight;
        if (Math.max(from, to) <= above || Math.min(from, to) >= below)
            return -1;
        if (from > above && from < below)
            return 0;
        return ((from <= above ? above : below) - from) / (to - from);
    };
    // Swept: the ball travels to whichever comes first of a wall, the face of
    // the paddle it is heading for, or the edge behind that paddle, and carries
    // on from there with the time left. The paddles have already moved, so each
    // is placed where it was at the moment the ball reached it.
    const moveBall = (dt, leftBefore, rightBefore) => {
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
            const heading = ball.heading === -1 ? 'left' : 'right';
            const face = heading === 'left' ? leftFace : rightFace;
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
            const caught = missed ? caughtAt(fromY - paddleFrom, ball.y - paddleTo) : -1;
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
            }
            else if (wall) {
                ball.angle = -ball.angle;
                events.push('wall');
            }
            else if (reached) {
                ball.x = target;
                if (missed) {
                    point(heading === 'left' ? 'right' : 'left');
                }
                else {
                    hit(heading, paddleTo, (paddle.y - before) / dt);
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
            if (width <= 0 || height <= 0)
                return;
            // Paddles keep their place along the travel they have; before the first
            // measurement they are centered.
            const paddleScale = wasSized && oldMaxPaddleY > 0 ? maxPaddleY / oldMaxPaddleY : null;
            left.y = paddleScale == null ? maxPaddleY / 2 : clamp(left.y * paddleScale, 0, maxPaddleY);
            if (left.target != null)
                left.target = paddleScale == null ? null : clamp(left.target * paddleScale, 0, maxPaddleY);
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
            if (state.phase !== 'start' && state.phase !== 'between')
                return;
            if (state.width <= 0 || state.height <= 0)
                return;
            launch(state.server ?? (random() < 0.5 ? 'left' : 'right'));
        },
        toss: (animate) => {
            if (state.phase !== 'start' || state.width <= 0 || state.height <= 0)
                return;
            state.server = random() < 0.5 ? 'left' : 'right';
            state.phase = 'toss';
            state.countdown = 0;
            state.ball.speed = 0;
            tossClock = animate ? 0 : tossDuration;
            placeTossed(tossClock);
        },
        pause: () => {
            if (state.phase === 'rally')
                state.phase = 'paused';
        },
        resume: () => {
            if (state.phase === 'paused')
                state.phase = 'rally';
        },
        reset: () => {
            state.scores.left = 0;
            state.scores.right = 0;
            state.phase = 'start';
            state.server = null;
            state.countdown = 0;
            state.scorer = null;
            state.winner = null;
            state.left.target = null;
            state.left.shot = 'center';
            state.left.aim = 0;
            steer(state.left, 0);
            steer(state.right, 0);
            parkBall();
        },
        step: (dt, input) => {
            events.length = 0;
            if (state.phase === 'paused' || state.width <= 0 || state.height <= 0)
                return events;
            const elapsed = Math.min(dt, maxDt);
            if (!(elapsed > 0))
                return events;
            const leftBefore = state.left.y;
            const rightBefore = state.right.y;
            steer(state.right, input);
            if (state.phase === 'rally') {
                // The AI decides at its own fixed rate, whatever the frame rate. A
                // swing is planned rather than a reaction, so it begins on time
                // instead of waiting for the next decision.
                aiClock += elapsed;
                const swinging = aiSwinging(state, 'left', ai);
                if (swinging && !aiSwung && ai.rate !== Infinity)
                    aiClock = Math.max(aiClock, 1 / ai.rate);
                aiSwung = swinging;
                const interval = 1 / ai.rate;
                if (interval <= 0) {
                    // No reaction time at all: it decides at every step.
                    aiClock = 0;
                    steer(state.left, aiDirection(state, 'left', ai, random));
                }
                while (interval > 0 && aiClock >= interval) {
                    aiClock -= interval;
                    steer(state.left, aiDirection(state, 'left', ai, random));
                }
            }
            movePaddle(state.left, elapsed, state.phase === 'rally' ? aiDestination(state, 'left', ai) : null);
            movePaddle(state.right, elapsed, null);
            if (state.phase === 'rally')
                moveBall(elapsed, leftBefore, rightBefore);
            else if (state.phase === 'toss')
                stepToss(elapsed);
            return events;
        },
    };
};
//# sourceMappingURL=simulation.js.map