import type { NetMessage } from './messages.js';

/**
 * What a two-player game and its server say to each other, as JSON over a
 * WebSocket. A game connects to `/lobby/new` to create a lobby or to
 * `/lobby/<code>` to join one, and says `hello` first.
 *
 * The version goes up whenever a message changes in a way an older game or
 * server would get wrong. The two exchange it on connecting, and a mismatch
 * is refused with the `version` error rather than left to fail strangely.
 */
export const protocolVersion = 1;

/** Why the server refused or dropped a connection. */
export type LobbyError =
  /** The game and the server speak different versions of this protocol. */
  | 'version'
  /** No lobby has this code. */
  | 'notFound'
  /** The lobby already has two players. */
  | 'full'
  /** The server has as many lobbies open as it allows. */
  | 'busy'
  /** The connection sent more than the server allows, or something it couldn't read. */
  | 'rejected';

/** Why a match is paused: a player chose to, a player's game lost focus or was hidden, or a player's connection dropped. */
export type PauseReason = 'manual' | 'away' | 'disconnected';

/** Something that happened to the lobby that its state alone doesn't say. */
export type LobbyNotice =
  /** The other player left the lobby. */
  | 'opponentLeft'
  /** The other player's connection didn't come back in time, and the match was abandoned. */
  | 'abandoned';

export type ClientMessage =
  /**
   * The first message. `winningScore` is the creator's, and sets the lobby's.
   * `seat` is the key a game was given when it first joined: sending it back
   * reclaims its place after a dropped connection.
   */
  | { type: 'hello'; version: number; winningScore?: number; seat?: string }
  /** In the lobby: this player is ready for a match, or no longer is. */
  | { type: 'ready'; ready: boolean }
  /** During a match: something for the other player's game. `time` is on the server's clock, as this game estimates it. */
  | { type: 'game'; time: number; message: NetMessage }
  | { type: 'pause'; reason: 'manual' | 'away' }
  /** End a pause this player caused. */
  | { type: 'resume' }
  /** Leave the lobby for good. */
  | { type: 'leave' }
  /** Ask the server's time. `time` is the game's own clock, echoed back so it can tell how long the answer took. */
  | { type: 'ping'; time: number };

/** A lobby as one of its players sees it. */
export type LobbyState = {
  code: string;
  winningScore: number;
  phase: 'lobby' | 'playing' | 'paused';
  /** This player is ready. Only means anything in the lobby. */
  ready: boolean;
  /** The other player, or `null` while there isn't one. */
  opponent: { ready: boolean; connected: boolean } | null;
  /** The match under way, or the last one finished, until the next begins. */
  scores: { you: number; opponent: number };
  /** While paused: whose pause it is, and why. Only that player can end it. */
  pause: { by: 'you' | 'opponent'; reason: PauseReason } | null;
};

export type ServerMessage =
  /** The answer to `hello`: the lobby is joined. `seat` is the key to send back if the connection drops. */
  | { type: 'welcome'; version: number; seat: string; state: LobbyState }
  /** The lobby changed. */
  | { type: 'state'; state: LobbyState }
  | { type: 'notice'; notice: LobbyNotice }
  /** Both players are ready: the toss begins at `at`, on the server's clock, and goes to the player named. */
  | { type: 'start'; server: 'you' | 'opponent'; at: number }
  /** The pause is over: play carries on at `at`, on the server's clock, after a countdown to it. */
  | { type: 'resume'; at: number }
  /** From the other player's game, as they sent it. */
  | { type: 'game'; time: number; message: NetMessage }
  | { type: 'pong'; time: number; serverTime: number }
  /** The connection is refused or dropped, and closes after this. */
  | { type: 'error'; error: LobbyError };
