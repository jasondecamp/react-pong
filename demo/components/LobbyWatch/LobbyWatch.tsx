import { useEffect } from 'react';
import { usePongGame } from 'react-pong';

type LobbyWatchProps = {
  /** Called with the winning score of the two-player lobby the game is in, or `null` when it is in none. */
  onChange: (winningScore: number | null) => void;
};

// Reports the game's two-player lobby to the page around it, from inside <Pong>. Renders nothing.
export const LobbyWatch = ({ onChange }: LobbyWatchProps) => {
  const { lobby } = usePongGame();
  const inLobby = lobby != null && (lobby.status === 'waiting' || lobby.status === 'playing');
  const winningScore = inLobby ? lobby.winningScore : null;
  useEffect(() => onChange(winningScore), [onChange, winningScore]);
  return null;
};
