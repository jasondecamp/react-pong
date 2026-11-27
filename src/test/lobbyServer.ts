import { vi } from 'vitest';
import { newCode, normalizeCode } from '../../server/codes.js';
import { createRoom, parseClientMessage } from '../../server/room.js';
import type { Room, Seat } from '../../server/room.js';
import type { ServerMessage } from '../core/protocol.js';
import { seededRandom } from './seededRandom.js';

// A two-player server inside the test: a stand-in for `WebSocket` whose
// sockets talk to real rooms (server/room.ts), so a test plays through the
// same lobby rules the deployed server runs. Messages cross in microtasks;
// `settle` waits for them.

type Entry = {
  room: Room;
  sockets: [StubSocket | null, StubSocket | null];
  alarmAt: number | null;
  /** The socket whose hello is being answered, which has no seat yet. */
  joining: StubSocket | null;
};

class StubSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = StubSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  entry: Entry | null = null;
  seat: Seat | null = null;

  constructor(readonly url: string, private readonly server: LobbyServerStub) {
    queueMicrotask(() => server.accept(this));
  }

  send(data: string) {
    queueMicrotask(() => this.server.receive(this, data));
  }

  /** The game closed it. */
  close() {
    if (this.readyState === StubSocket.CLOSED) return;
    this.readyState = StubSocket.CLOSED;
    queueMicrotask(() => this.server.closed(this));
  }

  /** The server sends the game something. */
  deliver(message: ServerMessage) {
    queueMicrotask(() => {
      if (this.readyState === StubSocket.OPEN) this.onmessage?.({ data: JSON.stringify(message) });
    });
  }

  /** The server, or the network, closed it. */
  shut() {
    if (this.readyState === StubSocket.CLOSED) return;
    this.readyState = StubSocket.CLOSED;
    queueMicrotask(() => this.onclose?.());
  }
}

export type LobbyServerStub = {
  /** Every lobby open, by its code. */
  rooms: Map<string, Entry>;
  /** Every socket a game has opened, in order. */
  sockets: StubSocket[];
  /** While `false`, connections fail, as when the server can't be reached. */
  reachable: boolean;
  accept: (socket: StubSocket) => void;
  receive: (socket: StubSocket, data: string) => void;
  closed: (socket: StubSocket) => void;
  /** Cut a lobby seat's connection, as a network would. */
  drop: (code: string, seat: Seat) => void;
  /** Wait for every message in flight to arrive. */
  settle: () => Promise<void>;
};

/** Stand a two-player server in for `WebSocket`, until the test's globals are restored. */
export const stubLobbyServer = (): LobbyServerStub => {
  const random = seededRandom(11);
  const refuse = (socket: StubSocket, error: Extract<ServerMessage, { type: 'error' }>['error']) => {
    socket.deliver({ type: 'error', error });
    queueMicrotask(() => socket.shut());
  };

  const server: LobbyServerStub = {
    rooms: new Map(),
    sockets: [],
    reachable: true,

    accept: (socket) => {
      if (!server.reachable) {
        socket.shut();
        return;
      }
      const path = /\/lobby\/([^/]+)$/.exec(socket.url)?.[1] ?? '';
      socket.readyState = StubSocket.OPEN;
      socket.onopen?.();
      if (path === 'new') {
        const code = newCode(random);
        const entry: Entry = { sockets: [null, null], alarmAt: null, joining: null, room: createRoom(code, {
          now: () => Date.now(),
          random,
          send: (seat, message) => (entry.sockets[seat] ?? entry.joining)?.deliver(message),
          close: (seat) => {
            const seated = entry.sockets[seat];
            entry.sockets[seat] = null;
            if (seated != null) {
              seated.seat = null;
              seated.shut();
            }
          },
          setAlarm: (at) => {
            entry.alarmAt = at;
          },
          save: (state) => {
            if (state == null) server.rooms.delete(code);
          },
        }) };
        server.rooms.set(code, entry);
        socket.entry = entry;
        return;
      }
      const code = normalizeCode(decodeURIComponent(path));
      socket.entry = code == null ? null : server.rooms.get(code) ?? null;
    },

    receive: (socket, data) => {
      const message = parseClientMessage(data);
      if (message == null) {
        refuse(socket, 'rejected');
        return;
      }
      const { entry } = socket;
      if (socket.seat != null) {
        entry?.room.message(socket.seat, message);
        return;
      }
      if (message.type !== 'hello') return;
      if (entry == null) {
        refuse(socket, 'notFound');
        return;
      }
      entry.joining = socket;
      const given = entry.room.join(message);
      entry.joining = null;
      if (typeof given === 'string') {
        refuse(socket, given);
        return;
      }
      socket.seat = given;
      entry.sockets[given] = socket;
    },

    closed: (socket) => {
      const { entry, seat } = socket;
      if (entry == null || seat == null || entry.sockets[seat] !== socket) return;
      entry.sockets[seat] = null;
      entry.room.dropped(seat);
    },

    drop: (code, seat) => {
      const entry = server.rooms.get(code);
      const socket = entry?.sockets[seat];
      if (entry == null || socket == null) return;
      entry.sockets[seat] = null;
      socket.seat = null;
      socket.shut();
      entry.room.dropped(seat);
    },

    settle: async () => {
      for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    },
  };

  vi.stubGlobal('WebSocket', class extends StubSocket {
    constructor(url: string) {
      super(url, server);
      server.sockets.push(this);
    }
  });
  return server;
};
