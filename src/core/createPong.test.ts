import { stubBrowser } from '../test/browserStubs.js';
import type { BrowserStubs } from '../test/browserStubs.js';
import { createPong } from './createPong.js';
import type { PongElements, PongInstance, PongOptions } from './types.js';

let browser: BrowserStubs;
let elements: PongElements;

const piece = (className: string) => {
  const element = document.createElement('div');
  element.className = className;
  return element;
};

const createElements = (): PongElements => {
  const court = piece('pong-court');
  court.tabIndex = 0;
  const ball = piece('pong-ball');
  const leftPaddle = piece('pong-paddle pong-paddle-left');
  const rightPaddle = piece('pong-paddle pong-paddle-right');
  court.append(ball, leftPaddle, rightPaddle);
  document.body.append(court);
  return { court, ball, leftPaddle, rightPaddle };
};

const key = (target: HTMLElement, type: 'keydown' | 'keyup', name: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

const press = (name: string) => {
  const event = key(elements.court, 'keydown', name);
  key(elements.court, 'keyup', name);
  return event;
};

/** Run frames until the phase changes. */
const play = (pong: PongInstance, maxFrames = 2000) => {
  const { phase } = pong.getState();
  for (let frame = 0; frame < maxFrames && pong.getState().phase === phase; frame++) browser.frame();
};

/** A game the AI can't lose a point in quickly: the human paddle never moves. */
const start = (options: PongOptions = {}) => {
  const pong = createPong(elements, options);
  elements.court.focus();
  return pong;
};

beforeEach(() => {
  browser = stubBrowser();
  elements = createElements();
});

afterEach(() => {
  elements.court.remove();
  browser.restore();
});

describe('createPong', () => {
  it('opens on the start screen, idle', () => {
    const pong = start();
    expect(pong.getState()).toMatchObject({
      phase: 'start',
      scores: { left: 0, right: 0 },
      winner: null,
      message: 'start',
      messageCount: 0,
    });
    expect(pong.getState().matchRoll).toBeGreaterThanOrEqual(0);
    expect(pong.getState().matchRoll).toBeLessThan(1);
    expect(browser.pendingFrames()).toBe(0);
  });

  it('inserts no elements', () => {
    const before = document.body.innerHTML.replace(/ style="[^"]*"/g, '');
    start();
    expect(document.body.innerHTML.replace(/ style="[^"]*"/g, '')).toBe(before);
  });

  it('places the paddles at mid-height and the ball off the court', () => {
    start();
    expect(elements.leftPaddle.style.transform).toBe('translateY(170px)');
    expect(elements.rightPaddle.style.transform).toBe('translateY(170px)');
    expect(elements.ball.style.transform).toBe('translate(-30px, 192.5px)');
  });

  describe('keys', () => {
    it('serves on Enter and runs the loop for the rally', () => {
      const pong = start();
      press('Enter');
      expect(pong.getState().phase).toBe('rally');
      expect(pong.getState().message).toBeNull();
      expect(browser.pendingFrames()).toBe(1);
      browser.frame();
      browser.frame();
      expect(elements.ball.style.transform).not.toBe('translate(-30px, 192.5px)');
      expect(browser.pendingFrames()).toBe(1);
    });

    it('pauses and resumes on Escape, idling while paused', () => {
      const pong = start();
      press('Enter');
      press('Escape');
      expect(pong.getState().phase).toBe('paused');
      expect(pong.getState().message).toBe('paused');
      expect(browser.pendingFrames()).toBe(0);
      press('Escape');
      expect(pong.getState().phase).toBe('rally');
      expect(pong.getState().message).toBeNull();
      expect(browser.pendingFrames()).toBe(1);
    });

    it('moves the right paddle while an arrow is held, and idles again after', () => {
      start();
      key(elements.court, 'keydown', 'ArrowDown');
      expect(browser.pendingFrames()).toBe(1);
      browser.frame();
      browser.frame();
      expect(elements.rightPaddle.style.transform).not.toBe('translateY(170px)');
      expect(elements.leftPaddle.style.transform).toBe('translateY(170px)');
      key(elements.court, 'keyup', 'ArrowDown');
      browser.frame();
      expect(browser.pendingFrames()).toBe(0);
    });

    it('prevents the default of keys it handles and leaves the rest alone', () => {
      start();
      expect(press('ArrowDown').defaultPrevented).toBe(true);
      expect(press('Enter').defaultPrevented).toBe(true);
      expect(press('Tab').defaultPrevented).toBe(false);
      expect(press('a').defaultPrevented).toBe(false);
    });

    it('leaves shortcuts with a modifier to the page', () => {
      const pong = start();
      const event = key(elements.court, 'keydown', 'Enter', { metaKey: true });
      expect(event.defaultPrevented).toBe(false);
      expect(pong.getState().phase).toBe('start');
    });

    it('hears nothing typed elsewhere on the page', () => {
      const pong = start();
      const input = document.createElement('input');
      document.body.append(input);
      input.focus();
      const event = key(input, 'keydown', 'Enter');
      expect(event.defaultPrevented).toBe(false);
      expect(pong.getState().phase).toBe('start');
      input.remove();
    });

    it('remaps keys', () => {
      const pong = start({ keys: { w: 'up', s: 'down', ' ': 'serve', p: 'pause' } });
      press('Enter');
      expect(pong.getState().phase).toBe('start');
      press(' ');
      expect(pong.getState().phase).toBe('rally');
      press('p');
      expect(pong.getState().phase).toBe('paused');
    });
  });

  describe('points', () => {
    it('scores, reports the point, and idles until the next serve', () => {
      const onPoint = vi.fn();
      const pong = start({ onPoint });
      press('Enter');
      play(pong);
      const state = pong.getState();
      expect(state.phase).toBe('between');
      expect(state.scores.left + state.scores.right).toBe(1);
      expect(state.message).toBeNull();
      expect(onPoint).toHaveBeenCalledTimes(1);
      expect(onPoint).toHaveBeenCalledWith({ scorer: state.scores.left === 1 ? 'left' : 'right', scores: state.scores });
      expect(browser.pendingFrames()).toBe(0);
    });

    /** Play points with every random draw fixed, until one side has scored `points` times. */
    const playPoints = (pong: PongInstance, points: number) => {
      const messages: (string | null)[] = [];
      const counts: number[] = [];
      for (let point = 0; point < points; point++) {
        press('Enter');
        play(pong);
        messages.push(pong.getState().message);
        counts.push(pong.getState().messageCount);
      }
      return { messages, counts };
    };

    it('talks smack after some points when asked to, counting the remarks', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.4);
      const pong = start({ smack: true });
      const { messages, counts } = playPoints(pong, 3);
      const { scores } = pong.getState();
      expect(messages).toEqual(Array(3).fill(scores.left === 3 ? 'smack.ai' : 'smack.human'));
      expect(counts).toEqual([0, 1, 2]);
    });

    it('lets other points pass without a word', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.6);
      const pong = start({ smack: true });
      expect(playPoints(pong, 3).messages).toEqual([null, null, null]);
    });

    it('starts each match with a fresh shuffle and count', () => {
      const random = vi.spyOn(Math, 'random').mockReturnValue(0.4);
      const pong = start({ smack: true });
      playPoints(pong, 2);
      random.mockReturnValue(0.3);
      pong.reset();
      expect(pong.getState().matchRoll).toBe(0.3);
      expect(playPoints(pong, 1).counts).toEqual([0]);
    });

    it('ends the game at the winning score, then resets on Escape', () => {
      const onGameOver = vi.fn();
      const pong = start({ winningScore: 1, smack: true, onGameOver });
      press('Enter');
      play(pong);
      const state = pong.getState();
      expect(state.phase).toBe('gameOver');
      expect(state.message).toBe('gameOver');
      expect(state.winner).toBe(state.scores.left === 1 ? 'left' : 'right');
      expect(onGameOver).toHaveBeenCalledWith({ winner: state.winner, scores: state.scores });

      press('Enter');
      expect(pong.getState().phase).toBe('gameOver');
      expect(pong.getState().message).toBe('reset');

      press('Escape');
      expect(pong.getState()).toMatchObject({ phase: 'start', scores: { left: 0, right: 0 }, message: 'start' });
    });

    it('applies an updated winning score to the next point', () => {
      const pong = start();
      pong.update({ winningScore: 1 });
      press('Enter');
      play(pong);
      expect(pong.getState().phase).toBe('gameOver');
    });
  });

  describe('subscribe', () => {
    it('notifies on phase, score, and message changes, never per frame', () => {
      const pong = start();
      const listener = vi.fn();
      pong.subscribe(listener);
      press('Enter');
      expect(listener).toHaveBeenCalledTimes(1);
      const state = pong.getState();
      browser.frame();
      browser.frame();
      browser.frame();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(pong.getState()).toBe(state);
    });

    it('stops notifying once unsubscribed', () => {
      const pong = start();
      const listener = vi.fn();
      const unsubscribe = pong.subscribe(listener);
      unsubscribe();
      pong.serve();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('embedding', () => {
    it('pauses a rally when the court loses focus', () => {
      const pong = start();
      press('Enter');
      elements.court.blur();
      expect(pong.getState().phase).toBe('paused');
      expect(browser.pendingFrames()).toBe(0);
    });

    it('lets go of the paddle when the court loses focus', () => {
      start();
      key(elements.court, 'keydown', 'ArrowDown');
      elements.court.blur();
      browser.frame();
      expect(browser.pendingFrames()).toBe(0);
    });

    it('pauses a rally when the tab is hidden', () => {
      const pong = start();
      press('Enter');
      browser.setHidden(true);
      expect(pong.getState().phase).toBe('paused');
      browser.setHidden(false);
      expect(pong.getState().phase).toBe('paused');
    });

    it('pauses a rally when the court scrolls offscreen', () => {
      const pong = start();
      press('Enter');
      browser.setVisible(false);
      expect(pong.getState().phase).toBe('paused');
      expect(browser.pendingFrames()).toBe(0);
    });

    it('leaves the start screen alone when focus leaves', () => {
      const pong = start();
      elements.court.blur();
      expect(pong.getState().phase).toBe('start');
    });

    it('keeps two courts apart', () => {
      const first = start();
      const otherElements = createElements();
      const second = createPong(otherElements);
      otherElements.court.focus();
      key(otherElements.court, 'keydown', 'Enter');
      expect(second.getState().phase).toBe('rally');
      expect(first.getState().phase).toBe('start');
      second.destroy();
      otherElements.court.remove();
    });

    it('follows the court when it resizes', () => {
      start();
      browser.setSize(elements.court, 400, 200);
      browser.setSize(elements.leftPaddle, 15, 30);
      browser.setSize(elements.rightPaddle, 15, 30);
      browser.resize();
      expect(elements.rightPaddle.style.transform).toBe('translateY(85px)');
    });

    it('waits for a court with no size', () => {
      browser.setSize(elements.court, 0, 0);
      const pong = start();
      press('Enter');
      expect(pong.getState().phase).toBe('start');
      expect(browser.pendingFrames()).toBe(0);
    });
  });

  describe('sound', () => {
    it('creates the audio context on the first key press', () => {
      start();
      expect(browser.audioContexts).toHaveLength(0);
      press('ArrowUp');
      press('Enter');
      expect(browser.audioContexts).toHaveLength(1);
    });

    it('blips on the way to a point', () => {
      const pong = start();
      press('Enter');
      play(pong);
      const frequencies = browser.audioContexts[0]?.oscillators.map(({ frequency }) => frequency);
      expect(frequencies?.at(-1)).toBe(490);
    });

    it('creates no audio context with sound off', () => {
      const pong = start({ sound: false });
      press('Enter');
      play(pong);
      expect(browser.audioContexts).toHaveLength(0);
    });
  });

  describe('destroy', () => {
    it('releases the loop, observers, listeners, and audio', () => {
      const pong = start();
      press('Enter');
      pong.destroy();
      expect(browser.pendingFrames()).toBe(0);
      expect(browser.observers.resize.every(({ disconnected }) => disconnected)).toBe(true);
      expect(browser.observers.intersection.every(({ disconnected }) => disconnected)).toBe(true);
      expect(browser.audioContexts[0]?.closed).toBe(true);
      expect(press('Escape').defaultPrevented).toBe(false);
      browser.setHidden(true);
      expect(pong.getState().phase).toBe('rally');
    });

    it('hands the pieces back to the stylesheet', () => {
      const pong = start();
      pong.destroy();
      expect(elements.ball.style.transform).toBe('');
      expect(elements.rightPaddle.style.transform).toBe('');
    });

    it('ignores controls afterwards', () => {
      const pong = start();
      pong.destroy();
      pong.serve();
      expect(pong.getState().phase).toBe('start');
      expect(browser.pendingFrames()).toBe(0);
    });
  });
});
