import { stubBrowser } from '../test/browserStubs.js';
import type { BrowserStubs } from '../test/browserStubs.js';
import { createSound } from './sound.js';

let browser: BrowserStubs;

beforeEach(() => {
  browser = stubBrowser();
});

afterEach(() => {
  browser.restore();
});

describe('createSound', () => {
  it('creates no audio context until unlocked', () => {
    const sound = createSound(window);
    sound.play('wall');
    expect(browser.audioContexts).toHaveLength(0);
  });

  it('creates one context, however often it is unlocked', () => {
    const sound = createSound(window);
    sound.unlock();
    sound.unlock();
    expect(browser.audioContexts).toHaveLength(1);
  });

  it('plays each blip as a square wave at its own pitch and length', () => {
    const sound = createSound(window);
    sound.unlock();
    sound.play('wall');
    sound.play('paddle');
    sound.play('out');
    expect(browser.audioContexts[0]?.oscillators).toEqual([
      { type: 'square', frequency: 226, stoppedAt: 0.016 },
      { type: 'square', frequency: 459, stoppedAt: 0.096 },
      { type: 'square', frequency: 490, stoppedAt: 0.257 },
    ]);
  });

  it('closes the context and stays closed', () => {
    const sound = createSound(window);
    sound.unlock();
    sound.close();
    expect(browser.audioContexts[0]?.closed).toBe(true);
    sound.unlock();
    sound.play('wall');
    expect(browser.audioContexts).toHaveLength(1);
    expect(browser.audioContexts[0]?.oscillators).toHaveLength(0);
  });

  it('stays silent where there is no Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const sound = createSound(window);
    sound.unlock();
    expect(() => sound.play('wall')).not.toThrow();
  });
});
