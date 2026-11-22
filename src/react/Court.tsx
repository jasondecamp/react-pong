import classNames from 'classnames';
import { useContext, useEffect, useRef } from 'react';
import type { PongState, Side } from '../core/types.js';
import { PongContext } from './PongContext.js';
import { usePongGame } from './usePongGame.js';

export type CourtProps = {
  className?: string;
  /** Names the court for assistive technology. Default `'Pong court'`. */
  'aria-label'?: string;
  /** Focus the court when it mounts, so the keys work without a click. For pages the game owns. Default `false`. */
  autoFocus?: boolean;
};

// The ghosts in the ball's trail: enough for each to finish fading before the ball leaves it again.
const trailGhosts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Whether `side` is one point from winning a game that is under way. */
const atGamePoint = ({ phase, scores, winningScore }: PongState, side: Side) => (
  phase !== 'start' && phase !== 'gameOver' && scores[side] === winningScore - 1
);

/**
 * The playfield: a focusable box holding the ball and both paddles. Keys reach
 * the game only while it has focus; clicking it focuses it. A paddle one point
 * from winning glows, and on the impossible difficulty the AI's paddle pulses
 * the whole time.
 */
export const Court = ({ className, 'aria-label': ariaLabel = 'Pong court', autoFocus = false }: CourtProps) => {
  const store = useContext(PongContext);
  const game = usePongGame();
  const courtRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const ballColorRef = useRef<HTMLDivElement>(null);
  const leftPaddleRef = useRef<HTMLDivElement>(null);
  const rightPaddleRef = useRef<HTMLDivElement>(null);
  const leftRippleRef = useRef<HTMLDivElement>(null);
  const rightRippleRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const court = courtRef.current;
    const ball = ballRef.current;
    const leftPaddle = leftPaddleRef.current;
    const rightPaddle = rightPaddleRef.current;
    if (court == null || ball == null || leftPaddle == null || rightPaddle == null) return undefined;
    return store.attach({
      court,
      ball,
      ballColor: ballColorRef.current,
      leftPaddle,
      rightPaddle,
      leftRipple: leftRippleRef.current,
      rightRipple: rightRippleRef.current,
      trail: trailRef.current,
    });
  }, [store]);

  useEffect(() => {
    if (autoFocus) courtRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <div
      ref={courtRef}
      className={classNames('pong-court', className)}
      role='application'
      aria-label={ariaLabel}
      tabIndex={0}
    >
      <div ref={leftRippleRef} className='pong-ripple pong-ripple-left' aria-hidden />
      <div ref={rightRippleRef} className='pong-ripple pong-ripple-right' aria-hidden />
      <div ref={trailRef} className='pong-trail' aria-hidden>
        {trailGhosts.map((ghost) => (
          <div key={ghost} className='pong-ball'>
            <div className='pong-ball-color' />
          </div>
        ))}
      </div>
      <div ref={ballRef} className='pong-ball' aria-hidden>
        <div ref={ballColorRef} className='pong-ball-color' />
      </div>
      <div
        ref={leftPaddleRef}
        className={classNames(
          'pong-paddle',
          'pong-paddle-left',
          game.difficulty === 'impossible' && 'pong-paddle-pulsing',
          atGamePoint(game, 'left') && 'pong-paddle-game-point',
        )}
        aria-hidden
      />
      <div
        ref={rightPaddleRef}
        className={classNames('pong-paddle', 'pong-paddle-right', atGamePoint(game, 'right') && 'pong-paddle-game-point')}
        aria-hidden
      />
    </div>
  );
};
