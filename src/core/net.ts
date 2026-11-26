import type { BallReportKind, Direction, Simulation, SimulationEvent } from './simulation.js';

/**
 * The court every two-player match is played on, whatever box each player's
 * game is drawn in: two boxes of different shapes would otherwise be two
 * different games. Lengths are in px on a court this size, which each browser
 * scales to fit.
 */
export const standardCourt = {
  width: 1200,
  height: 675,
  ballSize: 15,
  paddleWidth: 15,
  /** 15% of the height. */
  paddleHeight: 101.25,
  /** Court heights per second. */
  paddleSpeed: 1.2,
} as const;

/**
 * What one player's game tells the other's. Each is written in the sender's
 * own view, with the sender on the right; `receive` turns it round.
 */
export type NetMessage =
  /** The sender's paddle: its top edge, the way it is moving, and for how long it has been. */
  | { type: 'paddle'; y: number; direction: Direction; held: number }
  /** The ball, after the sender served or hit it, or to agree on where it is. `contactY` is where a hit met the paddle. */
  | {
    type: 'ball';
    kind: BallReportKind;
    x: number;
    y: number;
    speed: number;
    heading: -1 | 1;
    angle: number;
    contactY: number;
  }
  /** The sender's paddle missed the ball: the point is the receiver's. */
  | { type: 'miss' };

export type NetLink = {
  /**
   * After each step of the simulation, send what the other player needs to
   * hear of it: a hit, a serve, a miss, and the paddle whenever its movement
   * changes. `events` is what the step returned, and `dt` its length in seconds.
   */
  report: (events: readonly SimulationEvent[], dt: number) => void;
  /**
   * Serve, if it is this player's serve, and say whether a ball left. The
   * other player is told by the next `report`, as of the end of that step:
   * every ball is reported as of the end of a step, so that its age can be
   * measured from one.
   */
  serve: () => boolean;
  /** Send the ball as it is now, to agree on where it is: after a pause, say. */
  sync: () => void;
  /**
   * Take in a message from the other player. `age` is the seconds from when
   * it was sent to the end of the step that will follow, so call this just
   * before stepping.
   */
  receive: (message: NetMessage, age: number) => void;
};

// While a paddle keeps moving it is reported again this often, in seconds, so
// that the two games can't drift apart on where it is.
const paddleHeartbeat = 0.2;

/**
 * Join a simulation playing a remote opponent to the other player's game.
 * Each side decides what happens at its own paddle and reports it; this
 * works out what to report and applies what arrives. It knows nothing of
 * how messages travel: `send` is given each one to deliver.
 */
export const createNetLink = (simulation: Simulation, send: (message: NetMessage) => void): NetLink => {
  const { state } = simulation;
  let sentDirection: Direction = 0;
  let sinceSent = 0;
  // This side has served since the last report.
  let justServed = false;
  // Reused for every incoming ball, which the simulation copies from.
  const incoming = { x: 0, y: 0, speed: 0, heading: 1 as -1 | 1, angle: 0 };

  const sendBall = (kind: BallReportKind) => {
    const { ball, contact } = state;
    send({
      type: 'ball',
      kind,
      x: ball.x,
      y: ball.y,
      speed: ball.speed,
      heading: ball.heading,
      angle: ball.angle,
      contactY: contact.y,
    });
  };

  const sendPaddle = () => {
    const { right } = state;
    sentDirection = right.direction;
    sinceSent = 0;
    send({ type: 'paddle', y: right.y, direction: right.direction, held: right.held });
  };

  return {
    report: (events, dt) => {
      const { right } = state;
      sinceSent += dt;
      if (right.direction !== sentDirection || (right.direction !== 0 && sinceSent >= paddleHeartbeat)) sendPaddle();
      let hit = false;
      let served = justServed;
      justServed = false;
      let missed = false;
      for (let index = 0; index < events.length; index++) {
        const event = events[index];
        // The toss bounces the ball off both paddles for show; only a rally's hits are news.
        if (event === 'paddle' && state.contact.side === 'right' && state.phase !== 'toss') hit = true;
        else if (event === 'serve' && state.server === 'right') served = true;
        else if (event === 'point' && state.scorer === 'left') missed = true;
      }
      // A ball this side hit and then lost within one step is only a miss to the other.
      if (missed) send({ type: 'miss' });
      else if (served) sendBall('serve');
      else if (hit) sendBall('hit');
    },

    serve: () => {
      if (!simulation.serve()) return false;
      justServed = true;
      return true;
    },

    sync: () => {
      if (state.phase === 'rally' && !state.awaiting) sendBall('sync');
    },

    receive: (message, age) => {
      if (message.type === 'miss') {
        simulation.remoteMiss();
      } else if (message.type === 'paddle') {
        simulation.remotePaddle(message.y, message.direction, message.held, age);
      } else {
        // The sender is on the right of their court and on the left of this one.
        incoming.x = state.width - state.ballWidth - message.x;
        incoming.y = message.y;
        incoming.speed = message.speed;
        incoming.heading = message.heading === 1 ? -1 : 1;
        incoming.angle = message.angle;
        simulation.remoteBall(incoming, message.kind, message.contactY, age);
      }
    },
  };
};
