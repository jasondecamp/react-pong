import classNames from 'classnames';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { LobbyFailure } from '../core/lobby.js';
import type { LobbyNotice } from '../core/protocol.js';
import { keyLabel, keysFor } from './keys.js';
import { usePongGame } from './usePongGame.js';

export type LobbyProps = {
  /** Added to the panel. */
  className?: string;
};

const failures: Record<LobbyFailure, string> = {
  notFound: 'No lobby has that code.',
  full: 'This lobby is full.',
  busy: 'The server is busy. Try again in a while.',
  version: 'This game needs an update.',
  rejected: 'The server closed the connection.',
  connection: "Can't reach the server.",
};

const notices: Record<LobbyNotice, string> = {
  opponentLeft: 'Your opponent left.',
  abandoned: "Your opponent didn't come back, so the match was abandoned.",
};

/**
 * Two-player: on the start screen, a hint naming the key that opens it, and
 * the panel that key opens over the court, for creating a lobby or joining
 * one by its code. In a lobby the panel leads with whatever matters at that
 * moment: the code and its link while waiting alone, being ready once the
 * other player is here, and the result and a rematch after a match. It
 * renders nothing unless `<Pong>` has a `server`.
 */
export const Lobby = ({ className }: LobbyProps) => {
  const game = usePongGame();
  const { lobby, phase, help, keys, scores, winner } = game;
  // What has been typed into the code field; until something is, the code this game was invited with.
  const [typed, setTyped] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  if (lobby == null) return null;

  const [lobbyKey] = keysFor(keys, 'lobby');
  const [serveKey] = keysFor(keys, 'serve');
  const [resetKey] = keysFor(keys, 'reset');
  const code = typed ?? lobby.invitation ?? '';
  const waiting = lobby.status === 'waiting';

  const join = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim() !== '') game.joinLobby(code);
  };

  const copy = () => {
    const { link } = lobby;
    if (link == null) return;
    // Refused without a secure page or the visitor's leave, in which case the link is there to select.
    navigator.clipboard?.writeText(link).then(() => setCopied(link), () => {});
  };

  const { opponent } = lobby;
  // Handed a code and not yet typed over it: joining is what this player came for.
  const invited = typed == null && lobby.invitation != null;
  const result = phase === 'gameOver' ? `${winner === 'right' ? 'You won' : 'You lost'} ${scores.right}–${scores.left}` : null;
  // The same two players, straight after their match.
  const rematch = result != null && opponent != null && lobby.notice == null;

  let presence = rematch ? 'Play again?' : 'Your opponent is here';
  if (lobby.ready) presence = 'Waiting for your opponent';
  else if (opponent?.ready === true) presence = rematch ? 'Your opponent wants a rematch' : 'Your opponent is ready';

  const goal = (
    <>
      First to <strong className='pong-lobby-score'>{lobby.winningScore}</strong> wins
    </>
  );

  const create = (
    <button
      type='button'
      className={classNames('pong-lobby-button', invited ? 'pong-lobby-button-quiet' : 'pong-lobby-button-primary')}
      onClick={() => game.createLobby()}
    >
      {invited ? 'Create a new lobby' : 'Create lobby'}
    </button>
  );

  const ready = (
    <button
      type='button'
      className={classNames('pong-lobby-button', !lobby.ready && opponent != null && 'pong-lobby-button-primary')}
      onClick={() => game.setReady(!lobby.ready)}
    >
      {lobby.ready ? 'Not ready' : rematch ? 'Rematch' : 'Ready'}
    </button>
  );

  const leave = (
    <button type='button' className='pong-lobby-button pong-lobby-button-quiet' onClick={() => game.leaveLobby()}>
      Leave
    </button>
  );

  return (
    <>
      {!lobby.open && !help && phase === 'start' && lobby.status === 'idle' && lobbyKey != null && (
        <p className='pong-hint pong-lobby-hint'>press {keyLabel(lobbyKey)} for two player</p>
      )}
      <div
        className={classNames('pong-lobby', !lobby.open && 'pong-lobby-hidden', className)}
        aria-hidden={!lobby.open}
      >
        {!waiting && <p className='pong-lobby-title'>Two player</p>}
        {lobby.error != null && <p className='pong-lobby-line pong-lobby-error' role='alert'>{failures[lobby.error]}</p>}
        {lobby.status === 'idle' && (
          <>
            {invited ? <p className='pong-lobby-line'>You're invited to a lobby.</p> : create}
            {!invited && <p className='pong-lobby-label'>or join one</p>}
            <form className='pong-lobby-join' onSubmit={join}>
              <input
                className='pong-lobby-field'
                value={code}
                onChange={(event) => setTyped(event.target.value.toUpperCase())}
                aria-label='Lobby code'
                placeholder='Code'
                maxLength={4}
                autoComplete='off'
                autoCapitalize='characters'
                spellCheck={false}
              />
              <button type='submit' className={classNames('pong-lobby-button', invited && 'pong-lobby-button-primary')}>
                Join
              </button>
            </form>
            {invited && create}
          </>
        )}
        {lobby.status === 'connecting' && <p className='pong-lobby-line'>Connecting…</p>}
        {waiting && opponent == null && (
          <>
            <p className='pong-lobby-code' aria-label={`Lobby code ${lobby.code?.split('').join(' ')}`}>{lobby.code}</p>
            {lobby.link != null && (
              <p className='pong-lobby-share'>
                <span className='pong-lobby-link'>{lobby.link}</span>
                <button type='button' className='pong-lobby-button pong-lobby-button-primary' onClick={copy}>
                  {copied === lobby.link ? 'Copied' : 'Copy link'}
                </button>
              </p>
            )}
            <p className='pong-lobby-line' aria-live='polite'>
              {lobby.notice != null && `${notices[lobby.notice]} `}
              {lobby.ready ? "You're ready. Waiting for another player." : 'Waiting for another player.'}
            </p>
            <p className='pong-lobby-actions'>
              {ready}
              {leave}
            </p>
            <p className='pong-lobby-details'>
              {result != null && `${result} · `}
              {goal}
            </p>
          </>
        )}
        {waiting && opponent != null && (
          <>
            <p className='pong-lobby-label'>{goal}</p>
            {rematch && <p className='pong-lobby-result'>{result}</p>}
            <p className={rematch ? 'pong-lobby-line' : 'pong-lobby-headline'} aria-live='polite'>{presence}</p>
            <p className='pong-lobby-actions'>
              {ready}
              {leave}
            </p>
            <p className='pong-lobby-details'>
              Lobby <span className='pong-lobby-code-small'>{lobby.code}</span>
            </p>
          </>
        )}
        <p className='pong-lobby-line pong-lobby-touch'>The game is played with a keyboard.</p>
        {waiting && serveKey != null && resetKey != null && (
          <p className='pong-hint'>
            press {keyLabel(serveKey)} {lobby.ready ? 'to cancel' : rematch ? 'for a rematch' : 'when ready'}, {keyLabel(resetKey)} to leave
          </p>
        )}
        {lobby.status === 'idle' && resetKey != null && <p className='pong-hint'>press {keyLabel(resetKey)} to close</p>}
      </div>
    </>
  );
};
