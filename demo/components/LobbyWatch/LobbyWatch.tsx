import { useEffect } from 'react';
import { usePongGame } from 'react-pong';

type LobbyWatchProps = {
  /**
   * Called with the winning score of the two-player lobby the game is in, or `null` when it is in none, and
   * whether this player may change it: only the lobby's host, between matches.
   */
  onChange: (winningScore: number | null, editable: boolean) => void;
};

// Reports the game's two-player lobby to the page around it, from inside <Pong>. Renders nothing.
export const LobbyWatch = ({ onChange }: LobbyWatchProps) => {
  const { lobby } = usePongGame();
  const inLobby = lobby != null && (lobby.status === 'waiting' || lobby.status === 'playing');
  const winningScore = inLobby ? lobby.winningScore : null;
  const editable = inLobby && lobby.host && lobby.status === 'waiting';
  useEffect(() => onChange(winningScore, editable), [onChange, winningScore, editable]);
  return null;
};
