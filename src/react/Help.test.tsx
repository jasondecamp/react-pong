import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { stubBrowser } from '../test/browserStubs.js';
import type { BrowserStubs } from '../test/browserStubs.js';
import type { PongDifficulty, PongOptions } from '../core/types.js';
import { Help } from './Help.js';
import { Pong } from './Pong.js';
import { usePongGame } from './usePongGame.js';

let browser: BrowserStubs;

const Phase = () => {
  const { phase } = usePongGame();
  return <output data-testid='phase'>{phase}</output>;
};

const renderGame = (options: PongOptions = {}) => {
  const { container } = render(<Pong toss={false} {...options}><Pong.Court autoFocus /><Pong.Help /><Phase /></Pong>);
  const overlay = container.querySelector('.pong-help');
  if (overlay == null) throw new Error('No help rendered');
  /** The overlay's rows, as "keys: what they do". */
  const rows = () => [...overlay.querySelectorAll('.pong-help-keys .pong-help-row')].map((row) => {
    const caps = [...row.querySelectorAll('kbd')].map((cap) => cap.textContent);
    return `${caps.join(' ')}: ${row.querySelector('dd')?.textContent}`;
  });
  return { overlay, rows };
};

beforeEach(() => {
  browser = stubBrowser();
});

afterEach(() => {
  browser.restore();
});

describe('Help', () => {
  it('points to the help and shows the difficulty', () => {
    const { overlay } = renderGame();
    expect(screen.getByText('press ? for help')).toHaveClass('pong-hint');
    const difficulty = screen.getByText('normal');
    expect(difficulty).toHaveClass('pong-hint', 'pong-difficulty', 'pong-difficulty-normal');
    expect(difficulty.nextElementSibling).toHaveTextContent('press ? for help');
    expect(overlay).toHaveClass('pong-help-hidden');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  it('opens on the help key, listing every key, and closes on it or Escape', async () => {
    const user = userEvent.setup();
    const { overlay, rows } = renderGame();
    await user.keyboard('?');
    expect(overlay).not.toHaveClass('pong-help-hidden');
    expect(overlay).toHaveAttribute('aria-hidden', 'false');
    expect(rows()).toEqual([
      '↑: Move up',
      '↓: Move down',
      'Enter: Serve',
      'Space: Pause or resume',
      'Esc: Reset after game over',
      'D: Change difficulty (locked during active game)',
      '?: Show or hide these keys',
    ]);
    expect(overlay.firstElementChild).toHaveClass('pong-help-goal');
    expect(overlay.firstElementChild).toHaveTextContent('First to 11 wins');
    expect(screen.getByText('11')).toHaveClass('pong-help-goal-score');
    expect(screen.getByText('Advanced')).toHaveClass('pong-hint');
    expect([...overlay.querySelectorAll('.pong-help-tips .pong-help-row')].map((tip) => tip.textContent)).toEqual([
      'MomentumA moving paddle adds some momentum to the ball. The faster it moves at the hit, the sharper the angle.',
      'CornersThe top and bottom corners of your paddle send the ball off steeply.',
    ]);
    expect(screen.getByText('press ? or Esc to close')).toHaveClass('pong-hint');
    await user.keyboard('?');
    expect(overlay).toHaveClass('pong-help-hidden');
    await user.keyboard('?{Escape}');
    expect(overlay).toHaveClass('pong-help-hidden');
    expect(screen.getByTestId('phase')).toHaveTextContent('start');
  });

  it('pauses a game in progress, hiding the difficulty during one but still listing its key', async () => {
    const user = userEvent.setup();
    const { overlay, rows } = renderGame();
    await user.keyboard('{Enter}');
    expect(screen.queryByText('normal')).not.toBeInTheDocument();
    expect(screen.getByText('press ? for help')).toBeInTheDocument();
    await user.keyboard('?');
    expect(screen.getByTestId('phase')).toHaveTextContent('paused');
    expect(overlay).not.toHaveClass('pong-help-hidden');
    expect(rows()).toContain('D: Change difficulty (locked during active game)');
  });

  it('lists the keys of a remapped game', async () => {
    const user = userEvent.setup();
    const { rows } = renderGame({ keys: { w: 'up', ArrowUp: 'up', s: 'down', Tab: 'serve', h: 'help' } });
    expect(screen.getByText('press H for help')).toBeInTheDocument();
    await user.keyboard('h');
    expect(rows()).toEqual(['W ↑: Move up', 'S: Move down', 'Tab: Serve', 'H: Show or hide these keys']);
    expect(screen.getByText('press H to close')).toBeInTheDocument();
  });

  it('follows the winning score', () => {
    const { container, rerender } = render(<Pong winningScore={5} />);
    expect(container.querySelector('.pong-help-goal')).toHaveTextContent('First to 5 wins');
    rerender(<Pong winningScore={21} />);
    expect(container.querySelector('.pong-help-goal')).toHaveTextContent('First to 21 wins');
  });

  it('shows no hint or row for a key that is not mapped', () => {
    const { rows } = renderGame({ keys: { Enter: 'serve' } });
    expect(screen.queryByText(/for help/)).not.toBeInTheDocument();
    expect(rows()).toEqual(['Enter: Serve']);
  });

  it('changes the difficulty on its key, and tells a parent that controls it', async () => {
    const user = userEvent.setup();
    const Controlled = () => {
      const [difficulty, setDifficulty] = useState<PongDifficulty>('easy');
      return (
        <Pong difficulty={difficulty} onDifficultyChange={setDifficulty}>
          <Pong.Court autoFocus />
          <Pong.Help />
          <output data-testid='difficulty'>{difficulty}</output>
        </Pong>
      );
    };
    render(<Controlled />);
    await user.keyboard('d');
    expect(screen.getByTestId('difficulty')).toHaveTextContent('normal');
    await user.keyboard('d');
    expect(screen.getByTestId('difficulty')).toHaveTextContent('hard');
    expect(screen.getByText('hard', { selector: '.pong-hint' })).toHaveClass('pong-difficulty-hard');
  });

  it('renders standalone, closed', () => {
    const { container } = render(<Help className='keys' />);
    expect(container.querySelector('.pong-help')).toHaveClass('pong-help-hidden', 'keys');
  });
});
