import { act, render, screen } from '@testing-library/react';
import { initialState } from '../core/options.js';
import type { PongState } from '../core/types.js';
import { Message } from './Message.js';
import { PongContext } from './PongContext.js';
import { inertPongStore } from './pongStore.js';
import type { PongStore } from './pongStore.js';

/** A store whose state the test sets directly. */
const createFakeStore = () => {
  let state = initialState;
  const listeners = new Set<() => void>();
  const store: PongStore = {
    ...inertPongStore,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
  };
  const set = (next: Partial<PongState>) => act(() => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  });
  return { store, set };
};

const renderMessage = () => {
  const { store, set } = createFakeStore();
  const { container } = render(<PongContext value={store}><Message className='banner' /></PongContext>);
  const message = container.querySelector('.pong-message');
  if (message == null) throw new Error('No message rendered');
  return { message, set };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Message', () => {
  it('shows the start screen invitation with its hint', () => {
    const { message } = renderMessage();
    expect(message).toHaveTextContent('Shall we play a game?press enter to start');
    expect(message).toHaveClass('banner');
    expect(message).not.toHaveClass('pong-message-hidden');
    expect(message).toHaveAttribute('aria-live', 'polite');
  });

  it('keeps the last message in place while it fades out', () => {
    const { message, set } = renderMessage();
    set({ message: null });
    expect(message).toHaveClass('pong-message-hidden');
    expect(message).toHaveAttribute('aria-hidden', 'true');
    expect(message).toHaveTextContent('Shall we play a game?');
  });

  it('announces the toss, who serves, and the countdown', () => {
    const { message, set } = renderMessage();
    set({ phase: 'toss', message: 'toss' });
    expect(message).toHaveTextContent('Who serves first?');
    set({ message: 'serve.human', countdown: 3 });
    expect(message).toHaveTextContent('Your serve.3');
    expect(screen.getByText('3')).toHaveClass('pong-countdown');
    set({ message: 'serve.ai', countdown: 1 });
    expect(message).toHaveTextContent('My serve.1');
    set({ phase: 'rally', message: null, countdown: null });
    expect(message).toHaveClass('pong-message-hidden');
    expect(message).toHaveTextContent('My serve.');
  });

  it('says the game is over, and how to reset it', () => {
    const { message, set } = renderMessage();
    set({ message: 'gameOver' });
    expect(message).toHaveTextContent("GAME OVERWell that was fun... don't you have better things to do, human?");
    set({ message: 'reset' });
    expect(message).toHaveTextContent('GAME OVERpress esc to reset');
  });

  /** Every line dealt for `key` over a match that makes `remarks` of them. */
  const dealt = (key: 'smack.ai' | 'smack.human', remarks: number, matchRoll: number) => {
    const { message, set } = renderMessage();
    const lines: string[] = [];
    for (let messageCount = 0; messageCount < remarks; messageCount++) {
      set({ message: key, messageCount, matchRoll });
      lines.push(message.textContent);
    }
    return lines;
  };

  it('never repeats a smack line within a match', () => {
    expect(new Set(dealt('smack.ai', 25, 0.42)).size).toBe(25);
    expect(new Set(dealt('smack.human', 27, 0.42)).size).toBe(27);
    expect(dealt('smack.human', 27, 0.42)).toContain('Pshhh, lucky shot');
    expect(dealt('smack.human', 27, 0.42)).toContain('x7$ Gl▒tch 1n th▒ m@tr▒x #%&');
  });

  it('deals the lines in a different order each match, and the same order within one', () => {
    expect(dealt('smack.human', 25, 0.42)).toEqual(dealt('smack.human', 25, 0.42));
    expect(dealt('smack.human', 25, 0.42)).not.toEqual(dealt('smack.human', 25, 0.77));
  });

  it('starts the deck again only once every line has been said', () => {
    const lines = dealt('smack.ai', 27, 0.42);
    expect(lines[26]).toBe(lines[0]);
    expect(lines).toContain('A strange game. The only winning move is not to play.');
  });

  it('speaks smack talk in the AI\'s color, and nothing else', () => {
    const { message, set } = renderMessage();
    expect(message).not.toHaveClass('pong-message-smack');
    set({ message: 'smack.ai', messageCount: 0, matchRoll: 0.3 });
    expect(message).toHaveClass('pong-message-smack');
    set({ message: null });
    expect(message).toHaveClass('pong-message-smack', 'pong-message-hidden');
    set({ message: 'paused' });
    expect(message).not.toHaveClass('pong-message-smack');
  });

  it('fades smack talk after 5 seconds', () => {
    const { message, set } = renderMessage();
    set({ message: 'smack.human', messageCount: 0, matchRoll: 0.3 });
    const line = message.textContent;
    act(() => vi.advanceTimersByTime(4900));
    expect(message).not.toHaveClass('pong-message-hidden');
    act(() => vi.advanceTimersByTime(200));
    expect(message).toHaveClass('pong-message-hidden');
    expect(message).toHaveTextContent(line);
  });

  it('shows the next smack line after one has faded', () => {
    const { message, set } = renderMessage();
    set({ message: 'smack.human', messageCount: 0, matchRoll: 0.3 });
    const first = message.textContent;
    act(() => vi.advanceTimersByTime(5000));
    set({ message: null });
    set({ message: 'smack.human', messageCount: 1, matchRoll: 0.3 });
    expect(message).not.toHaveClass('pong-message-hidden');
    expect(message.textContent).not.toBe(first);
    expect(screen.queryByText('press enter to start')).not.toBeInTheDocument();
  });

  it('leaves other messages up', () => {
    const { message, set } = renderMessage();
    set({ message: 'paused' });
    act(() => vi.advanceTimersByTime(60000));
    expect(message).not.toHaveClass('pong-message-hidden');
    expect(message).toHaveTextContent('PAUSEDpress space to resume');
  });
});
