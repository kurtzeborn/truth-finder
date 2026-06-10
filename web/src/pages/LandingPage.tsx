import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAuthStatus, joinGame } from '../api';

export function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [gameCode, setGameCode] = useState(searchParams.get('game') || '');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  const { data: auth } = useQuery({
    queryKey: ['auth'],
    queryFn: fetchAuthStatus,
  });

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const code = gameCode.trim().toUpperCase();
    const name = displayName.trim();

    if (!code || !name) {
      setError('Game code and name are required');
      return;
    }

    setJoining(true);
    try {
      const { playerId } = await joinGame(code, name);
      localStorage.setItem('playerSession', JSON.stringify({
        gameId: code,
        playerId,
        displayName: name,
      }));
      navigate('/play');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-2">One Truth</h1>
      <p className="text-gray-400 mb-8">2 Truths and 1 Lie</p>

      <form onSubmit={handleJoin} className="w-full max-w-sm space-y-4">
        <input
          type="text"
          placeholder="Game Code"
          value={gameCode}
          onChange={(e) => setGameCode(e.target.value.toUpperCase())}
          maxLength={4}
          className="w-full p-3 rounded bg-gray-800 border border-gray-700 text-center text-2xl tracking-widest uppercase"
          autoFocus={!gameCode}
        />
        <input
          type="text"
          placeholder="Your Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={20}
          className="w-full p-3 rounded bg-gray-800 border border-gray-700"
          autoFocus={!!gameCode}
        />
        <button
          type="submit"
          disabled={joining}
          className="w-full p-3 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 font-semibold"
        >
          {joining ? 'Joining...' : 'Join Game'}
        </button>
        {error && <p className="text-red-400 text-center">{error}</p>}
      </form>

      <div className="mt-12 text-gray-500 text-sm">
        {auth?.isGameKeeper ? (
          <a href="/manage" className="text-blue-400 hover:underline">Game Keeper Dashboard →</a>
        ) : auth?.isAuthenticated ? (
          <p>Signed in as {auth.user?.userDetails} (not a game keeper)</p>
        ) : (
          <a href="/.auth/login/aad" className="hover:underline">Game Keeper Sign In →</a>
        )}
      </div>
    </div>
  );
}
