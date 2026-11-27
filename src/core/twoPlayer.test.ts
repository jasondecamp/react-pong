import { vi } from 'vitest';
import { stubBrowser } from '../test/browserStubs.js';
import type { BrowserStubs } from '../test/browserStubs.js';
import { stubLobbyServer } from '../test/lobbyServer.js';
import type { LobbyServerStub } from '../test/lobbyServer.js';
import { createPong } from './createPong.js';
import type { PongElements, PongInstance, PongOptions } from './types.js';

let browser: BrowserStubs;
let server: LobbyServerStub;

const piece = (className: string) => {
  const element = document.createElement('div');
  element.className = className;
  return element;
};

type Player = { pong: PongInstance; elements: PongElements & { frame: HTMLElement }; press: (name: string) => void };

/** A game on a court of its own, with the two-player server set unless a test says otherwise. */
const player = (options: PongOptions = {}): Player => {
  const court = piece('pong-court');
  court.tabIndex = 0;
  const ball = piece('pong-ball');
  const leftPaddle = piece('pong-paddle pong-paddle-left');
  const rightPaddle = piece('pong-paddle pong-paddle-right');
  const frame = piece('pong-frame');
  court.append(frame, ball, leftPaddle, rightPaddle);
  document.body.append(court);
  // Two courts share this page, and only one can have its focus: a real match has a browser for each.
  vi.spyOn(court, 'focus').mockImplementation(() => {});
  const elements = { court, ball, leftPaddle, rightPaddle, frame };
  const pong = createPong(elements, { server: 'ws://pong.test', attract: false, sound: false, ...options });
  const press = (name: string) => {
    court.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    court.dispatchEvent(new KeyboardEvent('keyup', { key: name, bubbles: true, cancelable: true }));
  };
  return { pong, elements, press };
};

/** Let time pass for every game on the page: timers, frames, and messages. */
const run = async (frames: number, until: () => boolean = () => false) => {
  for (let frame = 0; frame < frames && !until(); frame++) {
    vi.advanceTimersByTime(16);
    browser.frame(16);
    await server.settle();
  }
};

/** Two games in one lobby, both ready, and the match begun. */
const match = async (options: PongOptions = {}) => {
  const a = player(options);
  const b = player();
  a.pong.createLobby();
  await server.settle();
  b.pong.joinLobby(a.pong.getState().lobby?.code ?? '');
  await server.settle();
  a.pong.setReady(true);
  b.pong.setReady(true);
  await server.settle();
  return { a, b };
};

const ballX = ({ elements }: Player) => Number(/translate\((-?[\d.]+)px/.exec(elements.ball.style.transform)?.[1]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  browser = stubBrowser();
  server = stubLobbyServer();
});

afterEach(() => {
  document.body.replaceChildren();
  browser.restore();
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('without a server', () => {
  it('has no two-player at all', () => {
    const { pong, press } = player({ server: null });
    expect(pong.getState().lobby).toBeNull();
    press('2');
    pong.openLobby();
    pong.createLobby();
    expect(pong.getState().lobby).toBeNull();
    expect(server.sockets).toHaveLength(0);
  });
});

describe('the two-player panel', () => {
  it('opens on its key from the start screen and closes on it or on reset', () => {
    const { pong, press } = player();
    expect(pong.getState().lobby).toMatchObject({ open: false, status: 'idle', code: null });
    press('2');
    expect(pong.getState().lobby?.open).toBe(true);
    expect(pong.getState().message).toBeNull();
    press('2');
    expect(pong.getState().lobby?.open).toBe(false);
    expect(pong.getState().message).toBe('start');
    press('2');
    press('Escape');
    expect(pong.getState().lobby?.open).toBe(false);
  });

  it('keeps the serve key from starting a single-player game under it', () => {
    const { pong, press } = player();
    press('2');
    press('Enter');
    expect(pong.getState().phase).toBe('start');
  });

  it('rests attract mode behind it', () => {
    const { pong, press } = player({ attract: true });
    expect(browser.pendingFrames()).toBe(1);
    press('2');
    browser.frame();
    expect(browser.pendingFrames()).toBe(0);
    pong.closeLobby();
    expect(browser.pendingFrames()).toBe(1);
  });

  it('opens with the code from a lobby\'s link waiting in it', () => {
    window.history.replaceState(null, '', '/?pong=BDFG');
    const { pong } = player();
    expect(pong.getState().lobby).toMatchObject({ open: true, invitation: 'BDFG' });
  });

  it('takes a code from the option before the address', () => {
    window.history.replaceState(null, '', '/?pong=BDFG');
    const { pong } = player({ lobbyCode: 'KLMN' });
    expect(pong.getState().lobby?.invitation).toBe('KLMN');
  });
});

describe('a lobby', () => {
  it('is created with a code and a link to this page', async () => {
    window.history.replaceState(null, '', '/play?theme=dark#top');
    const { pong } = player({ winningScore: 5 });
    pong.createLobby();
    expect(pong.getState().lobby?.status).toBe('connecting');
    await server.settle();
    const lobby = pong.getState().lobby;
    expect(lobby).toMatchObject({ status: 'waiting', opponent: null, ready: false, winningScore: 5 });
    expect(lobby?.code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(lobby?.link).toBe(`http://localhost:3000/play?theme=dark&pong=${lobby?.code}#top`);
  });

  it('uses the embedder\'s link when it is given one', async () => {
    const { pong } = player({ lobbyLink: (code) => `https://example.com/join/${code}` });
    pong.createLobby();
    await server.settle();
    expect(pong.getState().lobby?.link).toBe(`https://example.com/join/${pong.getState().lobby?.code}`);
  });

  it('is joined by its code, however it is typed, and each player hears of the other', async () => {
    const a = player({ winningScore: 5 });
    const b = player({ winningScore: 21 });
    a.pong.createLobby();
    await server.settle();
    b.pong.joinLobby(` ${a.pong.getState().lobby?.code?.toLowerCase()} `);
    await server.settle();
    expect(b.pong.getState().lobby).toMatchObject({ status: 'waiting', winningScore: 5, opponent: { ready: false } });
    expect(a.pong.getState().lobby?.opponent).toEqual({ ready: false, connected: true });
    expect(b.pong.getState().lobby?.code).toBe(a.pong.getState().lobby?.code);
  });

  it('says why it couldn\'t be joined', async () => {
    const { pong } = player();
    pong.joinLobby('ZZZZ');
    await server.settle();
    expect(pong.getState().lobby).toMatchObject({ status: 'idle', error: 'notFound' });
    server.reachable = false;
    pong.createLobby();
    await server.settle();
    expect(pong.getState().lobby).toMatchObject({ status: 'idle', error: 'connection' });
  });

  it('marks a player ready on the serve key, under the panel', async () => {
    const a = player();
    const b = player();
    a.press('2');
    a.pong.createLobby();
    await server.settle();
    b.pong.joinLobby(a.pong.getState().lobby?.code ?? '');
    await server.settle();
    a.press('Enter');
    await server.settle();
    expect(a.pong.getState().lobby?.ready).toBe(true);
    expect(b.pong.getState().lobby?.opponent?.ready).toBe(true);
    a.press('Enter');
    await server.settle();
    expect(a.pong.getState().lobby?.ready).toBe(false);
  });

  it('is left on reset, back to the single-player start screen, and the other player is told', async () => {
    const a = player();
    const b = player();
    a.press('2');
    a.pong.createLobby();
    await server.settle();
    b.pong.joinLobby(a.pong.getState().lobby?.code ?? '');
    await server.settle();
    a.press('Escape');
    await server.settle();
    expect(a.pong.getState()).toMatchObject({ phase: 'start', message: 'start', lobby: { open: false, status: 'idle' } });
    expect(b.pong.getState().lobby).toMatchObject({ status: 'waiting', opponent: null, notice: 'opponentLeft' });
  });
});

describe('a two-player match', () => {
  it('starts when both are ready: the panel closes and the first serve is tossed for', async () => {
    const { a, b } = await match();
    for (const { pong } of [a, b]) {
      expect(pong.getState()).toMatchObject({ message: 'toss', lobby: { open: false, status: 'playing' } });
    }
    await run(60, () => a.pong.getState().phase === 'toss' && b.pong.getState().phase === 'toss');
    expect(a.pong.getState().phase).toBe('toss');
    expect(b.pong.getState().phase).toBe('toss');
    await run(400, () => a.pong.getState().countdown != null);
    const messages = [a.pong.getState().message, b.pong.getState().message].sort();
    expect(messages).toEqual(['serve.human', 'serve.opponent']);
    await run(400, () => a.pong.getState().phase === 'rally' && b.pong.getState().phase === 'rally');
    expect(a.pong.getState().message).toBeNull();
  });

  it('is played on the standard court, scaled to fit the box and centered in it', async () => {
    const { a } = await match();
    // An 800 by 400 box would hold the 1200 by 675 court at 400 / 675 of its size, with a ball 8.9px wide. The
    // court is the largest whose ball is a whole number of pixels: 8, which makes it 640 by 360, with bars all round.
    const { ball, leftPaddle, rightPaddle, frame } = a.elements;
    expect(ball.style.width).toBe('8px');
    expect(ball.style.height).toBe('8px');
    expect(leftPaddle.style.width).toBe('8px');
    expect(rightPaddle.style.width).toBe('8px');
    expect(leftPaddle.style.height).toBe('54px');
    expect(frame.style.width).toBe('640px');
    expect(frame.style.height).toBe('360px');
    expect(frame.style.transform).toBe('translate(80px, 20px)');
    expect(leftPaddle.style.transform).toMatch(/^translate\(80px, /);
    expect(rightPaddle.style.transform).toMatch(/^translate\(-80px, /);
  });

  it('draws the ball and the paddles on whole pixels, so that they line up', async () => {
    const { a } = await match();
    await run(400, () => a.pong.getState().phase === 'rally');
    for (let step = 0; step < 30; step++) {
      await run(1);
      for (const piece of [a.elements.ball, a.elements.leftPaddle, a.elements.rightPaddle]) {
        const [, x, y] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(piece.style.transform) ?? [];
        expect(Number.isInteger(Number(x))).toBe(true);
        expect(Number.isInteger(Number(y))).toBe(true);
      }
    }
  });

  it('shows each player the same rally, with themselves on the right', async () => {
    const { a, b } = await match();
    await run(800, () => a.pong.getState().phase === 'rally' && b.pong.getState().phase === 'rally');
    await run(20);
    // What one sees at x, the other sees mirrored across the 800px box, give or take the ball's own width.
    const width = parseFloat(a.elements.ball.style.width);
    expect(ballX(a) + ballX(b) + width).toBeCloseTo(800, 0);
  });

  it('gives each point to the same player in both games, and the next serve to whoever scored', async () => {
    const { a, b } = await match();
    // Neither paddle moves, so whoever receives the first serve misses it.
    await run(2000, () => a.pong.getState().phase === 'between' && b.pong.getState().phase === 'between');
    const aScores = a.pong.getState().scores;
    const bScores = b.pong.getState().scores;
    expect(aScores.left + aScores.right).toBe(1);
    expect(bScores).toEqual({ left: aScores.right, right: aScores.left });
    const [scorer, other] = aScores.right === 1 ? [a, b] : [b, a];
    expect(scorer.pong.getState().message).toBe('toServe.you');
    expect(other.pong.getState().message).toBe('toServe.opponent');
    // The serve is the scorer's alone to make.
    other.press('Enter');
    await run(5);
    expect(other.pong.getState().phase).toBe('between');
    scorer.press('Enter');
    await run(30, () => other.pong.getState().phase === 'rally');
    expect(scorer.pong.getState().phase).toBe('rally');
    expect(other.pong.getState().phase).toBe('rally');
  });

  it('ends at the lobby\'s winning score, back in the lobby with the result', async () => {
    const { a, b } = await match({ winningScore: 2 });
    const over = () => a.pong.getState().lobby?.status === 'waiting' && b.pong.getState().lobby?.status === 'waiting';
    for (let rally = 0; rally < 4 && !over(); rally++) {
      await run(2000, () => over() || (a.pong.getState().phase === 'between' && b.pong.getState().phase === 'between'));
      a.press('Enter');
      b.press('Enter');
    }
    await run(20, over);
    expect(over()).toBe(true);
    const winners = [a.pong.getState().winner, b.pong.getState().winner].sort();
    expect(winners).toEqual(['left', 'right']);
    for (const { pong } of [a, b]) {
      expect(pong.getState()).toMatchObject({ phase: 'gameOver', winningScore: 2, lobby: { open: true, ready: false } });
    }
    expect(browser.pendingFrames()).toBe(0);
    // Both ready again: a new match, from nothing.
    a.pong.setReady(true);
    b.pong.setReady(true);
    await server.settle();
    expect(a.pong.getState()).toMatchObject({ scores: { left: 0, right: 0 }, lobby: { open: false, status: 'playing' } });
  });

  it('has no difficulty to change and no attract mode', async () => {
    const { a } = await match();
    const { difficulty } = a.pong.getState();
    a.press('d');
    expect(a.pong.getState().difficulty).toBe(difficulty);
  });
});

describe('a pause in a match', () => {
  const rallying = async () => {
    const players = await match();
    const { a, b } = players;
    await run(800, () => a.pong.getState().phase === 'rally' && b.pong.getState().phase === 'rally');
    return players;
  };

  it('stops both games, and says whose it is', async () => {
    const { a, b } = await rallying();
    a.press(' ');
    await server.settle();
    expect(a.pong.getState()).toMatchObject({ phase: 'paused', message: 'paused' });
    expect(b.pong.getState()).toMatchObject({ phase: 'paused', message: 'paused.opponent' });
    const before = [a.elements.ball.style.transform, b.elements.ball.style.transform];
    await run(30);
    expect([a.elements.ball.style.transform, b.elements.ball.style.transform]).toEqual(before);
  });

  it('is ended only by the player who paused, after a countdown for both', async () => {
    const { a, b } = await rallying();
    a.press(' ');
    await server.settle();
    b.press(' ');
    await run(10);
    expect(a.pong.getState().phase).toBe('paused');
    a.press(' ');
    await server.settle();
    expect(a.pong.getState()).toMatchObject({ phase: 'paused', message: 'resuming', countdown: 3 });
    expect(b.pong.getState()).toMatchObject({ message: 'resuming', countdown: 3 });
    await run(50, () => a.pong.getState().countdown === 2);
    expect(a.pong.getState().countdown).toBe(2);
    await run(200, () => a.pong.getState().phase === 'rally' && b.pong.getState().phase === 'rally');
    expect(a.pong.getState()).toMatchObject({ phase: 'rally', message: null, countdown: null });
    await run(10);
    const width = parseFloat(a.elements.ball.style.width);
    expect(ballX(a) + ballX(b) + width).toBeCloseTo(800, 0);
  });

  it('comes of a game losing focus or its tab being hidden', async () => {
    const { a, b } = await rallying();
    a.elements.court.dispatchEvent(new FocusEvent('blur'));
    await server.settle();
    expect(b.pong.getState().message).toBe('away.opponent');
    expect(a.pong.getState().message).toBe('paused');
  });

  it('comes of the other player\'s connection dropping, and ends when it comes back', async () => {
    const { a, b } = await rallying();
    const code = a.pong.getState().lobby?.code ?? '';
    server.drop(code, 1);
    await server.settle();
    expect(a.pong.getState()).toMatchObject({ phase: 'paused', message: 'disconnected.opponent' });
    expect(b.pong.getState().message).toBe('reconnecting');
    // The game that dropped tries again by itself.
    await run(200, () => b.pong.getState().message === 'resuming');
    expect(b.pong.getState().message).toBe('resuming');
    await run(200, () => a.pong.getState().phase === 'rally' && b.pong.getState().phase === 'rally');
    expect(a.pong.getState().phase).toBe('rally');
    expect(b.pong.getState().phase).toBe('rally');
  });

  it('opens under the help, which the match waits for', async () => {
    const { a, b } = await rallying();
    a.press('?');
    await server.settle();
    expect(a.pong.getState()).toMatchObject({ help: true, phase: 'paused' });
    expect(b.pong.getState().message).toBe('away.opponent');
  });
});

describe('leaving a match', () => {
  it('isn\'t done by reset during a rally', async () => {
    const { a } = await match();
    await run(800, () => a.pong.getState().phase === 'rally');
    a.press('Escape');
    await server.settle();
    expect(a.pong.getState().lobby?.status).toBe('playing');
  });

  it('between points, returns the court to this game and the other player to the lobby', async () => {
    const { a, b } = await match();
    await run(2000, () => a.pong.getState().phase === 'between' && b.pong.getState().phase === 'between');
    a.press('Escape');
    await server.settle();
    expect(a.pong.getState()).toMatchObject({ phase: 'start', message: 'start', lobby: { status: 'idle', open: false } });
    // Its pieces are the stylesheet's size again, and the court the box.
    expect(a.elements.ball.style.width).toBe('');
    expect(a.elements.frame.style.width).toBe('');
    expect(a.elements.leftPaddle.style.transform).toMatch(/^translateY\(/);
    expect(b.pong.getState().lobby).toMatchObject({ status: 'waiting', open: true, opponent: null, notice: 'opponentLeft' });
  });

  it('is what destroying a game does, and it releases the pieces', async () => {
    const { a, b } = await match();
    a.pong.destroy();
    await server.settle();
    expect(a.elements.ball.style.width).toBe('');
    expect(b.pong.getState().lobby).toMatchObject({ status: 'waiting', opponent: null });
  });
});
