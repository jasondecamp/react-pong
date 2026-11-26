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
 * one by its code. In a lobby the panel shows the code and its link to share,
 * who is here and who is ready, and the last match's score. It renders
 * nothing unless `<Pong>` has a `server`.
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

  let presence = 'Waiting for another player.';
  if (lobby.opponent != null) presence = lobby.opponent.ready ? 'Your opponent is ready.' : 'Your opponent is here.';

  return (
    <>
      {!lobby.open && !help && phase === 'start' && lobby.status === 'idle' && lobbyKey != null && (
        <p className='pong-hint pong-lobby-hint'>press {keyLabel(lobbyKey)} for two player</p>
      )}
      <div
        className={classNames('pong-lobby', !lobby.open && 'pong-lobby-hidden', className)}
        aria-hidden={!lobby.open}
      >
        <p className='pong-lobby-title'>Two player</p>
        {lobby.status === 'idle' && (
          <>
            <button type='button' className='pong-lobby-button' onClick={() => game.createLobby()}>
              Create lobby
            </button>
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
              <button type='submit' className='pong-lobby-button'>Join</button>
            </form>
          </>
        )}
        {lobby.status === 'connecting' && <p className='pong-lobby-line'>Connecting…</p>}
        {waiting && (
          <>
            <p className='pong-lobby-code' aria-label={`Lobby code ${lobby.code?.split('').join(' ')}`}>{lobby.code}</p>
            {lobby.link != null && (
              <p className='pong-lobby-share'>
                <span className='pong-lobby-link'>{lobby.link}</span>
                <button type='button' className='pong-lobby-button' onClick={copy}>
                  {copied === lobby.link ? 'Copied' : 'Copy link'}
                </button>
              </p>
            )}
            {phase === 'gameOver' && (
              <p className='pong-lobby-line'>
                {winner === 'right' ? 'You won' : 'You lost'} {scores.right}–{scores.left}.
              </p>
            )}
            {lobby.notice != null && <p className='pong-lobby-line'>{notices[lobby.notice]}</p>}
            <p className='pong-lobby-line' aria-live='polite'>{presence}</p>
            <p className='pong-lobby-line'>
              First to <strong className='pong-lobby-score'>{lobby.winningScore}</strong> wins
            </p>
            <p className='pong-lobby-actions'>
              <button
                type='button'
                className='pong-lobby-button'
                aria-pressed={lobby.ready}
                onClick={() => game.setReady(!lobby.ready)}
              >
                {lobby.ready ? 'Ready. Waiting for your opponent' : 'Ready'}
              </button>
              <button type='button' className='pong-lobby-button' onClick={() => game.leaveLobby()}>Leave</button>
            </p>
          </>
        )}
        {lobby.error != null && <p className='pong-lobby-line pong-lobby-error' role='alert'>{failures[lobby.error]}</p>}
        <p className='pong-lobby-line pong-lobby-touch'>The game is played with a keyboard.</p>
        {waiting && serveKey != null && resetKey != null && (
          <p className='pong-hint'>press {keyLabel(serveKey)} when ready, {keyLabel(resetKey)} to leave</p>
        )}
        {lobby.status === 'idle' && resetKey != null && <p className='pong-hint'>press {keyLabel(resetKey)} to close</p>}
      </div>
    </>
  );
};
