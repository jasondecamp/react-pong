import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { stubBrowser } from '../test/browserStubs.js';
import type { BrowserStubs } from '../test/browserStubs.js';
import { Pong } from './Pong.js';
import { usePongGame } from './usePongGame.js';

let browser: BrowserStubs;

/** Run frames until the phase shown by <Phase /> changes. */
const play = (maxFrames = 2000) => {
  const phase = () => screen.getByTestId('phase').textContent;
  const before = phase();
  act(() => {
    for (let frame = 0; frame < maxFrames && phase() === before; frame++) browser.frame();
  });
};

const Phase = () => {
  const { phase } = usePongGame();
  return <output data-testid='phase'>{phase}</output>;
};

const live = (records: { disconnected: boolean }[]) => records.filter(({ disconnected }) => !disconnected);

beforeEach(() => {
  browser = stubBrowser();
});

afterEach(() => {
  browser.restore();
});

describe('Pong', () => {
  it('renders the default arrangement: court, score, message, and help', () => {
    const { container } = render(<Pong />);
    const court = screen.getByRole('application', { name: 'Pong court' });
    expect(court).toHaveAttribute('tabindex', '0');
    expect(container.querySelector('.pong-ball')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.pong-paddle[aria-hidden="true"]')).toHaveLength(2);
    expect(container.querySelectorAll('.pong-ripple[aria-hidden="true"]')).toHaveLength(2);
    expect(container.querySelector('.pong-score')).toHaveTextContent('0:0');
    expect(screen.getByText('Shall we play a game?')).toBeVisible();
    expect(screen.getByText('press enter to start')).toHaveClass('pong-hint');
    expect(screen.getByText('press ? for help')).toHaveClass('pong-hint');
    expect(container.querySelector('.pong-help')).toHaveClass('pong-help-hidden');
  });

  it('adds its className to the root', () => {
    const { container } = render(<Pong className='arcade' />);
    expect(container.firstChild).toHaveClass('pong', 'arcade');
  });

  it('renders the start screen on the server', () => {
    const html = renderToString(<Pong />);
    expect(html).toContain('Shall we play a game?');
    expect(html).toContain('pong-court');
    expect(html).not.toContain('style=');
  });

  it('renders only the arrangement it is given', () => {
    const { container } = render(
      <Pong>
        <Pong.Court className='field' aria-label='Table tennis' />
        <Pong.Score />
      </Pong>,
    );
    expect(screen.getByRole('application', { name: 'Table tennis' })).toHaveClass('pong-court', 'field');
    expect(container.querySelector('.pong-score')).toBeInTheDocument();
    expect(container.querySelector('.pong-message')).not.toBeInTheDocument();
  });

  it('plays from the keyboard once the court is clicked', async () => {
    const user = userEvent.setup();
    render(<Pong toss={false}><Pong.Court /><Pong.Message /><Phase /></Pong>);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('phase')).toHaveTextContent('start');

    await user.click(screen.getByRole('application'));
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('phase')).toHaveTextContent('rally');
    expect(screen.getByText('Shall we play a game?')).toHaveClass('pong-message-hidden');

    await user.keyboard(' ');
    expect(screen.getByTestId('phase')).toHaveTextContent('paused');
    expect(screen.getByText('PAUSED')).not.toHaveClass('pong-message-hidden');
  });

  it('opens a match with the toss and its countdown', async () => {
    const user = userEvent.setup();
    render(<Pong><Pong.Court autoFocus /><Pong.Message /><Phase /></Pong>);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('phase')).toHaveTextContent('toss');
    expect(screen.getByText('Who serves first?')).toBeVisible();
    // One frame to an act, so each count reaches the page before the next is looked for.
    for (let frame = 0; frame < 600 && screen.queryByText('3') == null; frame++) act(() => browser.frame());
    expect(screen.getByText('3')).toHaveClass('pong-countdown');
    expect(screen.getByText(/^(My|Your) serve\.$/)).toBeInTheDocument();
    for (let frame = 0; frame < 600 && screen.queryByText('rally') == null; frame++) act(() => browser.frame());
    expect(screen.getByTestId('phase')).toHaveTextContent('rally');
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('focuses the court on mount when asked to', () => {
    render(<Pong><Pong.Court autoFocus /></Pong>);
    expect(screen.getByRole('application')).toHaveFocus();
  });

  it('shows the score and highlights the winner', async () => {
    const user = userEvent.setup();
    const onGameOver = vi.fn();
    const { container } = render(
      <Pong winningScore={1} onGameOver={onGameOver}>
        <Pong.Court autoFocus />
        <Pong.Score />
        <Pong.Message />
        <Phase />
      </Pong>,
    );
    await user.keyboard('{Enter}');
    play();
    expect(screen.getByTestId('phase')).toHaveTextContent('gameOver');
    expect(container.querySelectorAll('.pong-score-winner')).toHaveLength(1);
    expect(container.querySelector('.pong-score-winner')).toHaveTextContent('1');
    expect(screen.getByText('GAME OVER')).toBeVisible();
    expect(onGameOver).toHaveBeenCalledTimes(1);
  });

  it('applies changed options to the running game', async () => {
    const user = userEvent.setup();
    const arrangement = (
      <>
        <Pong.Court autoFocus />
        <Phase />
      </>
    );
    const { rerender } = render(<Pong>{arrangement}</Pong>);
    rerender(<Pong winningScore={1}>{arrangement}</Pong>);
    await user.keyboard('{Enter}');
    play();
    expect(screen.getByTestId('phase')).toHaveTextContent('gameOver');
  });

  it('gives custom subcomponents the state and controls', async () => {
    const user = userEvent.setup();
    const Serve = () => {
      const { phase, serve } = usePongGame();
      return <button type='button' onClick={() => serve()}>{phase}</button>;
    };
    render(<Pong toss={false}><Pong.Court /><Serve /></Pong>);
    await user.click(screen.getByRole('button', { name: 'start' }));
    expect(screen.getByRole('button', { name: 'rally' })).toBeInTheDocument();
  });

  it('renders subcomponents standalone, as a still start screen', () => {
    render(<><Pong.Court /><Pong.Score /><Pong.Message /></>);
    expect(screen.getByText('Shall we play a game?')).toBeVisible();
    expect(browser.observers.resize).toHaveLength(0);
  });

  it('keeps two games on one page from hearing each other\'s keys', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Pong toss={false}><Pong.Court aria-label='First' /><Pong.Message /></Pong>
        <Pong toss={false}><Pong.Court aria-label='Second' /><Pong.Message /></Pong>
      </>,
    );
    await user.click(screen.getByRole('application', { name: 'Second' }));
    await user.keyboard('{Enter}');
    const [first, second] = screen.getAllByText('Shall we play a game?');
    expect(first).not.toHaveClass('pong-message-hidden');
    expect(second).toHaveClass('pong-message-hidden');
  });

  it('runs one engine under StrictMode and releases everything on unmount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <StrictMode>
        <Pong toss={false}><Pong.Court autoFocus /><Phase /></Pong>
      </StrictMode>,
    );
    expect(live(browser.observers.resize)).toHaveLength(1);
    expect(live(browser.observers.intersection)).toHaveLength(1);

    await user.keyboard('{Enter}');
    expect(screen.getByTestId('phase')).toHaveTextContent('rally');
    expect(browser.pendingFrames()).toBe(1);
    expect(browser.audioContexts).toHaveLength(1);

    unmount();
    expect(browser.pendingFrames()).toBe(0);
    expect(live(browser.observers.resize)).toHaveLength(0);
    expect(live(browser.observers.intersection)).toHaveLength(0);
    expect(browser.audioContexts.every(({ closed }) => closed)).toBe(true);
  });
});
