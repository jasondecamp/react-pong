/**
 * What one player's game tells the other's. Each is written in the sender's
 * own view, with the sender on the right; the link in net.ts turns it round.
 *
 * This file imports nothing, so the server can read it without the rest of
 * the game.
 */
export type NetMessage =
  /** The sender's paddle: its top edge, the way it is moving, and for how long it has been. */
  | { type: 'paddle'; y: number; direction: -1 | 0 | 1; held: number }
  /** The ball, after the sender served or hit it, or to agree on where it is. `contactY` is where a hit met the paddle. */
  | {
    type: 'ball';
    kind: 'serve' | 'hit' | 'sync';
    x: number;
    y: number;
    speed: number;
    heading: -1 | 1;
    angle: number;
    contactY: number;
  }
  /**
   * The sender's paddle missed the ball: the point is the receiver's. `x` and
   * `y` are where the ball came to rest, since the receiver's may be
   * elsewhere: it guesses at the sender's hits ahead of their word.
   */
  | { type: 'miss'; x: number; y: number };
