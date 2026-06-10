import { useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchGameState } from '../api';
import type { PlayerSession, GameState } from '../types';

function LobbySection({ state }: { state: GameState }) {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-4">You're in!</h2>
      <p className="text-gray-400 mb-2">Waiting for groups to be assigned...</p>
      <p className="text-gray-500">{state.players?.length ?? 0} players joined</p>
    </div>
  );
}

function GroupingSection({ state }: { state: GameState }) {
  return (
    <div className="text-center">
      <p className="text-gray-400 mb-2">You are in</p>
      <h2 className="text-8xl font-bold mb-4">Group {state.player?.groupLetter}</h2>
      <p className="text-gray-400 mb-4">Find your group members!</p>
      {state.groupMembers && (
        <ul className="text-gray-300 space-y-1">
          {state.groupMembers.map(p => (
            <li key={p.id}>{p.displayName}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatementsSection({ state }: { state: GameState }) {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-4">Group {state.player?.groupLetter} Statements</h2>
      <p className="text-gray-400 mb-4">Enter 2 truths and 1 lie about your group</p>
      <p className="text-gray-500">Statement entry coming in Phase 3</p>
    </div>
  );
}

function VotingSection({ state }: { state: GameState }) {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-4">Voting</h2>
      {state.game.currentVotingGroup === state.player?.groupLetter ? (
        <p className="text-yellow-400 text-xl">Your group is being presented! Watch the screen.</p>
      ) : (
        <p className="text-gray-400">Voting UI coming in Phase 4</p>
      )}
    </div>
  );
}

function ResultsSection({ state }: { state: GameState }) {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-4">Results</h2>
      <p className="text-gray-400">Leaderboard coming in Phase 5</p>
      {state.scores && (
        <ul className="space-y-1 mt-4">
          {state.scores.map((p, i) => (
            <li key={p.id} className="text-gray-300">
              {i + 1}. {p.displayName} — {p.score} pts
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PlayerPage() {
  // Read session from localStorage once (not in an effect)
  const session = useMemo<PlayerSession | null>(() => {
    const stored = localStorage.getItem('playerSession');
    if (stored) return JSON.parse(stored);
    return null;
  }, []);

  const { data: state, error } = useQuery({
    queryKey: ['gameState', session?.gameId, session?.playerId],
    queryFn: () => fetchGameState(session!.gameId, session!.playerId),
    enabled: !!session,
    refetchInterval: (query) => {
      const status = query.state.data?.game.status;
      if (status === 'results') return false;
      if (status === 'voting') return 3000;
      return 5000;
    },
  });

  // Persist group assignment to localStorage when received
  useEffect(() => {
    if (state?.player?.groupLetter && session) {
      const stored = localStorage.getItem('playerSession');
      const current: PlayerSession = stored ? JSON.parse(stored) : session;
      if (current.groupLetter !== state.player.groupLetter) {
        const updated = { ...current, groupLetter: state.player.groupLetter };
        localStorage.setItem('playerSession', JSON.stringify(updated));
      }
    }
  }, [state?.player?.groupLetter, session]);

  if (!session) return <Navigate to="/" replace />;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error.message}</p>
          <button onClick={() => { localStorage.removeItem('playerSession'); window.location.href = '/'; }}
            className="text-blue-400 hover:underline">Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      {!state ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        (() => {
          switch (state.game.status) {
            case 'lobby': return <LobbySection state={state} />;
            case 'grouping': return <GroupingSection state={state} />;
            case 'statements': return <StatementsSection state={state} />;
            case 'voting': return <VotingSection state={state} />;
            case 'results': return <ResultsSection state={state} />;
          }
        })()
      )}
    </div>
  );
}
