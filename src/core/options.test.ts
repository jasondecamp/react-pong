// @vitest-environment node
import { defaultKeys, defaultOptions, resolveOptions } from './options.js';

describe('resolveOptions', () => {
  it('fills in the defaults', () => {
    expect(resolveOptions({})).toEqual(defaultOptions);
  });

  it('treats undefined as the default', () => {
    expect(resolveOptions({ winningScore: undefined, paddleSpeed: undefined }).winningScore).toBe(11);
    expect(resolveOptions({ paddleSpeed: undefined }).paddleSpeed).toBe(1.2);
  });

  it('clamps numbers into range', () => {
    expect(resolveOptions({ winningScore: 0 }).winningScore).toBe(1);
    expect(resolveOptions({ winningScore: 3.9 }).winningScore).toBe(3);
    expect(resolveOptions({ winningScore: NaN }).winningScore).toBe(11);
    expect(resolveOptions({ paddleSpeed: -5 }).paddleSpeed).toBe(0);
    expect(resolveOptions({ paddleSpeed: Infinity }).paddleSpeed).toBe(1.2);
  });

  it('keeps only keys mapped to real actions', () => {
    const keys = { w: 'up', s: 'down', x: 'explode' } as unknown as Record<string, 'up'>;
    expect(resolveOptions({ keys }).keys).toEqual({ w: 'up', s: 'down' });
  });

  it('falls back to the default keys for anything that is not a map', () => {
    expect(resolveOptions({ keys: 'arrows' as unknown as Record<string, 'up'> }).keys).toBe(defaultKeys);
  });

  it('falls back to normal for an unknown difficulty', () => {
    expect(resolveOptions({ difficulty: 'hard' }).difficulty).toBe('hard');
    expect(resolveOptions({ difficulty: 'medium' as 'normal' }).difficulty).toBe('normal');
  });

  it('keeps the callbacks', () => {
    const onPoint = () => {};
    expect(resolveOptions({ onPoint }).onPoint).toBe(onPoint);
  });
});
