import classNames from 'classnames';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { PongOptions } from '../core/types.js';
import { Court } from './Court.js';
import { Message } from './Message.js';
import { PongContext } from './PongContext.js';
import { createPongStore } from './pongStore.js';
import { Score } from './Score.js';

export type PongProps = PongOptions & {
  /** Added to the root element, which is where to set the `--pong-*` custom properties. */
  className?: string;
  /** The arrangement. Default: `<Pong.Court />`, `<Pong.Score />`, and `<Pong.Message />`. */
  children?: ReactNode;
};

/**
 * A game of Pong that fills its parent; size the parent. Every other prop is a
 * game option, and options are live: change a prop and only that option
 * updates.
 *
 *   <Pong smack>
 *     <Pong.Court />
 *     <Pong.Score />
 *     <Pong.Message />
 *   </Pong>
 */
export const Pong = ({ className, children, ...options }: PongProps) => {
  const [store] = useState(createPongStore);

  useEffect(() => {
    store.sync(options);
  });

  return (
    <PongContext value={store}>
      <div className={classNames('pong', className)}>
        {children ?? (
          <>
            <Court />
            <Score />
            <Message />
          </>
        )}
      </div>
    </PongContext>
  );
};

Pong.Court = Court;
Pong.Score = Score;
Pong.Message = Message;
