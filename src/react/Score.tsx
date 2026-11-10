import classNames from 'classnames';
import { usePongGame } from './usePongGame.js';

export type ScoreProps = {
  className?: string;
};

/** The two scores, AI on the left. The winner's is highlighted. */
export const Score = ({ className }: ScoreProps) => {
  const { scores, winner } = usePongGame();
  return (
    <div className={classNames('pong-score', className)}>
      <span className={classNames('pong-score-side', winner === 'left' && 'pong-score-winner')}>{scores.left}</span>
      <span className='pong-score-divider'>:</span>
      <span className={classNames('pong-score-side', winner === 'right' && 'pong-score-winner')}>{scores.right}</span>
    </div>
  );
};
