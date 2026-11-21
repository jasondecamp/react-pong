import { vi } from 'vitest';
import { seededRandom } from './seededRandom.js';

// jsdom has no layout, observers, animation clock worth driving, or Web Audio.
// These stubs supply just enough of each for createPong, and expose handles to
// drive them. They also seed Math.random, which the engine draws its serves,
// bounces, and AI decisions from, so every run plays the same rallies.

type FrameCallback = (time: number) => void;

export type StubOscillator = { frequency: number; type: string; stoppedAt: number };

export type StubAudioContext = { closed: boolean; oscillators: StubOscillator[] };

export type BrowserStubs = {
  /** Run the pending animation frame, advancing the clock by `ms`. */
  frame: (ms?: number) => void;
  pendingFrames: () => number;
  /** Give an element a layout size. Elements without one fall back by class to the court or piece sizes. */
  setSize: (element: Element, width: number, height: number) => void;
  /** Fire every ResizeObserver callback. */
  resize: () => void;
  /** Scroll every observed court on or off screen. */
  setVisible: (visible: boolean) => void;
  /** Hide or show the tab. */
  setHidden: (hidden: boolean) => void;
  observers: { resize: { disconnected: boolean }[]; intersection: { disconnected: boolean }[] };
  audioContexts: StubAudioContext[];
  restore: () => void;
};

// The default layout: an 800×400 court, a 15px ball, and 15×60 paddles.
const defaultSize = (element: Element, width: number, height: number) => {
  if (element.classList.contains('pong-ball')) return { width: 15, height: 15 };
  if (element.classList.contains('pong-paddle')) return { width: 15, height: Math.round(height * 0.15) };
  return { width, height };
};

export const stubBrowser = ({ width = 800, height = 400 } = {}): BrowserStubs => {
  let now = 0;
  let nextId = 1;
  let hidden = false;
  const frames = new Map<number, FrameCallback>();
  const sizes = new WeakMap<Element, { width: number; height: number }>();
  const resizeCallbacks: (() => void)[] = [];
  const intersectionCallbacks: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
  const observers: BrowserStubs['observers'] = { resize: [], intersection: [] };
  const audioContexts: StubAudioContext[] = [];

  const sizeOf = (element: Element) => sizes.get(element) ?? defaultSize(element, width, height);

  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return sizeOf(this).width;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return sizeOf(this).height;
  });
  vi.spyOn(Document.prototype, 'hidden', 'get').mockImplementation(() => hidden);
  vi.spyOn(Math, 'random').mockImplementation(seededRandom(1));

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });

  vi.stubGlobal('ResizeObserver', class {
    record = { disconnected: false };
    constructor(callback: () => void) {
      resizeCallbacks.push(callback);
      observers.resize.push(this.record);
    }
    observe() {}
    disconnect() {
      this.record.disconnected = true;
    }
  });

  vi.stubGlobal('IntersectionObserver', class {
    record = { disconnected: false };
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
      intersectionCallbacks.push(callback);
      observers.intersection.push(this.record);
    }
    observe() {}
    disconnect() {
      this.record.disconnected = true;
    }
  });

  vi.stubGlobal('AudioContext', class {
    record: StubAudioContext = { closed: false, oscillators: [] };
    state = 'running';
    currentTime = 0;
    destination = {};
    constructor() {
      audioContexts.push(this.record);
    }
    createOscillator() {
      const oscillator: StubOscillator = { frequency: 0, type: 'sine', stoppedAt: 0 };
      this.record.oscillators.push(oscillator);
      return {
        frequency: {
          set value(value: number) {
            oscillator.frequency = value;
          },
        },
        set type(value: string) {
          oscillator.type = value;
        },
        connect: () => {},
        start: () => {},
        stop: (time: number) => {
          oscillator.stoppedAt = time;
        },
      };
    }
    createGain() {
      return { gain: { value: 1 }, connect: () => {} };
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      this.record.closed = true;
      this.state = 'closed';
      return Promise.resolve();
    }
  });

  return {
    frame: (ms = 16) => {
      now += ms;
      const pending = [...frames.entries()];
      frames.clear();
      pending.forEach(([, callback]) => callback(now));
    },
    pendingFrames: () => frames.size,
    setSize: (element, elementWidth, elementHeight) => {
      sizes.set(element, { width: elementWidth, height: elementHeight });
    },
    resize: () => resizeCallbacks.forEach((callback) => callback()),
    setVisible: (visible) => intersectionCallbacks.forEach((callback) => callback([{ isIntersecting: visible }])),
    setHidden: (nextHidden) => {
      hidden = nextHidden;
      document.dispatchEvent(new Event('visibilitychange'));
    },
    observers,
    audioContexts,
    restore: () => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
};
