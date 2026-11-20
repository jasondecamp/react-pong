import classNames from 'classnames';
import { useEffect, useState } from 'react';
import { isSmack, messageCopy } from './messages.js';
import { usePongGame } from './usePongGame.js';

export type MessageProps = {
  className?: string;
};

// Smack talk fades after this long, in milliseconds. Other messages stay.
const smackDuration = 5000;

/** The game's message, in the original's words. It fades in and out rather than popping. */
export const Message = ({ className }: MessageProps) => {
  const { message, messageCount, matchRoll, countdown } = usePongGame();
  // Which posting this is: a key can come round again with a different line.
  const id = `${matchRoll}:${message}:${messageCount}`;
  // The last message stays rendered while it fades out.
  const [last, setLast] = useState({ id, message, messageCount, matchRoll });
  if (message != null && id !== last.id) setLast({ id, message, messageCount, matchRoll });
  // The smack line that has had its time.
  const [expiredId, setExpiredId] = useState<string | null>(null);
  const smack = isSmack(message);

  useEffect(() => {
    if (!smack) return undefined;
    const timer = setTimeout(() => setExpiredId(id), smackDuration);
    return () => clearTimeout(timer);
  }, [smack, id]);

  const hidden = message == null || (smack && expiredId === id);
  const shown = message == null ? last : { message, messageCount, matchRoll };
  const copy = shown.message == null ? null : messageCopy(shown.message, shown.messageCount, shown.matchRoll);
  return (
    <p
      className={classNames(
        'pong-message',
        isSmack(shown.message) && 'pong-message-smack',
        hidden && 'pong-message-hidden',
        className,
      )}
      aria-live='polite'
      aria-hidden={hidden}
    >
      {copy?.text}
      {copy?.hint != null && <span className='pong-hint'>{copy.hint}</span>}
      {message != null && countdown != null && <span className='pong-countdown'>{countdown}</span>}
    </p>
  );
};
