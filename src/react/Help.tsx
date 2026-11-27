import classNames from 'classnames';
import type { PongAction, PongDifficulty } from '../core/types.js';
import { keyLabel, keysFor } from './keys.js';
import { usePongGame } from './usePongGame.js';

export type HelpProps = {
  /** Added to the overlay. */
  className?: string;
};

const rows: readonly { action: PongAction; label: string }[] = [
  { action: 'up', label: 'Move up' },
  { action: 'down', label: 'Move down' },
  { action: 'serve', label: 'Serve' },
  { action: 'pause', label: 'Pause or resume' },
  { action: 'reset', label: 'Reset after game over' },
  { action: 'difficulty', label: 'Change difficulty (locked during active game)' },
  { action: 'lobby', label: 'Two player' },
  { action: 'help', label: 'Show or hide these keys' },
];

// What the ball does off a paddle that the keys alone don't tell you.
const tips: readonly { term: string; text: string }[] = [
  { term: 'Momentum', text: 'A moving paddle adds some momentum to the ball. The faster it moves at the hit, the sharper the angle.' },
  { term: 'Corners', text: 'The top and bottom corners of your paddle send the ball off steeply.' },
];

// Each difficulty has its own color.
const difficultyClasses: Record<PongDifficulty, string> = {
  easy: 'pong-difficulty-easy',
  normal: 'pong-difficulty-normal',
  hard: 'pong-difficulty-hard',
  impossible: 'pong-difficulty-impossible',
};

/**
 * Just above the score, the current difficulty in its own color (between
 * games, when it can be changed) and a hint pointing to the help. The help is
 * an overlay headed by the score to play to, listing every key the game
 * handles, read from the current key map, and then how the paddle shapes a
 * shot. The help key opens it, pausing a rally, and the help or reset key
 * closes it.
 */
export const Help = ({ className }: HelpProps) => {
  const { phase, difficulty, winningScore, help, keys, lobby } = usePongGame();
  // Against another player there is no difficulty, and without a server no two-player.
  const versus = lobby != null && lobby.status !== 'idle';
  const [helpKey] = keysFor(keys, 'help');
  const [resetKey] = keysFor(keys, 'reset');
  const closers = [helpKey, resetKey].filter((key) => key != null).map(keyLabel);
  return (
    <>
      <div className='pong-help-hints' aria-live='polite' aria-hidden={help}>
        {(phase === 'start' || phase === 'gameOver') && !versus && (
          <p className={classNames('pong-hint', 'pong-difficulty', difficultyClasses[difficulty])}>{difficulty}</p>
        )}
        {helpKey != null && <p className='pong-hint'>press {keyLabel(helpKey)} for help</p>}
      </div>
      <div
        className={classNames('pong-help', !help && 'pong-help-hidden', className)}
        aria-live='polite'
        aria-hidden={!help}
      >
        <p className='pong-help-goal'>
          First to <strong className='pong-help-goal-score'>{winningScore}</strong> wins
        </p>
        <div className='pong-help-list'>
          <dl className='pong-help-keys'>
            {rows.map(({ action, label }) => {
              const bound = keysFor(keys, action);
              if (bound.length === 0 || (action === 'lobby' && lobby == null)) return null;
              return (
                <div key={action} className='pong-help-row'>
                  <dt className='pong-help-key'>
                    {bound.map((key) => <kbd key={key} className='pong-help-cap'>{keyLabel(key)}</kbd>)}
                  </dt>
                  <dd className='pong-help-action'>{label}</dd>
                </div>
              );
            })}
          </dl>
          <p className='pong-hint pong-help-heading'>Advanced</p>
          <dl className='pong-help-tips'>
            {tips.map(({ term, text }) => (
              <div key={term} className='pong-help-row'>
                <dt className='pong-help-term'>{term}</dt>
                <dd className='pong-help-action'>{text}</dd>
              </div>
            ))}
          </dl>
        </div>
        {closers.length > 0 && <p className='pong-hint'>press {closers.join(' or ')} to close</p>}
      </div>
    </>
  );
};
