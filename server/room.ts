import { protocolVersion } from '../src/core/protocol.js';
import type { ClientMessage, LobbyError, LobbyNotice, LobbyState, PauseReason, ServerMessage } from '../src/core/protocol.js';

/** A place in a lobby: the two players are seats 0 and 1, in the order they joined. */
export type Seat = 0 | 1;

type Player = {
  /** The secret that reclaims this seat after a dropped connection. */
  key: string;
  ready: boolean;
  connected: boolean;
  /** For a dropped connection during a match: when its seat is given up, in ms. */
  dropAt: number | null;
};

/** Everything about a lobby that has to outlive the process holding it. Plain data, so a host can store it as JSON. */
export type RoomState = {
  code: string;
  winningScore: number;
  /** Nobody has joined yet, so the first to arrive is the creator and may set the winning score. */
  fresh: boolean;
  phase: 'lobby' | 'playing' | 'paused';
  players: [Player | null, Player | null];
  /** By seat. The match under way, or the last one finished. */
  scores: [number, number];
  /** A ball is in play: it has been served and nobody has missed it yet. */
  live: boolean;
  pause: { by: Seat; reason: PauseReason } | null;
  /** When the last player left, in ms; `null` while anyone is here. */
  emptySince: number | null;
};

/** What a room needs from whatever runs it: a clock, its connections, a timer, and somewhere to keep its state. */
export type RoomHost = {
  /** The time, in ms. */
  now: () => number;
  random: () => number;
  send: (seat: Seat, message: ServerMessage) => void;
  /** Close a seat's connection. The room has already dealt with its going, so the host must not report it as dropped. */
  close: (seat: Seat) => void;
  /** Call `alarm()` at this time, in ms, in place of any earlier request; `null` for not at all. */
  setAlarm: (at: number | null) => void;
  /** The room's state changed and should be kept. `null`: the lobby is over, and its code is free. */
  save: (state: RoomState | null) => void;
};

export type Room = {
  state: RoomState;
  /** A new connection's `hello`: the seat it is given, or why it is refused. */
  join: (hello: Extract<ClientMessage, { type: 'hello' }>) => Seat | LobbyError;
  /** A message from a seated connection. */
  message: (seat: Seat, message: ClientMessage) => void;
  /** A seated connection closed without leaving. */
  dropped: (seat: Seat) => void;
  /** The time asked for with `setAlarm` has come. */
  alarm: () => void;
};

/** A dropped connection has this long to come back before its match is abandoned, in ms. */
export const reconnectGrace = 30_000;
/** A lobby with nobody in it is removed after this long, in ms. */
export const emptyLife = 5 * 60_000;
/** The toss begins this long after both players are ready, in ms, so that both games hear of it first. */
export const startDelay = 300;
/** After a pause, play carries on this long after the resume, in ms: a 3-2-1 countdown at 0.6s a number. */
export const resumeDelay = 1800;
/** A connection may send this many messages a second; one that sends more is dropped. */
export const messageLimit = 90;
/** The longest message the server reads, in characters. */
export const maxMessageLength = 512;
const defaultWinningScore = 11;
const maxWinningScore = 99;

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Whether `value` is a message one game may send another, with every field it should have. */
const isNetMessage = (value: unknown) => {
  if (!isRecord(value)) return false;
  if (value.type === 'miss') return true;
  if (value.type === 'paddle') {
    return finite(value.y) && finite(value.held) && (value.direction === -1 || value.direction === 0 || value.direction === 1);
  }
  return value.type === 'ball'
    && (value.kind === 'serve' || value.kind === 'hit' || value.kind === 'sync')
    && (value.heading === -1 || value.heading === 1)
    && finite(value.x) && finite(value.y) && finite(value.speed) && finite(value.angle) && finite(value.contactY);
};

/** Read a message from a connection: `null` for anything that isn't one this server knows, whole and well-formed. */
export const parseClientMessage = (raw: string): ClientMessage | null => {
  if (raw.length > maxMessageLength) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'hello': {
      if (!finite(value.version)) return null;
      if (value.winningScore !== undefined && !finite(value.winningScore)) return null;
      if (value.seat !== undefined && typeof value.seat !== 'string') return null;
      return { type: 'hello', version: value.version, winningScore: value.winningScore, seat: value.seat };
    }
    case 'ready':
      return typeof value.ready === 'boolean' ? { type: 'ready', ready: value.ready } : null;
    case 'game':
      return finite(value.time) && isNetMessage(value.message)
        ? { type: 'game', time: value.time, message: value.message as Extract<ClientMessage, { type: 'game' }>['message'] }
        : null;
    case 'pause':
      return value.reason === 'manual' || value.reason === 'away' ? { type: 'pause', reason: value.reason } : null;
    case 'resume':
      return { type: 'resume' };
    case 'leave':
      return { type: 'leave' };
    case 'ping':
      return finite(value.time) ? { type: 'ping', time: value.time } : null;
    default:
      return null;
  }
};

const keyLetters = 'abcdefghijklmnopqrstuvwxyz0123456789';

const newKey = (random: () => number) => {
  let key = '';
  for (let index = 0; index < 24; index++) key += keyLetters[Math.floor(random() * keyLetters.length)] ?? 'a';
  return key;
};

export const newRoomState = (code: string): RoomState => ({
  code,
  winningScore: defaultWinningScore,
  fresh: true,
  phase: 'lobby',
  players: [null, null],
  scores: [0, 0],
  live: false,
  pause: null,
  emptySince: null,
});

/**
 * One lobby: who is in it, whether they are ready, the match's score and
 * pauses, and the passing of one game's messages to the other. It decides
 * nothing about the ball or the paddles; each game does that for itself. It
 * knows nothing of sockets or of the host it runs on, which reach it through
 * `host`. `saved` is the state of a lobby being picked up again.
 */
export const createRoom = (code: string, host: RoomHost, saved?: RoomState): Room => {
  const state: RoomState = saved ?? newRoomState(code);
  // Messages each seat has sent in the second that began at `since`. Not kept: a host that forgets it only forgives.
  const traffic = [{ since: 0, count: 0 }, { since: 0, count: 0 }];

  const stateFor = (seat: Seat): LobbyState => {
    const opponent = state.players[other(seat)];
    let pause: LobbyState['pause'] = null;
    if (state.pause != null) pause = { by: state.pause.by === seat ? 'you' : 'opponent', reason: state.pause.reason };
    return {
      code: state.code,
      winningScore: state.winningScore,
      phase: state.phase,
      ready: state.players[seat]?.ready === true,
      opponent: opponent == null ? null : { ready: opponent.ready, connected: opponent.connected },
      scores: { you: state.scores[seat], opponent: state.scores[other(seat)] },
      pause,
    };
  };

  const sendTo = (seat: Seat, message: ServerMessage) => {
    if (state.players[seat]?.connected === true) host.send(seat, message);
  };

  const broadcastState = () => {
    sendTo(0, { type: 'state', state: stateFor(0) });
    sendTo(1, { type: 'state', state: stateFor(1) });
  };

  /** Ask for the alarm at whichever comes first: a seat's grace running out, or the empty lobby's life. */
  const schedule = () => {
    let at: number | null = state.emptySince == null ? null : state.emptySince + emptyLife;
    for (const player of state.players) {
      if (player?.dropAt != null && (at == null || player.dropAt < at)) at = player.dropAt;
    }
    host.setAlarm(at);
  };

  const commit = () => {
    schedule();
    host.save(state);
    broadcastState();
  };

  const endMatch = () => {
    state.phase = 'lobby';
    state.pause = null;
    state.live = false;
    for (const player of state.players) {
      if (player != null) player.ready = false;
    }
  };

  /** Give up a seat. A match under way can't go on without it. */
  const vacate = (seat: Seat, notice: LobbyNotice) => {
    if (state.players[seat] == null) return;
    state.players[seat] = null;
    if (state.phase !== 'lobby') endMatch();
    if (state.players[0] == null && state.players[1] == null) state.emptySince = host.now();
    sendTo(other(seat), { type: 'notice', notice });
  };

  const startMatch = () => {
    state.phase = 'playing';
    state.scores = [0, 0];
    state.live = false;
    state.pause = null;
    for (const player of state.players) {
      if (player != null) player.ready = false;
    }
    const server: Seat = host.random() < 0.5 ? 0 : 1;
    const at = host.now() + startDelay;
    sendTo(0, { type: 'start', server: server === 0 ? 'you' : 'opponent', at });
    sendTo(1, { type: 'start', server: server === 1 ? 'you' : 'opponent', at });
  };

  /** Whether this seat is within what a connection may send. Counted over whole seconds. */
  const allowed = (seat: Seat) => {
    const window = traffic[seat];
    if (window == null) return false;
    const now = host.now();
    if (now - window.since >= 1000) {
      window.since = now;
      window.count = 0;
    }
    window.count += 1;
    return window.count <= messageLimit;
  };

  const relay = (seat: Seat, message: Extract<ClientMessage, { type: 'game' }>) => {
    if (state.phase !== 'playing') return;
    const game = message.message;
    if (game.type === 'miss') {
      // A ball can be missed once: a second miss before the next serve is a repeat, or a lie.
      if (!state.live) return;
      state.live = false;
      const scorer = other(seat);
      state.scores[scorer] += 1;
      sendTo(scorer, message);
      if (state.scores[scorer] >= state.winningScore) endMatch();
      commit();
      return;
    }
    if (game.type === 'ball' && game.kind === 'serve') state.live = true;
    sendTo(other(seat), message);
  };

  return {
    state,

    join: (hello) => {
      if (hello.version !== protocolVersion) return 'version';
      const now = host.now();
      const returning = hello.seat == null ? -1 : state.players.findIndex((player) => player?.key === hello.seat);
      if (returning === 0 || returning === 1) {
        const player = state.players[returning];
        if (player == null) return 'notFound';
        // The same seat from a second connection takes the first one's place.
        if (player.connected) host.close(returning);
        player.connected = true;
        player.dropAt = null;
        host.send(returning, { type: 'welcome', version: protocolVersion, seat: player.key, state: stateFor(returning) });
        if (state.pause?.reason === 'disconnected') {
          const away = state.players[other(returning)];
          if (away != null && !away.connected) {
            // The other player is still gone: the wait is for them now.
            state.pause = { by: other(returning), reason: 'disconnected' };
          } else {
            state.phase = 'playing';
            state.pause = null;
            const at = now + resumeDelay;
            sendTo(0, { type: 'resume', at });
            sendTo(1, { type: 'resume', at });
          }
        }
        commit();
        return returning;
      }
      const seat: Seat | null = state.players[0] == null ? 0 : state.players[1] == null ? 1 : null;
      if (seat == null) return 'full';
      if (state.fresh && hello.winningScore != null) {
        state.winningScore = Math.min(maxWinningScore, Math.max(1, Math.floor(hello.winningScore)));
      }
      state.fresh = false;
      state.emptySince = null;
      const player: Player = { key: newKey(host.random), ready: false, connected: true, dropAt: null };
      state.players[seat] = player;
      host.send(seat, { type: 'welcome', version: protocolVersion, seat: player.key, state: stateFor(seat) });
      schedule();
      host.save(state);
      sendTo(other(seat), { type: 'state', state: stateFor(other(seat)) });
      return seat;
    },

    message: (seat, message) => {
      const player = state.players[seat];
      if (player == null) return;
      if (!allowed(seat)) {
        host.send(seat, { type: 'error', error: 'rejected' });
        host.close(seat);
        vacate(seat, 'opponentLeft');
        commit();
        return;
      }
      switch (message.type) {
        case 'ping':
          host.send(seat, { type: 'pong', time: message.time, serverTime: host.now() });
          return;
        case 'game':
          relay(seat, message);
          return;
        case 'ready': {
          if (state.phase !== 'lobby' || player.ready === message.ready) return;
          player.ready = message.ready;
          const opponent = state.players[other(seat)];
          if (player.ready && opponent?.ready === true && opponent.connected) startMatch();
          commit();
          return;
        }
        case 'pause':
          if (state.phase !== 'playing') return;
          state.phase = 'paused';
          state.pause = { by: seat, reason: message.reason };
          commit();
          return;
        case 'resume': {
          // Only the player whose pause it is can end it, and a dropped connection ends its own by coming back.
          if (state.phase !== 'paused' || state.pause?.by !== seat || state.pause.reason === 'disconnected') return;
          state.phase = 'playing';
          state.pause = null;
          const at = host.now() + resumeDelay;
          commit();
          sendTo(0, { type: 'resume', at });
          sendTo(1, { type: 'resume', at });
          return;
        }
        case 'leave':
          host.close(seat);
          vacate(seat, 'opponentLeft');
          commit();
          return;
        case 'hello':
          return;
      }
    },

    dropped: (seat) => {
      const player = state.players[seat];
      if (player == null || !player.connected) return;
      if (state.phase === 'lobby') {
        // Nothing is lost by a lobby seat going: its player can join again with the code.
        vacate(seat, 'opponentLeft');
      } else {
        player.connected = false;
        player.dropAt = host.now() + reconnectGrace;
        state.phase = 'paused';
        state.pause = { by: seat, reason: 'disconnected' };
      }
      commit();
    },

    alarm: () => {
      const now = host.now();
      for (const seat of [0, 1] as const) {
        const player = state.players[seat];
        if (player?.dropAt != null && player.dropAt <= now) vacate(seat, 'abandoned');
      }
      if (state.emptySince != null && state.emptySince + emptyLife <= now) {
        host.setAlarm(null);
        host.save(null);
        return;
      }
      commit();
    },
  };
};
