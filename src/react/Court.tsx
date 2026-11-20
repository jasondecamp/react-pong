import classNames from 'classnames';
import { useContext, useEffect, useRef } from 'react';
import { PongContext } from './PongContext.js';
import { usePongGame } from './usePongGame.js';

export type CourtProps = {
  className?: string;
  /** Names the court for assistive technology. Default `'Pong court'`. */
  'aria-label'?: string;
  /** Focus the court when it mounts, so the keys work without a click. For pages the game owns. Default `false`. */
  autoFocus?: boolean;
};

/**
 * The playfield: a focusable box holding the ball and both paddles. Keys reach
 * the game only while it has focus; clicking it focuses it. On the impossible
 * difficulty the AI's paddle pulses.
 */
export const Court = ({ className, 'aria-label': ariaLabel = 'Pong court', autoFocus = false }: CourtProps) => {
  const store = useContext(PongContext);
  const { difficulty } = usePongGame();
  const courtRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const leftPaddleRef = useRef<HTMLDivElement>(null);
  const rightPaddleRef = useRef<HTMLDivElement>(null);
  const leftRippleRef = useRef<HTMLDivElement>(null);
  const rightRippleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const court = courtRef.current;
    const ball = ballRef.current;
    const leftPaddle = leftPaddleRef.current;
    const rightPaddle = rightPaddleRef.current;
    if (court == null || ball == null || leftPaddle == null || rightPaddle == null) return undefined;
    return store.attach({
      court,
      ball,
      leftPaddle,
      rightPaddle,
      leftRipple: leftRippleRef.current,
      rightRipple: rightRippleRef.current,
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
      <div ref={ballRef} className='pong-ball' aria-hidden />
      <div
        ref={leftPaddleRef}
        className={classNames('pong-paddle', 'pong-paddle-left', difficulty === 'impossible' && 'pong-paddle-pulsing')}
        aria-hidden
      />
      <div ref={rightPaddleRef} className='pong-paddle pong-paddle-right' aria-hidden />
    </div>
  );
};
