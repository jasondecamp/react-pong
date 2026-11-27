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

/**
 * A game the AI can't lose a point in quickly: the human paddle never moves.
 * It serves at once unless a test asks for the toss, and its start screen is
 * still unless a test asks for attract mode.
 */
const start = (options: PongOptions = {}) => {
  const pong = createPong(elements, { toss: false, attract: false, ...options });
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

    it('pauses and resumes on Space, idling while paused', () => {
      const pong = start();
      press('Enter');
      press('Escape');
      expect(pong.getState().phase).toBe('rally');
      press(' ');
      expect(pong.getState().phase).toBe('paused');
      expect(pong.getState().message).toBe('paused');
      expect(browser.pendingFrames()).toBe(0);
      press(' ');
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

  describe('help', () => {
    it('opens on ? and closes on ? or Escape, leaving the start screen as it was', () => {
      const pong = start();
      expect(pong.getState().help).toBe(false);
      expect(press('?').defaultPrevented).toBe(true);
      expect(pong.getState()).toMatchObject({ help: true, phase: 'start', message: 'start' });
      press('?');
      expect(pong.getState().help).toBe(false);
      press('?');
      press('Escape');
      expect(pong.getState()).toMatchObject({ help: false, phase: 'start', message: 'start' });
    });

    it('pauses a rally, which stays paused once the help is closed', () => {
      const pong = start();
      press('Enter');
      press('?');
      expect(pong.getState()).toMatchObject({ help: true, phase: 'paused', message: 'paused' });
      expect(browser.pendingFrames()).toBe(0);
      press('Escape');
      expect(pong.getState()).toMatchObject({ help: false, phase: 'paused', message: 'paused' });
      press(' ');
      expect(pong.getState().phase).toBe('rally');
    });

    it('keeps the other keys from doing anything while open', () => {
      const pong = start();
      press('?');
      expect(press('Enter').defaultPrevented).toBe(true);
      press(' ');
      expect(pong.getState()).toMatchObject({ help: true, phase: 'start' });
      press('d');
      expect(pong.getState().difficulty).toBe('normal');
      key(elements.court, 'keydown', 'ArrowDown');
      expect(browser.pendingFrames()).toBe(0);
    });

    it('lets go of a held paddle when it opens', () => {
      start();
      key(elements.court, 'keydown', 'ArrowDown');
      press('?');
      browser.frame();
      expect(browser.pendingFrames()).toBe(0);
    });

    it('opens and closes from the controls, and closes when play goes on', () => {
      const pong = start();
      pong.openHelp();
      expect(pong.getState().help).toBe(true);
      pong.closeHelp();
      expect(pong.getState().help).toBe(false);
      pong.openHelp();
      pong.serve();
      expect(pong.getState()).toMatchObject({ help: false, phase: 'rally' });
    });

    it('follows a remapped help key', () => {
      const pong = start({ keys: { h: 'help' } });
      press('?');
      expect(pong.getState().help).toBe(false);
      press('h');
      expect(pong.getState().help).toBe(true);
    });
  });

  describe('toss', () => {
    /** Run frames until the message or the countdown changes. */
    const until = (pong: PongInstance, maxFrames = 600) => {
      const { message, countdown } = pong.getState();
      for (let frame = 0; frame < maxFrames; frame++) {
        browser.frame();
        const state = pong.getState();
        if (state.message !== message || state.countdown !== countdown) return;
      }
    };

    it('opens a match by tossing for the serve, announcing it, and counting down', () => {
      const pong = start({ toss: true });
      press('Enter');
      expect(pong.getState()).toMatchObject({ phase: 'toss', message: 'toss', countdown: null });
      expect(browser.pendingFrames()).toBe(1);
      expect(elements.ball.style.transform).toBe('translate(392.5px, 192.5px)');

      until(pong);
      const { message } = pong.getState();
      expect(['serve.ai', 'serve.human']).toContain(message);
      expect(pong.getState()).toMatchObject({ phase: 'toss', countdown: 3 });
      // Resting on the face of the paddle that serves.
      const x = message === 'serve.ai' ? 15 : 770;
      expect(elements.ball.style.transform).toBe(`translate(${x}px, 192.5px)`);

      until(pong);
      expect(pong.getState()).toMatchObject({ message, countdown: 2 });
      until(pong);
      expect(pong.getState()).toMatchObject({ message, countdown: 1 });
      until(pong);
      expect(pong.getState()).toMatchObject({ phase: 'rally', message: null, countdown: null });
      expect(browser.pendingFrames()).toBe(1);
    });

    it('blips for each bounce of the toss and each count', () => {
      const pong = start({ toss: true });
      press('Enter');
      play(pong);
      const frequencies = browser.audioContexts[0]?.oscillators.map(({ frequency }) => frequency);
      expect(frequencies).toEqual([459, 459, 459, 226, 226, 226]);
    });

    it('ignores the game keys until the ball is served', () => {
      const pong = start({ toss: true });
      press('Enter');
      press('Enter');
      press(' ');
      press('Escape');
      press('d');
      expect(pong.getState()).toMatchObject({ phase: 'toss', difficulty: 'normal' });
    });

    it('is called off when the court loses focus, the tab is hidden, or the help opens', () => {
      const pong = start({ toss: true });
      press('Enter');
      elements.court.blur();
      expect(pong.getState()).toMatchObject({ phase: 'start', message: 'start' });
      // The frame already scheduled finds nothing moving, and the loop idles.
      browser.frame();
      expect(browser.pendingFrames()).toBe(0);
      expect(elements.ball.style.transform).toBe('translate(-30px, 192.5px)');

      elements.court.focus();
      press('Enter');
      browser.setHidden(true);
      expect(pong.getState().phase).toBe('start');
      browser.setHidden(false);

      press('Enter');
      press('?');
      expect(pong.getState()).toMatchObject({ phase: 'start', help: true });
    });

    it('happens once a match: later serves leave at once, and a new match tosses again', () => {
      const pong = start({ toss: true, winningScore: 2 });
      press('Enter');
      play(pong);
      play(pong);
      expect(pong.getState().phase).toBe('between');
      press('Enter');
      expect(pong.getState().phase).toBe('rally');
      pong.reset();
      press('Enter');
      expect(pong.getState().phase).toBe('toss');
    });

    it('skips the bouncing under reduced motion', () => {
      vi.stubGlobal('matchMedia', () => ({ matches: true }));
      const pong = start({ toss: true });
      press('Enter');
      browser.frame();
      browser.frame();
      expect(pong.getState()).toMatchObject({ phase: 'toss', countdown: 3 });
    });
  });

  describe('difficulty', () => {
    it('steps through the difficulties on d, reporting each change', () => {
      const onDifficultyChange = vi.fn();
      const pong = start({ onDifficultyChange });
      expect(pong.getState().difficulty).toBe('normal');
      expect(press('d').defaultPrevented).toBe(true);
      expect(pong.getState().difficulty).toBe('hard');
      press('d');
      expect(pong.getState().difficulty).toBe('impossible');
      press('d');
      expect(pong.getState().difficulty).toBe('easy');
      press('d');
      expect(pong.getState().difficulty).toBe('normal');
      expect(onDifficultyChange.mock.calls).toEqual([['hard'], ['impossible'], ['easy'], ['normal']]);
    });

    it('stays put during a game: in a rally, while paused, and between points', () => {
      const onDifficultyChange = vi.fn();
      const pong = start({ onDifficultyChange });
      press('Enter');
      press('d');
      press(' ');
      press('d');
      press(' ');
      play(pong);
      expect(pong.getState().phase).toBe('between');
      press('d');
      expect(pong.getState().difficulty).toBe('normal');
      expect(onDifficultyChange).not.toHaveBeenCalled();
    });

    it('can change again once the game is over', () => {
      const pong = start({ winningScore: 1 });
      press('Enter');
      play(pong);
      expect(pong.getState().phase).toBe('gameOver');
      press('d');
      expect(pong.getState()).toMatchObject({ difficulty: 'hard', phase: 'gameOver', message: 'gameOver' });
    });

    it('follows the option, at any time', () => {
      const pong = start({ difficulty: 'easy' });
      expect(pong.getState().difficulty).toBe('easy');
      press('Enter');
      pong.update({ difficulty: 'hard' });
      expect(pong.getState().difficulty).toBe('hard');
    });
  });

  describe('points', () => {
    it('scores, reports the point, and idles until the next serve', () => {
      const onPoint = vi.fn();
      const pong = start({ onPoint, smack: false });
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
      press(' ');
      expect(pong.getState().phase).toBe('gameOver');

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

    it('notifies when the keys change, and not for options the snapshot leaves out', () => {
      const pong = start();
      const listener = vi.fn();
      pong.subscribe(listener);
      pong.update({ smack: true, keys: { ...pong.getState().keys } });
      expect(listener).not.toHaveBeenCalled();
      pong.update({ keys: { w: 'up' } });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(pong.getState().keys).toEqual({ w: 'up' });
      expect(pong.getState().winningScore).toBe(11);
      pong.update({ winningScore: 3 });
      expect(listener).toHaveBeenCalledTimes(2);
      expect(pong.getState().winningScore).toBe(3);
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
      const second = createPong(otherElements, { toss: false });
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

  describe('ripple', () => {
    const withRipples = (): PongElements => {
      const leftRipple = piece('pong-ripple pong-ripple-left');
      const rightRipple = piece('pong-ripple pong-ripple-right');
      elements.court.prepend(leftRipple, rightRipple);
      elements = { ...elements, leftRipple, rightRipple };
      return elements;
    };

    /** Play points until a ripple starts, for `points` points at most. */
    const playUntilRipple = (pong: PongInstance, points: number) => {
      const rippling = () => elements.court.querySelector<HTMLElement>('.pong-ripple-active');
      for (let served = 0; served < points && rippling() == null; served++) {
        press('Enter');
        for (let frame = 0; frame < 2000 && rippling() == null && pong.getState().phase === 'rally'; frame++) {
          browser.frame();
        }
      }
      return rippling();
    };

    it('starts the struck paddle\'s rings where the ball touched it', () => {
      const { leftRipple, rightRipple } = withRipples();
      const rippling = playUntilRipple(start({ winningScore: 100 }), 50);
      expect([leftRipple, rightRipple]).toContain(rippling);
      // On the face of whichever paddle it was: 15px in from that side of the 800px court.
      const x = rippling === leftRipple ? 15 : 785;
      expect(rippling?.style.transform).toMatch(new RegExp(`^translate\\(${x}px, [\\d.]+px\\)$`));
      expect(elements.court.querySelectorAll('.pong-ripple-active')).toHaveLength(1);
    });

    it('stays still with ripple off', () => {
      withRipples();
      const pong = start({ ripple: false, winningScore: 5 });
      expect(playUntilRipple(pong, 5)).toBeNull();
      expect(pong.getState().phase).toBe('gameOver');
    });

    it('is cleared on destroy', () => {
      const { leftRipple, rightRipple } = withRipples();
      const pong = start({ winningScore: 100 });
      expect(playUntilRipple(pong, 50)).not.toBeNull();
      pong.destroy();
      expect(elements.court.querySelector('.pong-ripple-active')).toBeNull();
      expect(leftRipple?.style.transform).toBe('');
      expect(rightRipple?.style.transform).toBe('');
    });
  });

  describe('attract', () => {
    const seconds = (count: number) => {
      for (let frame = 0; frame < count * 60; frame++) browser.frame();
    };

    const ballX = () => Number(/translate\((-?[\d.]+)px/.exec(elements.ball.style.transform)?.[1]);

    it('plays the start screen by itself, without leaving it', () => {
      const pong = start({ attract: true });
      const listener = vi.fn();
      pong.subscribe(listener);
      expect(browser.pendingFrames()).toBe(1);
      seconds(2);
      expect(ballX()).toBeGreaterThanOrEqual(0);
      expect(pong.getState()).toMatchObject({ phase: 'start', message: 'start', scores: { left: 0, right: 0 } });
      expect(listener).not.toHaveBeenCalled();
      expect(browser.pendingFrames()).toBe(1);
    });

    it('makes no sound', () => {
      start({ attract: true });
      // A key press allows audio; the paddle keys do nothing else here.
      press('ArrowUp');
      seconds(60);
      expect(browser.audioContexts[0]?.oscillators ?? []).toHaveLength(0);
    });

    it('gives way to the real game on a serve', () => {
      const pong = start({ attract: true });
      seconds(2);
      press('Enter');
      expect(pong.getState().phase).toBe('rally');
      play(pong);
      expect(pong.getState().scores.left + pong.getState().scores.right).toBe(1);
    });

    it('rests under the help and offscreen', () => {
      const pong = start({ attract: true });
      seconds(2);
      pong.openHelp();
      browser.frame();
      expect(browser.pendingFrames()).toBe(0);
      pong.closeHelp();
      expect(browser.pendingFrames()).toBe(1);
      browser.setVisible(false);
      expect(browser.pendingFrames()).toBe(0);
      browser.setVisible(true);
      expect(browser.pendingFrames()).toBe(1);
    });

    it('keeps playing when the court loses focus', () => {
      start({ attract: true });
      seconds(2);
      elements.court.blur();
      browser.frame();
      expect(browser.pendingFrames()).toBe(1);
    });

    it('starts and stops with its option', () => {
      const pong = start();
      expect(browser.pendingFrames()).toBe(0);
      pong.update({ attract: true });
      expect(browser.pendingFrames()).toBe(1);
      seconds(2);
      expect(ballX()).toBeGreaterThanOrEqual(0);
      pong.update({ attract: false });
      expect(ballX()).toBe(-30);
      browser.frame();
      expect(browser.pendingFrames()).toBe(0);
    });

    it('returns after a reset', () => {
      const pong = start({ attract: true, winningScore: 1 });
      press('Enter');
      play(pong);
      expect(pong.getState().phase).toBe('gameOver');
      browser.frame();
      expect(browser.pendingFrames()).toBe(0);
      press('Escape');
      expect(browser.pendingFrames()).toBe(1);
    });

    it('is off under reduced motion', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
      start({ attract: true });
      expect(browser.pendingFrames()).toBe(0);
    });
  });

  describe('ball color', () => {
    const withBallColor = () => {
      const ballColor = piece('pong-ball-color');
      elements.ball.append(ballColor);
      elements = { ...elements, ballColor };
      return ballColor;
    };

    it('stretches the color element across the court and holds it still under the ball', () => {
      const ballColor = withBallColor();
      const pong = start();
      press('Enter');
      for (let frame = 0; frame < 10; frame++) browser.frame();
      expect(pong.getState().phase).toBe('rally');
      const x = Number(/translate\((-?[\d.]+)px/.exec(elements.ball.style.transform)?.[1]);
      // An 800px court is 53.33 times the width of a 15px ball, and the element runs a ball's width past each end.
      expect(ballColor.style.transform).toBe(`translateX(${Math.round((-x - 15) * 100) / 100}px) scaleX(55.33)`);
    });

    it('is handed back on destroy', () => {
      const ballColor = withBallColor();
      const pong = start();
      pong.destroy();
      expect(ballColor.style.transform).toBe('');
    });
  });

  describe('trail', () => {
    const withTrail = (count = 4) => {
      const trail = piece('pong-trail');
      for (let index = 0; index < count; index++) {
        const ghost = piece('pong-ball');
        ghost.append(piece('pong-ball-color'));
        trail.append(ghost);
      }
      elements.court.append(trail);
      elements = { ...elements, trail };
      const ghosts = Array.from(trail.children) as HTMLElement[];
      return { ghosts, first: ghosts[0] as HTMLElement };
    };

    const xOf = (element: HTMLElement) => Number(/translate\((-?[\d.]+)px/.exec(element.style.transform)?.[1]);
    const fading = (ghost: HTMLElement) => (
      ghost.classList.contains('pong-trail-fade') || ghost.classList.contains('pong-trail-fade-again')
    );
    const untouched = (ghosts: HTMLElement[]) => ghosts.every((ghost) => (
      ghost.style.transform === '' && !fading(ghost) && (ghost.firstElementChild as HTMLElement).style.transform === ''
    ));

    it('leaves the ghosts alone when the trail is turned off', () => {
      const { ghosts } = withTrail();
      start({ trail: false });
      press('Enter');
      for (let frame = 0; frame < 30; frame++) browser.frame();
      expect(untouched(ghosts)).toBe(true);
    });

    it('is off under reduced motion', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
      const { ghosts } = withTrail();
      start({ toss: false });
      press('Enter');
      for (let frame = 0; frame < 30; frame++) browser.frame();
      expect(untouched(ghosts)).toBe(true);
    });

    it('leaves a ghost behind at a steady interval, each colored for where it is', () => {
      const { ghosts, first } = withTrail(12);
      const pong = start({ trail: true, toss: false });
      press('Enter');
      // The first frame takes no time; the eight after it cover 0.133s, two ghosts' worth at one every 0.05s.
      for (let frame = 0; frame < 9; frame++) browser.frame();
      expect(pong.getState().phase).toBe('rally');
      expect(ghosts.filter(fading)).toHaveLength(2);
      expect(first).toHaveClass('pong-trail-fade');
      const color = first.firstElementChild as HTMLElement;
      expect(color.style.transform).toBe(`translateX(${Math.round((-xOf(first) - 15) * 100) / 100}px) scaleX(55.33)`);
    });

    it('leaves each ghost where it is while the ball moves on, evenly spaced', () => {
      const { ghosts } = withTrail(12);
      start({ trail: true, toss: false });
      press('Enter');
      for (let frame = 0; frame < 15; frame++) browser.frame();
      const left = ghosts.filter(fading).map(xOf);
      expect(left.length).toBeGreaterThanOrEqual(3);
      for (let frame = 0; frame < 3; frame++) browser.frame();
      expect(ghosts.filter(fading).map(xOf).slice(0, left.length)).toEqual(left);
      const [a = 0, b = 0, c = 0] = left;
      expect(a).not.toBe(b);
      expect(b - a).toBeCloseTo(c - b, 0);
    });

    it('uses the ghosts in turn, starting each one\'s fade over', () => {
      const { ghosts, first } = withTrail(2);
      start({ trail: true, toss: false });
      press('Enter');
      for (let frame = 0; frame < 9; frame++) browser.frame();
      expect(ghosts.every((ghost) => ghost.classList.contains('pong-trail-fade'))).toBe(true);
      const before = xOf(first);
      for (let frame = 0; frame < 3; frame++) browser.frame();
      expect(first).toHaveClass('pong-trail-fade-again');
      expect(first).not.toHaveClass('pong-trail-fade');
      expect(xOf(first)).not.toBe(before);
    });

    it('lets the ghosts fade where they are once the ball stops', () => {
      const { ghosts } = withTrail();
      const pong = start({ trail: true, toss: false, winningScore: 1 });
      press('Enter');
      for (let frame = 0; frame < 3000 && pong.getState().phase === 'rally'; frame++) browser.frame();
      expect(pong.getState().phase).toBe('gameOver');
      expect(ghosts.every(fading)).toBe(true);
    });

    it('clears the trail when it is turned off and on destroy', () => {
      const { ghosts } = withTrail();
      const pong = start({ trail: true, toss: false });
      press('Enter');
      for (let frame = 0; frame < 30; frame++) browser.frame();
      expect(untouched(ghosts)).toBe(false);
      pong.update({ trail: false });
      browser.frame();
      expect(untouched(ghosts)).toBe(true);
      pong.update({ trail: true });
      for (let frame = 0; frame < 30; frame++) browser.frame();
      expect(untouched(ghosts)).toBe(false);
      pong.destroy();
      expect(untouched(ghosts)).toBe(true);
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
