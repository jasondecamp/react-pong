/** A side of the court. The AI plays `left`; the keyboard plays `right`. */
export type Side = 'left' | 'right';

/**
 * Where the game is:
 * - `start`: the start screen, before the first serve.
 * - `rally`: the ball is in play.
 * - `paused`: a rally is frozen.
 * - `between`: a point was scored and the next serve is awaited.
 * - `gameOver`: a side reached the winning score.
 */
export type PongPhase = 'start' | 'rally' | 'paused' | 'between' | 'gameOver';

/**
 * What the game has to say, as a key rather than text:
 * - `start`: the start screen invitation.
 * - `smack.ai`: the AI scored (with `smack`, after some of its points).
 * - `smack.human`: the human scored (with `smack`, after some of their points).
 * - `paused`: a rally is paused.
 * - `gameOver`: a side just won.
 * - `reset`: serve was pressed after the game ended; only a reset continues.
 */
export type PongMessageKey = 'start' | 'smack.ai' | 'smack.human' | 'paused' | 'gameOver' | 'reset';

/** How early the AI reacts to the ball, and how well it places itself between hits. */
export type PongDifficulty = 'easy' | 'normal' | 'hard';

/** Something a key can do. */
export type PongAction = 'up' | 'down' | 'serve' | 'pause';

/** `KeyboardEvent.key` values mapped to the action each performs. */
export type PongKeys = Record<string, PongAction>;

export type PongScores = { left: number; right: number };

/** A snapshot of the game. A new object replaces it whenever anything in it changes, never per frame. */
export type PongState = {
  phase: PongPhase;
  scores: PongScores;
  /** The side that reached the winning score, or `null` until the game is over. */
  winner: Side | null;
  /** The current message, or `null` for none. */
  message: PongMessageKey | null;
  /** How many messages with this key were posted earlier in this match. */
  messageCount: number;
  /**
   * A random number in [0, 1) drawn at the start of each match. With `messageCount` it lets copy be dealt from
   * a deck shuffled once per match, so no line repeats until the deck runs out.
   */
  matchRoll: number;
};

export type PongPointEvent = {
  /** The side that scored. */
  scorer: Side;
  scores: PongScores;
};

export type PongGameOverEvent = {
  winner: Side;
  scores: PongScores;
};

export type PongOptions = {
  /** Points needed to win; there is no win-by-two. An integer, at least 1. Default `11`. */
  winningScore?: number;
  /**
   * How early the AI reacts to a ball coming at it, and where it waits after sending the ball away. `'easy'`
   * reacts in the third of the court nearest its paddle and waits level with where its shot will reach the
   * opponent; `'normal'` reacts in its own half and waits somewhere at random; `'hard'` reacts in the two thirds
   * nearest its paddle and waits where an unaltered return will come back to. Default `'normal'`.
   */
  difficulty?: PongDifficulty;
  /** Post a smack-talk message after about half the points, so it stays a surprise. Default `false`. */
  smack?: boolean;
  /** Play the wall, paddle, and point blips (Web Audio, starting with the first key press). Default `true`. */
  sound?: boolean;
  /**
   * Send rings rippling out from the spot where the ball meets a paddle. Needs the ripple elements; off under
   * `prefers-reduced-motion`. Default `true`.
   */
  ripple?: boolean;
  /**
   * The keys the court handles, as `KeyboardEvent.key` values mapped to actions. Replaces the whole map, and
   * several keys may share an action. Default `{ ArrowUp: 'up', ArrowDown: 'down', Enter: 'serve', Escape: 'pause' }`.
   */
  keys?: PongKeys;
  /**
   * Starting paddle speed, in court heights per second, at least 0. A paddle eases in to this speed over its
   * first 0.08 seconds, and one held in one direction goes on speeding up to three times this over two seconds.
   * Default `1.2`.
   */
  paddleSpeed?: number;
  /** Called after every point, including the last. */
  onPoint?: (event: PongPointEvent) => void;
  /** Called when a side reaches the winning score. */
  onGameOver?: (event: PongGameOverEvent) => void;
};

/** Options with every default filled in. The callbacks stay optional. */
export type ResolvedPongOptions = Required<Omit<PongOptions, 'onPoint' | 'onGameOver'>>
  & Pick<PongOptions, 'onPoint' | 'onGameOver'>;

/**
 * The elements the engine drives. It never creates or inserts any. The court is a positioned, focusable box; the
 * ball sits at the court's top-left corner and each paddle against its own edge, all three absolutely positioned
 * inside the court. `react-pong/styles.css` lays them out this way.
 */
export type PongElements = {
  court: HTMLElement;
  ball: HTMLElement;
  leftPaddle: HTMLElement;
  rightPaddle: HTMLElement;
  /**
   * Optional. One per paddle, at the court's top-left corner like the ball: the engine moves it to where the
   * ball met that paddle and restarts its animation by re-adding the class `pong-ripple-active`.
   */
  leftRipple?: HTMLElement | null;
  rightRipple?: HTMLElement | null;
};

export type PongInstance = {
  /** Serve the ball, from the start screen or between points. */
  serve: () => void;
  /** Freeze a rally. */
  pause: () => void;
  /** Continue a paused rally. */
  resume: () => void;
  /** Return to the start screen with the scores cleared. */
  reset: () => void;
  /** Merge new options; `undefined` restores a default. */
  update: (options: PongOptions) => void;
  /** The current snapshot. The same object is returned until something in it changes. */
  getState: () => PongState;
  /** Listen for snapshot changes (score, phase, or message; never per frame). Returns the unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
  /** Stop the loop and release every listener, observer, and the audio context. */
  destroy: () => void;
};
