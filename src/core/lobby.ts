import type { NetMessage } from './messages.js';
import { protocolVersion } from './protocol.js';
import type { ClientMessage, LobbyError, LobbyNotice, LobbyState, ServerMessage } from './protocol.js';

/** What the connection needs from a window: sockets, timers, and a clock. */
export type LobbyView = {
  WebSocket: typeof WebSocket;
  setTimeout: (handler: () => void, timeout: number) => number;
  clearTimeout: (timer: number) => void;
};

/**
 * Where a game stands with the two-player server:
 * - `idle`: not connected.
 * - `connecting`: creating or joining a lobby.
 * - `joined`: in a lobby.
 * - `reconnecting`: the connection dropped during a match and is being tried again.
 */
export type LobbyStatus = 'idle' | 'connecting' | 'joined' | 'reconnecting';

/** Why a lobby couldn't be reached: the server's reason, or `connection` when the server couldn't be reached at all. */
export type LobbyFailure = LobbyError | 'connection';

export type LobbyClientState = {
  status: LobbyStatus;
  /** The lobby as the server last described it, or `null` outside one. */
  lobby: LobbyState | null;
  /** Why the last attempt failed, until the next one. */
  error: LobbyFailure | null;
  /** What last happened to the lobby that its state doesn't say, until the next match starts. */
  notice: LobbyNotice | null;
};

export type LobbyHandlers = {
  /** Something in `state` changed. */
  onChange: () => void;
  /** A match begins: the toss starts at `at`, on the server's clock, and goes to the player named. */
  onStart: (server: 'you' | 'opponent', at: number) => void;
  /** A pause is over: play carries on at `at`, on the server's clock. */
  onResume: (at: number) => void;
  /** The other player's game sent this at `time`, on the server's clock. */
  onGame: (message: NetMessage, time: number) => void;
};

export type LobbyClient = {
  /** Mutated in place; `onChange` says when. */
  state: LobbyClientState;
  create: (winningScore: number) => void;
  join: (code: string) => void;
  ready: (ready: boolean) => void;
  /** As the lobby's host, between matches: set the points the next match is played to. */
  winningScore: (winningScore: number) => void;
  pause: (reason: 'manual' | 'away') => void;
  resume: () => void;
  /** Send the other player's game a message, stamped with the server's time it describes. */
  game: (message: NetMessage, time: number) => void;
  /** Leave the lobby, or give up connecting to one. */
  leave: () => void;
  /** The server's clock right now, in ms, as near as this game can tell. */
  serverNow: () => number;
};

// The server's clock is asked this often, in ms: quickly at first, to settle on an answer, then now and then.
const firstPings = 4;
const firstPingInterval = 250;
const pingInterval = 5000;
// Of the last few answers, the quickest is the one to trust.
const pingsKept = 6;
// A dropped match connection is tried again this often, for this long, in ms.
const retryInterval = 1500;
const retryFor = 30_000;

/**
 * A game's connection to the two-player server: it creates or joins a lobby,
 * keeps the lobby's state, works out the server's clock, and comes back by
 * itself if the connection drops during a match. It knows nothing of the game
 * being played; the engine does that with what arrives through `handlers`.
 */
export const createLobbyClient = (server: string, view: LobbyView, handlers: LobbyHandlers): LobbyClient => {
  const base = server.replace(/\/+$/, '');
  const state: LobbyClientState = { status: 'idle', lobby: null, error: null, notice: null };
  let socket: WebSocket | null = null;
  // The key to this game's seat, for coming back after a drop.
  let seat: string | null = null;
  let offset = 0;
  const samples: { rtt: number; offset: number }[] = [];
  let pings = 0;
  let pingTimer: number | null = null;
  let retryTimer: number | null = null;
  let retryUntil = 0;

  const send = (message: ClientMessage) => {
    if (socket?.readyState === view.WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const stopTimers = () => {
    if (pingTimer != null) view.clearTimeout(pingTimer);
    if (retryTimer != null) view.clearTimeout(retryTimer);
    pingTimer = null;
    retryTimer = null;
  };

  const ping = () => {
    send({ type: 'ping', time: Date.now() });
    pings += 1;
    pingTimer = view.setTimeout(ping, pings < firstPings ? firstPingInterval : pingInterval);
  };

  const heard = (sent: number, serverTime: number) => {
    const now = Date.now();
    samples.push({ rtt: now - sent, offset: serverTime - (sent + now) / 2 });
    if (samples.length > pingsKept) samples.shift();
    let best = samples[0];
    for (const sample of samples) {
      if (best == null || sample.rtt < best.rtt) best = sample;
    }
    if (best != null) offset = best.offset;
  };

  /** Let go of the socket without its closing being taken for a drop. */
  const release = () => {
    const old = socket;
    socket = null;
    stopTimers();
    if (old == null) return;
    old.onopen = null;
    old.onmessage = null;
    old.onclose = null;
    old.onerror = null;
    old.close();
  };

  const fail = (error: LobbyFailure) => {
    release();
    seat = null;
    state.status = 'idle';
    state.lobby = null;
    state.error = error;
    handlers.onChange();
  };

  const receive = (message: ServerMessage) => {
    switch (message.type) {
      case 'welcome':
        seat = message.seat;
        state.status = 'joined';
        state.lobby = message.state;
        state.error = null;
        if (pingTimer == null) {
          pings = 0;
          ping();
        }
        handlers.onChange();
        return;
      case 'state':
        state.lobby = message.state;
        handlers.onChange();
        return;
      case 'notice':
        state.notice = message.notice;
        handlers.onChange();
        return;
      case 'start':
        state.notice = null;
        handlers.onStart(message.server, message.at);
        return;
      case 'resume':
        handlers.onResume(message.at);
        return;
      case 'game':
        handlers.onGame(message.message, message.time);
        return;
      case 'pong':
        heard(message.time, message.serverTime);
        return;
      case 'error':
        fail(message.error);
        return;
    }
  };

  const connect = (path: string, hello: Extract<ClientMessage, { type: 'hello' }>) => {
    release();
    let opened: WebSocket;
    try {
      opened = new view.WebSocket(`${base}/lobby/${path}`);
    } catch {
      fail('connection');
      return;
    }
    socket = opened;
    opened.onopen = () => send(hello);
    opened.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      receive(message);
    };
    opened.onclose = () => {
      if (socket !== opened) return;
      socket = null;
      stopTimers();
      const { lobby } = state;
      // A match is worth coming back to; a lobby is only a code away.
      if (seat != null && lobby != null && lobby.phase !== 'lobby') {
        if (state.status !== 'reconnecting') retryUntil = Date.now() + retryFor;
        if (Date.now() < retryUntil) {
          state.status = 'reconnecting';
          handlers.onChange();
          const key = seat;
          retryTimer = view.setTimeout(() => connect(lobby.code, { type: 'hello', version: protocolVersion, seat: key }), retryInterval);
          return;
        }
      }
      fail('connection');
    };
  };

  const begin = (path: string, hello: Extract<ClientMessage, { type: 'hello' }>) => {
    seat = null;
    samples.length = 0;
    state.status = 'connecting';
    state.lobby = null;
    state.error = null;
    state.notice = null;
    handlers.onChange();
    connect(path, hello);
  };

  return {
    state,
    create: (winningScore) => begin('new', { type: 'hello', version: protocolVersion, winningScore }),
    join: (code) => begin(encodeURIComponent(code.trim()), { type: 'hello', version: protocolVersion }),
    ready: (ready) => send({ type: 'ready', ready }),
    winningScore: (winningScore) => send({ type: 'winningScore', winningScore }),
    pause: (reason) => send({ type: 'pause', reason }),
    resume: () => send({ type: 'resume' }),
    game: (message, time) => send({ type: 'game', time, message }),
    leave: () => {
      if (state.status === 'idle' && socket == null) return;
      send({ type: 'leave' });
      release();
      seat = null;
      state.status = 'idle';
      state.lobby = null;
      state.error = null;
      state.notice = null;
      handlers.onChange();
    },
    serverNow: () => Date.now() + offset,
  };
};
