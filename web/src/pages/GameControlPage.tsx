import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { fetchAuthStatus, fetchGame, fetchGameState, fetchGroups, assignGroups, transitionGame, deleteGame, openVoting, closeVoting, fetchVotingResults } from '../api';
import type { GroupInfo } from '../api';
import type { Game } from '../types';

function LobbyView({ gameId, playerCount, players }: {
  gameId: string;
  playerCount: number;
  players?: Array<{ id: string; displayName: string }>;
}) {
  const [groupSize, setGroupSize] = useState(5);
  const queryClient = useQueryClient();

  const assignMutation = useMutation({
    mutationFn: () => assignGroups(gameId, groupSize),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      queryClient.invalidateQueries({ queryKey: ['gameState', gameId] });
    },
  });

  const gameUrl = `${window.location.origin}/?game=${gameId}`;

  return (
    <div className="flex flex-col items-center gap-8">
      {/* QR Code */}
      <div className="bg-white p-6 rounded-2xl">
        <QRCodeSVG value={gameUrl} size={280} level="M" />
      </div>
      <div className="text-center">
        <p className="text-6xl font-bold tracking-[0.3em] font-mono">{gameId}</p>
        <p className="text-gray-400 mt-2 text-sm">{gameUrl}</p>
      </div>

      {/* Player count and list */}
      <div className="w-full max-w-md">
        <h2 className="text-xl font-semibold mb-3 text-center">
          {playerCount} {playerCount === 1 ? 'player' : 'players'} joined
        </h2>
        {players && players.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {players.map(p => (
              <span key={p.id} className="px-3 py-1 rounded-full bg-gray-800 text-sm">
                {p.displayName}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Group assignment controls */}
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center gap-4">
          <label className="text-gray-400 whitespace-nowrap">Group size:</label>
          <input
            type="number"
            min={2}
            max={20}
            value={groupSize}
            onChange={(e) => setGroupSize(Math.max(2, Math.min(20, parseInt(e.target.value) || 2)))}
            className="w-20 p-2 rounded bg-gray-800 border border-gray-700 text-center"
          />
          <span className="text-gray-500 text-sm">
            ({Math.ceil(playerCount / groupSize)} groups)
          </span>
        </div>
        <button
          onClick={() => assignMutation.mutate()}
          disabled={assignMutation.isPending || playerCount < 2}
          className="w-full p-3 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 font-semibold"
        >
          {assignMutation.isPending ? 'Assigning...' : 'Assign Groups'}
        </button>
        {playerCount < 2 && (
          <p className="text-yellow-400 text-sm text-center">Need at least 2 players</p>
        )}
        {assignMutation.isError && (
          <p className="text-red-400 text-sm text-center">{assignMutation.error.message}</p>
        )}
      </div>
    </div>
  );
}

function GroupingView({ gameId, groups }: {
  gameId: string;
  groups: Record<string, GroupInfo>;
}) {
  const queryClient = useQueryClient();

  const transitionMutation = useMutation({
    mutationFn: () => transitionGame(gameId, 'statements'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    },
  });

  const sortedLetters = Object.keys(groups).sort();

  return (
    <div className="w-full max-w-4xl space-y-6">
      <h2 className="text-2xl font-bold text-center">Group Roster</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {sortedLetters.map(letter => (
          <div key={letter} className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-xl font-bold text-blue-400 mb-2">
              Group {letter}
              <span className="text-gray-500 text-sm font-normal ml-2">({groups[letter].players.length})</span>
            </h3>
            <ul className="space-y-1">
              {groups[letter].players.map(p => (
                <li key={p.id} className="text-gray-300 text-sm">{p.displayName}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex justify-center pt-4">
        <button
          onClick={() => transitionMutation.mutate()}
          disabled={transitionMutation.isPending}
          className="px-8 py-3 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 font-semibold"
        >
          {transitionMutation.isPending ? 'Starting...' : 'Begin Statements →'}
        </button>
      </div>
      {transitionMutation.isError && (
        <p className="text-red-400 text-center">{transitionMutation.error.message}</p>
      )}
    </div>
  );
}

function StatementsView({ gameId, groups }: {
  gameId: string;
  groups: Record<string, GroupInfo>;
}) {
  const queryClient = useQueryClient();

  const transitionMutation = useMutation({
    mutationFn: () => transitionGame(gameId, 'voting'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    },
  });

  const sortedLetters = Object.keys(groups).sort();
  const allComplete = sortedLetters.every(l => groups[l].statementCount === 3 && groups[l].hasLie);
  const totalGroups = sortedLetters.length;
  const completedGroups = sortedLetters.filter(l => groups[l].statementCount === 3 && groups[l].hasLie).length;

  return (
    <div className="w-full max-w-4xl space-y-6">
      <h2 className="text-2xl font-bold text-center">Statement Progress</h2>
      <p className="text-gray-400 text-center">{completedGroups}/{totalGroups} groups complete</p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {sortedLetters.map(letter => {
          const g = groups[letter];
          const complete = g.statementCount === 3 && g.hasLie;
          return (
            <div key={letter} className={`rounded-lg p-4 ${complete ? 'bg-green-900/40 border border-green-700' : 'bg-gray-800'}`}>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xl font-bold text-blue-400">Group {letter}</h3>
                <span className={`text-sm font-mono ${complete ? 'text-green-400' : 'text-gray-400'}`}>
                  {g.statementCount}/3 {complete ? '✓' : ''}
                </span>
              </div>
              <div className="flex gap-1">
                {[1, 2, 3].map(n => (
                  <div
                    key={n}
                    className={`h-2 flex-1 rounded ${n <= g.statementCount ? (complete ? 'bg-green-500' : 'bg-blue-500') : 'bg-gray-700'}`}
                  />
                ))}
              </div>
              {g.statementCount > 0 && !g.hasLie && (
                <p className="text-yellow-400 text-xs mt-2">No lie marked</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-2 pt-4">
        {!allComplete && (
          <p className="text-yellow-400 text-sm">Not all groups have completed their statements</p>
        )}
        <button
          onClick={() => transitionMutation.mutate()}
          disabled={transitionMutation.isPending}
          className={`px-8 py-3 rounded font-semibold disabled:opacity-50 ${
            allComplete ? 'bg-blue-600 hover:bg-blue-700' : 'bg-yellow-600 hover:bg-yellow-700'
          }`}
        >
          {transitionMutation.isPending ? 'Starting...' : allComplete ? 'Begin Voting →' : 'Begin Voting Anyway →'}
        </button>
      </div>
      {transitionMutation.isError && (
        <p className="text-red-400 text-center">{transitionMutation.error.message}</p>
      )}
    </div>
  );
}

function VotingView({ gameId, game, groups }: {
  gameId: string;
  game: Game;
  groups: Record<string, GroupInfo>;
}) {
  const queryClient = useQueryClient();

  const votedGroups = game.votedGroups || [];
  const sortedLetters = Object.keys(groups).sort();
  const unvotedGroups = sortedLetters.filter(l => !votedGroups.includes(l));
  const allGroupsVoted = sortedLetters.length > 0 && unvotedGroups.length === 0;
  const isVotingClosed = game.currentVotingGroup ? votedGroups.includes(game.currentVotingGroup) : false;
  const isVotingOpen = !!game.currentVotingGroup && !isVotingClosed;

  // Poll for live data during active voting (statements + vote count)
  const { data: liveState } = useQuery({
    queryKey: ['votingLive', gameId],
    queryFn: () => fetchGameState(gameId, '__gk__'),
    enabled: isVotingOpen,
    refetchInterval: 3000,
  });

  // Fetch results after voting closes for current group
  const { data: results } = useQuery({
    queryKey: ['votingResults', gameId, game.currentVotingGroup],
    queryFn: () => fetchVotingResults(gameId, game.currentVotingGroup!),
    enabled: isVotingClosed,
  });

  const openMutation = useMutation({
    mutationFn: (letter: string) => openVoting(gameId, letter),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      queryClient.invalidateQueries({ queryKey: ['votingLive', gameId] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (letter: string) => closeVoting(gameId, letter),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    },
  });

  const transitionMutation = useMutation({
    mutationFn: () => transitionGame(gameId, 'results'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['game', gameId] }),
  });

  // Active voting: show statements + vote count + close button
  if (isVotingOpen) {
    const statements = liveState?.currentVotingStatements || [];
    const voteCount = liveState?.voteCount || 0;

    return (
      <div className="w-full max-w-4xl space-y-8">
        <h2 className="text-4xl font-bold text-center text-blue-400">Group {game.currentVotingGroup}</h2>
        <p className="text-gray-400 text-center text-lg">Which statement is the lie?</p>

        <div className="space-y-4">
          {statements.map(s => (
            <div key={s.statementNumber} className="bg-gray-800 rounded-lg p-6">
              <span className="text-gray-500 text-sm">Statement {s.statementNumber}</span>
              <p className="text-xl mt-1">{s.text}</p>
            </div>
          ))}
        </div>

        <div className="text-center space-y-4">
          <p className="text-2xl font-mono">{voteCount} {voteCount === 1 ? 'vote' : 'votes'} cast</p>
          <button
            onClick={() => closeMutation.mutate(game.currentVotingGroup!)}
            disabled={closeMutation.isPending}
            className="px-8 py-3 rounded bg-red-600 hover:bg-red-700 disabled:opacity-50 font-semibold"
          >
            {closeMutation.isPending ? 'Closing...' : 'Close Voting'}
          </button>
          {closeMutation.isError && (
            <p className="text-red-400 text-sm">{closeMutation.error.message}</p>
          )}
        </div>
      </div>
    );
  }

  // Reveal: show statements with lie highlighted + vote breakdown
  if (isVotingClosed && results) {
    return (
      <div className="w-full max-w-4xl space-y-8">
        <h2 className="text-4xl font-bold text-center text-blue-400">Group {game.currentVotingGroup}</h2>
        <p className="text-gray-400 text-center text-lg">The Lie Revealed</p>

        <div className="space-y-4">
          {results.statements.map(s => {
            const key = `statement${s.statementNumber}` as keyof typeof results.breakdown;
            const votes = results.breakdown[key];
            return (
              <div key={s.statementNumber} className={`rounded-lg p-6 ${
                s.isLie ? 'bg-red-900/40 border-2 border-red-500' : 'bg-gray-800'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-gray-500 text-sm">Statement {s.statementNumber}</span>
                    {s.isLie && <span className="ml-2 text-red-400 text-sm font-bold">← THE LIE</span>}
                    <p className="text-xl mt-1">{s.text}</p>
                  </div>
                  <span className="text-gray-400 text-lg font-mono whitespace-nowrap ml-4">{votes} votes</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center space-y-2">
          <p className="text-lg">
            <span className="text-green-400 font-bold">{results.correctVotes}</span> / {results.totalVotes} correct
            {results.totalVotes > 0 && (
              <span className="text-gray-500 ml-2">
                ({Math.round(results.correctVotes / results.totalVotes * 100)}%)
              </span>
            )}
          </p>
        </div>

        <div className="flex justify-center pt-4">
          {allGroupsVoted ? (
            <button
              onClick={() => transitionMutation.mutate()}
              disabled={transitionMutation.isPending}
              className="px-8 py-3 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 font-semibold"
            >
              {transitionMutation.isPending ? 'Loading...' : 'Go to Results →'}
            </button>
          ) : (
            <button
              onClick={() => openMutation.mutate(unvotedGroups[0])}
              disabled={openMutation.isPending}
              className="px-8 py-3 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 font-semibold"
            >
              {openMutation.isPending ? 'Opening...' : `Next: Group ${unvotedGroups[0]} →`}
            </button>
          )}
          {(transitionMutation.isError || openMutation.isError) && (
            <p className="text-red-400 text-sm mt-2">
              {(transitionMutation.error || openMutation.error)?.message}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Group picker: show all groups with status, open voting for next
  return (
    <div className="w-full max-w-4xl space-y-6">
      <h2 className="text-2xl font-bold text-center">Voting Phase</h2>
      <p className="text-gray-400 text-center">{votedGroups.length}/{sortedLetters.length} groups voted</p>

      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {sortedLetters.map(letter => {
          const isVoted = votedGroups.includes(letter);
          const isNext = !isVoted && letter === unvotedGroups[0];
          return (
            <button
              key={letter}
              onClick={() => !isVoted && openMutation.mutate(letter)}
              disabled={isVoted || openMutation.isPending}
              className={`p-4 rounded-lg text-center font-bold text-xl disabled:cursor-default ${
                isVoted ? 'bg-green-900/40 text-green-400' :
                isNext ? 'bg-blue-600 hover:bg-blue-700' :
                'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              {letter}
              {isVoted && <span className="block text-sm font-normal">✓</span>}
            </button>
          );
        })}
      </div>

      {allGroupsVoted && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => transitionMutation.mutate()}
            disabled={transitionMutation.isPending}
            className="px-8 py-3 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 font-semibold"
          >
            {transitionMutation.isPending ? 'Loading...' : 'Go to Results →'}
          </button>
        </div>
      )}

      {openMutation.isError && (
        <p className="text-red-400 text-center">{openMutation.error.message}</p>
      )}
    </div>
  );
}

export function GameControlPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: auth, isLoading: authLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: fetchAuthStatus,
  });

  const { data: game, isLoading: gameLoading } = useQuery({
    queryKey: ['game', gameId],
    queryFn: () => fetchGame(gameId!),
    enabled: !!gameId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'results') return false;
      return 5000;
    },
  });

  // Poll for player list during lobby using a fake GK state query
  const { data: lobbyState } = useQuery({
    queryKey: ['gameState', gameId, 'lobby'],
    queryFn: () => fetchGameState(gameId!, '__gk__'),
    enabled: !!gameId && game?.status === 'lobby',
    refetchInterval: 3000,
  });

  // Fetch groups when in grouping or statements phase
  const { data: groups } = useQuery({
    queryKey: ['groups', gameId],
    queryFn: () => fetchGroups(gameId!),
    enabled: !!gameId && (game?.status === 'grouping' || game?.status === 'statements' || game?.status === 'voting'),
    refetchInterval: game?.status === 'statements' ? 5000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteGame(gameId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] });
      navigate('/manage');
    },
  });

  if (authLoading || gameLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!auth?.isGameKeeper) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">Not authorized as a game keeper</p>
          <a href="/manage" className="text-blue-400 hover:underline">Sign in →</a>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-red-400">Game not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <a href="/manage" className="text-blue-400 hover:underline text-sm">← Dashboard</a>
            <h1 className="text-2xl font-bold mt-1">Game {game.id}</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="px-3 py-1 rounded-full bg-gray-800 text-sm capitalize">{game.status}</span>
            {game.status === 'lobby' && (
              <button
                onClick={() => { if (confirm('Delete this game?')) deleteMutation.mutate(); }}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Phase-specific content */}
        <div className="flex justify-center">
          {game.status === 'lobby' && (
            <LobbyView
              gameId={game.id}
              playerCount={lobbyState?.players?.length ?? 0}
              players={lobbyState?.players}
            />
          )}
          {game.status === 'grouping' && groups && (
            <GroupingView gameId={game.id} groups={groups} />
          )}
          {game.status === 'statements' && groups && (
            <StatementsView gameId={game.id} groups={groups} />
          )}
          {game.status === 'voting' && groups && (
            <VotingView gameId={game.id} game={game} groups={groups} />
          )}
          {game.status === 'results' && (
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">Results</h2>
              <p className="text-gray-400">Leaderboard coming in Phase 5</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
