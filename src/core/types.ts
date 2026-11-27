import type { LobbyFailure } from './lobby.js';
import type { LobbyNotice, PauseReason } from './protocol.js';

/** A side of the court. The AI, or in a two-player match the other player, plays `left`; the keyboard plays `right`. */
export type Side = 'left' | 'right';

/**
 * Where the game is:
 * - `start`: the start screen, before the first serve.
 * - `toss`: the first serve is being tossed for and counted down to.
 * - `rally`: the ball is in play.
 * - `paused`: a rally is frozen.
 * - `between`: a point was scored and the next serve is awaited.
 * - `gameOver`: a side reached the winning score.
 */
export type PongPhase = 'start' | 'toss' | 'rally' | 'paused' | 'between' | 'gameOver';

/**
 * What the game has to say, as a key rather than text:
 * - `start`: the start screen invitation.
 * - `toss`: the first serve is being tossed for.
 * - `serve.ai`: the AI won the toss; `countdown` runs until it serves.
 * - `serve.human`: the human won the toss; `countdown` runs until they serve.
 * - `smack.ai`: the AI scored (with `smack`, after some of its points).
 * - `smack.human`: the human scored (with `smack`, after some of their points).
 * - `paused`: a rally is paused.
 * - `gameOver`: a side just won.
 * - `reset`: serve was pressed after the game ended; only a reset continues.
 *
 * And in a two-player match:
 * - `serve.opponent`: the other player won the toss; `countdown` runs until they serve.
 * - `toServe.you`, `toServe.opponent`: a point was scored, and the next serve is this player's or the other's.
 * - `paused.opponent`: the other player paused.
 * - `away.opponent`: the other player's game lost focus or was hidden.
 * - `disconnected.opponent`: the other player's connection dropped, and has a little while to come back.
 * - `reconnecting`: this game's own connection dropped, and it is trying again.
 * - `resuming`: a pause is over; `countdown` runs until play carries on.
 * - `won`, `lost`: the match is over.
 */
export type PongMessageKey =
  | 'start'
  | 'toss'
  | 'serve.ai'
  | 'serve.human'
  | 'smack.ai'
  | 'smack.human'
  | 'paused'
  | 'gameOver'
  | 'reset'
  | 'serve.opponent'
  | 'toServe.you'
  | 'toServe.opponent'
  | 'paused.opponent'
  | 'away.opponent'
  | 'disconnected.opponent'
  | 'reconnecting'
  | 'resuming'
  | 'won'
  | 'lost';

/**
 * How early the AI reacts to the ball, and how well it places itself between hits. `impossible` has no handicap
 * at all.
 */
export type PongDifficulty = 'easy' | 'normal' | 'hard' | 'impossible';

/** Something a key can do. */
export type PongAction = 'up' | 'down' | 'serve' | 'pause' | 'reset' | 'help' | 'difficulty' | 'lobby';

/** `KeyboardEvent.key` values mapped to the action each performs. */
export type PongKeys = Record<string, PongAction>;

export type PongScores = { left: number; right: number };

/**
 * Where this game stands with two-player:
 * - `idle`: not in a lobby.
 * - `connecting`: creating or joining one.
 * - `waiting`: in a lobby, before a match or between two.
 * - `playing`: in a match.
 */
export type PongLobbyStatus = 'idle' | 'connecting' | 'waiting' | 'playing';

/** Two-player, as this game sees it. */
export type PongLobby = {
  /** Whether the two-player panel is open over the court. */
  open: boolean;
  status: PongLobbyStatus;
  /** The lobby's code, once in one. */
  code: string | null;
  /** The link that brings another player to this lobby, once in one. */
  link: string | null;
  /** A code this game was handed to join with, from the page's address or the `lobbyCode` option, for the panel's code field. */
  invitation: string | null;
  /** Why the last attempt to create or join a lobby failed, until the next. */
  error: LobbyFailure | null;
  /** What last happened to the lobby that the rest doesn't say: the other player left, or a match was abandoned. */
  notice: LobbyNotice | null;
  /** This player is ready for a match. */
  ready: boolean;
  /** The other player, or `null` while there isn't one. */
  opponent: { ready: boolean; connected: boolean } | null;
  /** This player is the lobby's host: its creator, or whoever was left when the host went. */
  host: boolean;
  /** Points needed to win a match in this lobby: its host's `winningScore`, which the host can change between matches. */
  winningScore: number;
  /** While a match is paused: whose pause it is, and why. Only that player can end it. */
  pause: { by: 'you' | 'opponent'; reason: PauseReason } | null;
};

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
  /** The number the countdown to the first serve is on, from 3 down to 1, or `null` when nothing is counting. */
  countdown: number | null;
  /** The AI's difficulty right now: the `difficulty` option, until the difficulty key changes it. */
  difficulty: PongDifficulty;
  /** Points needed to win: the `winningScore` option with its default filled in. */
  winningScore: number;
  /** Whether the help, the list of keys, is open. It is never open during a rally. */
  help: boolean;
  /** The keys the court handles right now: the `keys` option with its default filled in. */
  keys: PongKeys;
  /** Two-player, or `null` when the `server` option isn't set and there is none. */
  lobby: PongLobby | null;
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
   * nearest its paddle and waits where an unaltered return will come back to. It also aims better the harder it
   * is: its returns are off by up to 17.5%, 10%, and 4% of a paddle's height. `'impossible'` has no handicap: it
   * decides at every step instead of ten times a second, never hesitates, aims exactly, and works out where the
   * ball will arrive the moment it is hit and goes straight there. Its paddle is no faster than yours. The difficulty key steps through
   * them between games. Default `'normal'`.
   */
  difficulty?: PongDifficulty;
  /**
   * Attract mode: on the start screen the AI plays both paddles, like an arcade cabinet waiting for a coin. Its
   * rallies make no sound and score nothing, your paddle keys do nothing until you serve, and serving clears the
   * court for the real game. Off under `prefers-reduced-motion`. Default `true`.
   */
  attract?: boolean;
  /** Post a smack-talk message after about half the points, so it stays a surprise. Default `true`. */
  smack?: boolean;
  /** Play the wall, paddle, and point blips (Web Audio, starting with the first key press). Default `true`. */
  sound?: boolean;
  /**
   * Send rings rippling out from the spot where the ball meets a paddle. Needs the ripple elements; off under
   * `prefers-reduced-motion`. Default `true`.
   */
  ripple?: boolean;
  /**
   * Leave a fading trail behind the ball: every 0.05 seconds it leaves a ghost of itself where it is, which stays
   * put and fades away, so the ghosts sit further apart as the ball speeds up. Needs the trail element; off under
   * `prefers-reduced-motion`. Default `true`.
   */
  trail?: boolean;
  /**
   * Open each match with a toss for the first serve: the ball bounces between the paddles and comes to rest on
   * the side that won it (skipped under `prefers-reduced-motion`), that side is announced, and a 3-2-1 countdown
   * runs before the ball is served. With `false`, the first serve leaves at once. Default `true`.
   */
  toss?: boolean;
  /**
   * The keys the court handles, as `KeyboardEvent.key` values mapped to actions. Replaces the whole map, and
   * several keys may share an action. Default
   * `{ ArrowUp: 'up', ArrowDown: 'down', Enter: 'serve', ' ': 'pause', Escape: 'reset', '?': 'help', d: 'difficulty', 2: 'lobby' }`.
   */
  keys?: PongKeys;
  /**
   * Starting paddle speed, in court heights per second, at least 0. A paddle eases in to this speed over its
   * first 0.08 seconds, and one held in one direction goes on speeding up to three times this over two seconds.
   * Default `1.2`.
   */
  paddleSpeed?: number;
  /**
   * The two-player server's address, such as `wss://pong.example.workers.dev`. With it, the lobby key opens a panel
   * for creating a lobby or joining one by its code, and two people in two browsers can play each other. Without
   * it there is no two-player. A two-player match is played on a standard court scaled to fit, to the lobby
   * creator's `winningScore`, with no AI, smack talk, or difficulty. Default `null`.
   */
  server?: string | null;
  /**
   * The link that brings another player to a lobby, given its code. Default: the address of the page the game is
   * on, with `?pong=<code>`.
   */
  lobbyLink?: ((code: string) => string) | null;
  /**
   * A lobby code to offer to join, for a page that routes its own links. Default: the `pong` parameter of the
   * page's address, if it has one.
   */
  lobbyCode?: string | null;
  /** Called after every point, including the last. */
  onPoint?: (event: PongPointEvent) => void;
  /** Called when a side reaches the winning score. */
  onGameOver?: (event: PongGameOverEvent) => void;
  /** Called with the new difficulty when the difficulty key changes it, so a `difficulty` you control can follow. */
  onDifficultyChange?: (difficulty: PongDifficulty) => void;
};

/** Options with every default filled in. The callbacks stay optional. */
export type ResolvedPongOptions = Required<Omit<PongOptions, 'onPoint' | 'onGameOver' | 'onDifficultyChange'>>
  & Pick<PongOptions, 'onPoint' | 'onGameOver' | 'onDifficultyChange'>;

/**
 * The elements the engine drives. It never creates or inserts any. The court is a positioned, focusable box; the
 * ball sits at the court's top-left corner and each paddle against its own edge, all three absolutely positioned
 * inside the court. `react-pong/styles.css` lays them out this way.
 */
export type PongElements = {
  court: HTMLElement;
  ball: HTMLElement;
  /**
   * Optional. An element inside the ball that colors it by where it is across the court. `react-pong/styles.css`
   * paints it with a gradient between the two paddle colors and clips it to the ball; the engine stretches it to
   * the court's width and slides it opposite the ball. Without it the ball is one flat color.
   */
  ballColor?: HTMLElement | null;
  leftPaddle: HTMLElement;
  rightPaddle: HTMLElement;
  /**
   * Optional. One per paddle, at the court's top-left corner like the ball: the engine moves it to where the
   * ball met that paddle and restarts its animation by re-adding the class `pong-ripple-active`.
   */
  leftRipple?: HTMLElement | null;
  rightRipple?: HTMLElement | null;
  /**
   * Optional. A container whose children are ghosts of the ball, each built like the ball (its color element
   * included, if the ball has one), at the court's top-left corner. With the `trail` option on, the engine leaves
   * them behind the ball in turn, one every 0.05 seconds, and gives each a class (`pong-trail-fade` or
   * `pong-trail-fade-again`) that `react-pong/styles.css` fades it out with. A ghost is used again once the rest
   * have been, so ten cover the default 0.5 second fade.
   */
  trail?: HTMLElement | null;
  /**
   * Optional. An element at the court's top-left corner that the engine sizes and places over the standard court
   * during a two-player match, so the court's edges show wherever the box is a different shape. `react-pong/styles.css`
   * hides it otherwise.
   */
  frame?: HTMLElement | null;
};

export type PongInstance = {
  /** Serve the ball, from the start screen (after the toss and countdown, with `toss`) or between points. */
  serve: () => void;
  /** Freeze a rally. */
  pause: () => void;
  /** Continue a paused rally. */
  resume: () => void;
  /** Return to the start screen with the scores cleared. */
  reset: () => void;
  /** Open the help, pausing a rally first. While it is open, only the help and reset keys do anything: they close it. */
  openHelp: () => void;
  /** Close the help. A rally it paused stays paused. */
  closeHelp: () => void;
  /** Open the two-player panel, from the start screen. Does nothing without the `server` option. */
  openLobby: () => void;
  /** Close the two-player panel. A lobby is left rather than closed, so this does nothing while in one. */
  closeLobby: () => void;
  /** Create a lobby on the server, to this game's `winningScore`, and wait in it for another player. */
  createLobby: () => void;
  /** Join the lobby with this code. */
  joinLobby: (code: string) => void;
  /** In a lobby: say this player is ready for a match, or no longer is. The match starts when both are. */
  setReady: (ready: boolean) => void;
  /** Leave the lobby and return to the single-player start screen, closing the panel. */
  leaveLobby: () => void;
  /** Merge new options; `undefined` restores a default. */
  update: (options: PongOptions) => void;
  /** The current snapshot. The same object is returned until something in it changes. */
  getState: () => PongState;
  /** Listen for snapshot changes (score, phase, message, an option the snapshot carries, or help; never per frame). Returns the unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
  /** Stop the loop and release every listener, observer, and the audio context. */
  destroy: () => void;
};
