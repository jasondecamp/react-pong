// @vitest-environment node
import { protocolVersion } from '../src/core/protocol.js';
import type { ClientMessage, ServerMessage } from '../src/core/protocol.js';
import { seededRandom } from '../src/test/seededRandom.js';
import {
  createRoom,
  emptyLife,
  maxMessageLength,
  messageLimit,
  parseClientMessage,
  reconnectGrace,
  resumeDelay,
  startDelay,
} from './room.js';
import type { Room, RoomState, Seat } from './room.js';

const hello = (extra: Partial<Extract<ClientMessage, { type: 'hello' }>> = {}) => (
  { type: 'hello', version: protocolVersion, ...extra } as const
);

const serve: ClientMessage = {
  type: 'game',
  time: 0,
  message: { type: 'ball', kind: 'serve', x: 1170, y: 300, speed: 780, heading: -1, angle: 0.1, contactY: 300 },
};
const miss: ClientMessage = { type: 'game', time: 0, message: { type: 'miss' } };

/** A room on a host the test controls: a clock it moves, and a record of everything sent, closed, and saved. */
const setup = (saved?: RoomState) => {
  const host = {
    time: 1_000_000,
    sent: [[], []] as [ServerMessage[], ServerMessage[]],
    closed: [] as Seat[],
    alarmAt: null as number | null,
    saved: undefined as RoomState | null | undefined,
  };
  const room: Room = createRoom('BDFG', {
    now: () => host.time,
    random: seededRandom(5),
    send: (seat, message) => host.sent[seat].push(message),
    close: (seat) => host.closed.push(seat),
    setAlarm: (at) => {
      host.alarmAt = at;
    },
    save: (state) => {
      host.saved = state == null ? null : structuredClone(state);
    },
  }, saved);
  const last = (seat: Seat) => host.sent[seat][host.sent[seat].length - 1];
  const ofType = <T extends ServerMessage['type']>(seat: Seat, type: T) => (
    host.sent[seat].filter((message): message is Extract<ServerMessage, { type: T }> => message.type === type)
  );
  const lobbyState = (seat: Seat) => {
    const message = [...host.sent[seat]].reverse().find(({ type }) => type === 'state' || type === 'welcome');
    return message != null && 'state' in message ? message.state : undefined;
  };
  return { room, host, last, ofType, lobbyState };
};

/** Two players in, both ready, and the match begun. */
const playing = () => {
  const game = setup();
  game.room.join(hello({ winningScore: 2 }));
  game.room.join(hello());
  game.room.message(0, { type: 'ready', ready: true });
  game.room.message(1, { type: 'ready', ready: true });
  return game;
};

describe('joining', () => {
  it('seats the creator, who sets the winning score, and welcomes them with a key', () => {
    const { room, last, host } = setup();
    expect(room.join(hello({ winningScore: 5 }))).toBe(0);
    const welcome = last(0);
    expect(welcome).toMatchObject({
      type: 'welcome',
      version: protocolVersion,
      state: { code: 'BDFG', winningScore: 5, phase: 'lobby', ready: false, opponent: null },
    });
    expect(welcome?.type === 'welcome' && welcome.seat).toHaveLength(24);
    expect(host.saved?.players[0]?.connected).toBe(true);
  });

  it('seats a second player, tells the first, and keeps the creator\'s winning score', () => {
    const { room, lobbyState } = setup();
    room.join(hello({ winningScore: 5 }));
    expect(room.join(hello({ winningScore: 21 }))).toBe(1);
    expect(lobbyState(1)).toMatchObject({ winningScore: 5, opponent: { ready: false, connected: true } });
    expect(lobbyState(0)).toMatchObject({ opponent: { ready: false, connected: true } });
  });

  it('keeps the winning score within reason', () => {
    const { room } = setup();
    room.join(hello({ winningScore: 5000.7 }));
    expect(room.state.winningScore).toBe(99);
  });

  it('refuses a third player, and a game that speaks another version', () => {
    const { room } = setup();
    expect(room.join(hello({ version: protocolVersion + 1 }))).toBe('version');
    room.join(hello());
    room.join(hello());
    expect(room.join(hello())).toBe('full');
  });
});

describe('starting a match', () => {
  it('waits for both players to be ready', () => {
    const { room, ofType, lobbyState } = setup();
    room.join(hello());
    room.join(hello());
    room.message(0, { type: 'ready', ready: true });
    expect(lobbyState(1)).toMatchObject({ phase: 'lobby', opponent: { ready: true } });
    expect(ofType(0, 'start')).toHaveLength(0);
    room.message(0, { type: 'ready', ready: false });
    room.message(1, { type: 'ready', ready: true });
    expect(ofType(0, 'start')).toHaveLength(0);
  });

  it('tosses for the serve and tells each player whose it is, and when', () => {
    const { ofType, lobbyState, host } = playing();
    const [first] = ofType(0, 'start');
    const [second] = ofType(1, 'start');
    expect(first?.at).toBe(host.time + startDelay);
    expect(second?.at).toBe(first?.at);
    expect([first?.server, second?.server].sort()).toEqual(['opponent', 'you']);
    expect(lobbyState(0)).toMatchObject({ phase: 'playing', ready: false, scores: { you: 0, opponent: 0 } });
  });

  it('doesn\'t start with one player alone', () => {
    const { room, ofType } = setup();
    room.join(hello());
    room.message(0, { type: 'ready', ready: true });
    expect(ofType(0, 'start')).toHaveLength(0);
    expect(room.state.phase).toBe('lobby');
  });
});

describe('a match', () => {
  it('passes one game\'s messages to the other, untouched', () => {
    const { room, last, host } = playing();
    const before = host.sent[0].length;
    room.message(0, serve);
    expect(last(1)).toEqual(serve);
    expect(host.sent[0]).toHaveLength(before);
  });

  it('passes nothing outside a match', () => {
    const { room, host } = setup();
    room.join(hello());
    room.join(hello());
    const before = host.sent[1].length;
    room.message(0, serve);
    expect(host.sent[1]).toHaveLength(before);
  });

  it('scores a miss for the other player, once for each ball served', () => {
    const { room, lobbyState } = playing();
    room.message(0, miss);
    expect(room.state.scores).toEqual([0, 0]);
    room.message(0, serve);
    room.message(1, miss);
    room.message(1, miss);
    expect(room.state.scores).toEqual([1, 0]);
    expect(lobbyState(0)?.scores).toEqual({ you: 1, opponent: 0 });
    expect(lobbyState(1)?.scores).toEqual({ you: 0, opponent: 1 });
  });

  it('ends at the winning score, back in the lobby with the score showing and nobody ready', () => {
    const { room, lobbyState, ofType } = playing();
    room.message(0, serve);
    room.message(1, miss);
    room.message(0, serve);
    room.message(1, miss);
    expect(lobbyState(1)).toMatchObject({ phase: 'lobby', ready: false, scores: { you: 0, opponent: 2 } });
    // Both ready again: a new match, from nothing.
    room.message(0, { type: 'ready', ready: true });
    room.message(1, { type: 'ready', ready: true });
    expect(ofType(0, 'start')).toHaveLength(2);
    expect(room.state.scores).toEqual([0, 0]);
  });
});

describe('pausing', () => {
  it('pauses for both, and says whose pause it is', () => {
    const { room, lobbyState } = playing();
    room.message(1, { type: 'pause', reason: 'away' });
    expect(lobbyState(0)).toMatchObject({ phase: 'paused', pause: { by: 'opponent', reason: 'away' } });
    expect(lobbyState(1)).toMatchObject({ phase: 'paused', pause: { by: 'you', reason: 'away' } });
  });

  it('still passes on what a game sent before it heard of the pause', () => {
    const { room, last } = playing();
    room.message(1, { type: 'pause', reason: 'manual' });
    room.message(0, serve);
    expect(last(1)).toEqual(serve);
    room.message(1, miss);
    expect(room.state.scores).toEqual([1, 0]);
  });

  it('lets only the player who paused resume, with a countdown for both', () => {
    const { room, ofType, host } = playing();
    room.message(1, { type: 'pause', reason: 'manual' });
    room.message(0, { type: 'resume' });
    expect(room.state.phase).toBe('paused');
    room.message(1, { type: 'resume' });
    expect(room.state.phase).toBe('playing');
    expect(ofType(0, 'resume')).toEqual([{ type: 'resume', at: host.time + resumeDelay }]);
    expect(ofType(1, 'resume')).toEqual(ofType(0, 'resume'));
  });
});

describe('a dropped connection', () => {
  it('in the lobby, frees the seat and tells the other player', () => {
    const { room, ofType, lobbyState } = setup();
    room.join(hello());
    room.join(hello());
    room.dropped(0);
    expect(ofType(1, 'notice')).toEqual([{ type: 'notice', notice: 'opponentLeft' }]);
    expect(lobbyState(1)?.opponent).toBeNull();
    expect(room.join(hello())).toBe(0);
  });

  it('during a match, pauses it and holds the seat', () => {
    const { room, lobbyState, host } = playing();
    room.dropped(1);
    expect(lobbyState(0)).toMatchObject({
      phase: 'paused',
      pause: { by: 'opponent', reason: 'disconnected' },
      opponent: { connected: false },
    });
    expect(host.alarmAt).toBe(host.time + reconnectGrace);
    // The other player can't end this pause.
    room.message(0, { type: 'resume' });
    expect(room.state.phase).toBe('paused');
    // And a stranger can't take the held seat.
    expect(room.join(hello())).toBe('full');
  });

  it('resumes with a countdown when the player comes back with their key', () => {
    const { room, ofType, host } = playing();
    const [welcome] = ofType(1, 'welcome');
    room.dropped(1);
    host.time += 10_000;
    expect(room.join(hello({ seat: welcome?.seat }))).toBe(1);
    expect(room.state.phase).toBe('playing');
    expect(host.alarmAt).toBeNull();
    expect(ofType(0, 'resume')).toEqual([{ type: 'resume', at: host.time + resumeDelay }]);
    expect(ofType(1, 'welcome')).toHaveLength(2);
  });

  it('abandons the match when the player doesn\'t come back in time', () => {
    const { room, ofType, lobbyState, host } = playing();
    room.dropped(1);
    host.time += reconnectGrace;
    room.alarm();
    expect(ofType(0, 'notice')).toEqual([{ type: 'notice', notice: 'abandoned' }]);
    expect(lobbyState(0)).toMatchObject({ phase: 'lobby', opponent: null, pause: null });
    expect(room.join(hello())).toBe(1);
  });

  it('waits for the second player when both dropped and one comes back', () => {
    const { room, ofType, lobbyState } = playing();
    const [welcome] = ofType(0, 'welcome');
    room.dropped(0);
    room.dropped(1);
    room.join(hello({ seat: welcome?.seat }));
    expect(lobbyState(0)).toMatchObject({ phase: 'paused', pause: { by: 'opponent', reason: 'disconnected' } });
    expect(ofType(0, 'resume')).toHaveLength(0);
  });

  it('hands a seat to a second connection with its key, closing the first', () => {
    const { room, ofType, host } = playing();
    const [welcome] = ofType(0, 'welcome');
    expect(room.join(hello({ seat: welcome?.seat }))).toBe(0);
    expect(host.closed).toEqual([0]);
    expect(room.state.phase).toBe('playing');
  });
});

describe('leaving', () => {
  it('frees the seat, closes the connection, and abandons a match under way', () => {
    const { room, ofType, lobbyState, host } = playing();
    room.message(0, { type: 'leave' });
    expect(host.closed).toEqual([0]);
    expect(ofType(1, 'notice')).toEqual([{ type: 'notice', notice: 'opponentLeft' }]);
    expect(lobbyState(1)).toMatchObject({ phase: 'lobby', opponent: null });
  });

  it('removes the lobby once it has stood empty long enough, and not before', () => {
    const { room, host } = setup();
    room.join(hello());
    room.message(0, { type: 'leave' });
    expect(host.alarmAt).toBe(host.time + emptyLife);
    host.time += emptyLife - 1;
    room.alarm();
    expect(host.saved).not.toBeNull();
    host.time += 1;
    room.alarm();
    expect(host.saved).toBeNull();
    expect(host.alarmAt).toBeNull();
  });

  it('keeps an empty lobby for someone who joins in time', () => {
    const { room, host } = setup();
    room.join(hello());
    room.message(0, { type: 'leave' });
    host.time += 60_000;
    expect(room.join(hello())).toBe(0);
    expect(host.alarmAt).toBeNull();
  });
});

describe('the server\'s limits', () => {
  it('drops a connection that sends too much', () => {
    const { room, last, host, ofType } = playing();
    // A new second, so the count starts from nothing.
    host.time += 1000;
    for (let count = 0; count < messageLimit; count++) room.message(0, { type: 'ping', time: count });
    expect(host.closed).toEqual([]);
    room.message(0, { type: 'ping', time: 0 });
    expect(last(0)).toEqual({ type: 'error', error: 'rejected' });
    expect(host.closed).toEqual([0]);
    expect(ofType(1, 'notice')).toEqual([{ type: 'notice', notice: 'opponentLeft' }]);
  });

  it('counts afresh each second', () => {
    const { room, host } = playing();
    host.time += 1000;
    for (let count = 0; count < messageLimit; count++) room.message(0, { type: 'ping', time: count });
    host.time += 1000;
    room.message(0, { type: 'ping', time: 0 });
    expect(host.closed).toEqual([]);
  });

  it('answers a ping with the server\'s time', () => {
    const { room, last, host } = playing();
    room.message(1, { type: 'ping', time: 42 });
    expect(last(1)).toEqual({ type: 'pong', time: 42, serverTime: host.time });
  });
});

describe('a lobby picked up again', () => {
  it('carries on from its saved state', () => {
    const first = playing();
    first.room.message(0, serve);
    first.room.message(1, miss);
    const again = setup(first.host.saved ?? undefined);
    expect(again.room.state.scores).toEqual([1, 0]);
    again.room.message(0, serve);
    expect(again.last(1)).toEqual(serve);
  });
});

describe('reading a message', () => {
  it('reads each message it knows', () => {
    const messages: ClientMessage[] = [
      { type: 'hello', version: 1, winningScore: 7, seat: 'abc' },
      { type: 'ready', ready: true },
      serve,
      miss,
      { type: 'game', time: 3, message: { type: 'paddle', y: 10, direction: -1, held: 0.2 } },
      { type: 'pause', reason: 'away' },
      { type: 'resume' },
      { type: 'leave' },
      { type: 'ping', time: 12 },
    ];
    for (const message of messages) expect(parseClientMessage(JSON.stringify(message))).toEqual(message);
  });

  it('refuses anything else', () => {
    const bad = [
      'not json',
      '[]',
      'null',
      '{"type":"shout"}',
      '{"type":"hello"}',
      '{"type":"ready","ready":"yes"}',
      '{"type":"pause","reason":"disconnected"}',
      '{"type":"game","time":0,"message":{"type":"ball","kind":"serve","x":1}}',
      '{"type":"game","time":0,"message":{"type":"paddle","y":1,"direction":2,"held":0}}',
      '{"type":"game","message":{"type":"miss"}}',
      `{"type":"ping","time":1,"pad":"${'x'.repeat(maxMessageLength)}"}`,
    ];
    for (const raw of bad) expect(parseClientMessage(raw)).toBeNull();
  });
});
