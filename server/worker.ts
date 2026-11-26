import { DurableObject } from 'cloudflare:workers';
import type { LobbyError, ServerMessage } from '../src/core/protocol.js';
import { newCode, normalizeCode } from './codes.js';
import { createRoom, emptyLife, parseClientMessage } from './room.js';
import type { Room, RoomHost, RoomState, Seat } from './room.js';

// The Cloudflare end of the two-player server. Everything a lobby decides is
// in room.ts; this gives a room its sockets, its clock, its timer, and its
// storage, and puts each lobby in a Durable Object of its own.

type Env = {
  LOBBY: DurableObjectNamespace<Lobby>;
  DIRECTORY: DurableObjectNamespace<Directory>;
  /** The origins whose pages may connect, separated by commas. */
  ALLOWED_ORIGINS: string;
  /** How many lobbies may be open at once. */
  MAX_LOBBIES: string;
};

/** What is kept with each socket: the seat it has been given, or `null` before its hello and after the room has let it go. */
type Tag = { seat: Seat | null };

// A code that is still listed after this long, in ms, without its lobby
// having freed it is taken to be left over from a lobby that never said so.
const staleAfter = 24 * 60 * 60_000;
const codePrefix = 'code:';
const directoryName = 'directory';

const random = () => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32;

const seatOf = (socket: WebSocket) => (socket.deserializeAttachment() as Tag | null)?.seat ?? null;

/** Answer a WebSocket request with a connection that says why it is refused, and closes. */
const refuse = (error: LobbyError) => {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  server.send(JSON.stringify({ type: 'error', error } satisfies ServerMessage));
  server.close(1008, error);
  return new Response(null, { status: 101, webSocket: client });
};

/** Hands out lobby codes and counts the lobbies open, so that there are never more than the server allows. */
export class Directory extends DurableObject<Env> {
  /** A code for a new lobby, which is opened under it, or `null` when the server is full. */
  async allocate() {
    const listed = await this.ctx.storage.list<number>({ prefix: codePrefix });
    const now = Date.now();
    let open = 0;
    for (const [key, since] of listed) {
      if (now - since > staleAfter) await this.ctx.storage.delete(key);
      else open += 1;
    }
    if (open >= Number(this.env.MAX_LOBBIES)) return null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = newCode(random);
      // The lobby itself has the last word on whether a code is taken.
      if (!await this.env.LOBBY.get(this.env.LOBBY.idFromName(code)).open(code)) continue;
      await this.ctx.storage.put(codePrefix + code, now);
      return code;
    }
    return null;
  }

  /** A lobby is over, and its code can be used again. */
  async release(code: string) {
    await this.ctx.storage.delete(codePrefix + code);
  }
}

/** One lobby and its two connections. */
export class Lobby extends DurableObject<Env> {
  private room: Room | null = null;
  // The socket whose hello is being answered, which has no seat yet, and the seat the room is giving it.
  private joining: WebSocket | null = null;
  private joiningSeat: Seat | null = null;

  private readonly host: RoomHost = {
    now: () => Date.now(),
    random,
    send: (seat, message) => this.socketFor(seat)?.send(JSON.stringify(message)),
    close: (seat) => {
      const socket = this.seated(seat);
      if (socket == null) return;
      // Untagged first, so that its closing isn't reported to the room as a drop.
      socket.serializeAttachment({ seat: null } satisfies Tag);
      socket.close(1000);
    },
    setAlarm: (at) => {
      if (at == null) void this.ctx.storage.deleteAlarm();
      else void this.ctx.storage.setAlarm(at);
    },
    save: (state) => {
      if (state != null) {
        void this.ctx.storage.put('room', state);
        return;
      }
      const code = this.room?.state.code;
      this.room = null;
      void this.ctx.storage.deleteAll();
      if (code != null) {
        this.ctx.waitUntil(this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName(directoryName)).release(code));
      }
    },
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<RoomState>('room');
      if (saved == null) return;
      this.room = createRoom(saved.code, this.host, saved);
      // Sockets outlive a sleeping lobby, but not one that was restarted: a
      // seat kept as connected with no socket to show for it has dropped.
      for (const seat of [0, 1] as const) {
        if (saved.players[seat]?.connected === true && this.seated(seat) == null) this.room.dropped(seat);
      }
    });
  }

  private seated(seat: Seat) {
    return this.ctx.getWebSockets().find((socket) => seatOf(socket) === seat) ?? null;
  }

  /** The socket to reach a seat by: its own, or the one being given that seat right now. */
  private socketFor(seat: Seat) {
    const socket = this.seated(seat);
    if (socket != null || this.joining == null) return socket;
    if (this.joiningSeat == null) this.joiningSeat = seat;
    return this.joiningSeat === seat ? this.joining : null;
  }

  /** Open a new lobby under `code`, unless one is here already. */
  async open(code: string) {
    if (this.room != null) return false;
    this.room = createRoom(code, this.host);
    // Nobody is here yet: a lobby that no one comes to is removed like any other empty one.
    this.room.state.emptySince = Date.now() - 1;
    void this.ctx.storage.setAlarm(Date.now() + emptyLife);
    await this.ctx.storage.put('room', this.room.state);
    return true;
  }

  override async fetch() {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: null } satisfies Tag);
    return new Response(null, { status: 101, webSocket: client });
  }

  private reject(socket: WebSocket, error: LobbyError) {
    socket.serializeAttachment({ seat: null } satisfies Tag);
    socket.send(JSON.stringify({ type: 'error', error } satisfies ServerMessage));
    socket.close(1008, error);
  }

  override async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer) {
    const seat = seatOf(socket);
    const message = typeof data === 'string' ? parseClientMessage(data) : null;
    if (message == null) {
      this.reject(socket, 'rejected');
      if (seat != null) this.room?.dropped(seat);
      return;
    }
    if (seat != null) {
      this.room?.message(seat, message);
      return;
    }
    // A socket's first message has to be its hello.
    if (message.type !== 'hello') {
      this.reject(socket, 'rejected');
      return;
    }
    if (this.room == null) {
      this.reject(socket, 'notFound');
      return;
    }
    this.joining = socket;
    this.joiningSeat = null;
    const given = this.room.join(message);
    this.joining = null;
    if (typeof given === 'string') this.reject(socket, given);
    else socket.serializeAttachment({ seat: given } satisfies Tag);
  }

  override async webSocketClose(socket: WebSocket) {
    const seat = seatOf(socket);
    if (seat != null) this.room?.dropped(seat);
  }

  override async webSocketError(socket: WebSocket) {
    const seat = seatOf(socket);
    if (seat != null) this.room?.dropped(seat);
  }

  override async alarm() {
    this.room?.alarm();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const path = /^\/lobby\/([A-Za-z]+)$/.exec(url.pathname)?.[1];
    if (path == null) {
      return new Response('The react-pong two-player server.\n', { status: url.pathname === '/' ? 200 : 404 });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket.\n', { status: 426 });
    }
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGINS.split(',').map((entry) => entry.trim());
    if (origin == null || !allowed.includes(origin)) return new Response('This origin may not connect.\n', { status: 403 });
    let code: string | null;
    if (path === 'new') {
      code = await env.DIRECTORY.get(env.DIRECTORY.idFromName(directoryName)).allocate();
      if (code == null) return refuse('busy');
    } else {
      code = normalizeCode(path);
      if (code == null) return refuse('notFound');
    }
    return env.LOBBY.get(env.LOBBY.idFromName(code)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
