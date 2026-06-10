import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchGameState, updateStatement, castVote } from '../api';
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

function StatementsSection({ state, session }: { state: GameState; session: PlayerSession }) {
  const queryClient = useQueryClient();
  const groupLetter = state.player?.groupLetter || '';
  const existingStatements = state.statements || [];

  // Derive server state as a stable key for detecting changes
  const serverKey = JSON.stringify(existingStatements);

  // Track local edits; reset when server data changes
  const [texts, setTexts] = useState<[string, string, string]>(['', '', '']);
  const [lieIndex, setLieIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [lastServerKey, setLastServerKey] = useState('');

  // Sync from server when data changes (without useEffect + setState)
  if (serverKey !== lastServerKey) {
    setLastServerKey(serverKey);
    if (existingStatements.length > 0) {
      const newTexts: [string, string, string] = ['', '', ''];
      let newLie: number | null = null;
      for (const s of existingStatements) {
        newTexts[s.statementNumber - 1] = s.text;
        if (s.isLie) newLie = s.statementNumber - 1;
      }
      setTexts(newTexts);
      setLieIndex(newLie);
    }
  }

  const saveMutation = useMutation({
    mutationFn: async ({ index, text, isLie }: { index: number; text: string; isLie: boolean }) => {
      setSaving(index);
      return updateStatement(
        session.gameId,
        groupLetter,
        index + 1,
        text,
        isLie,
        session.playerId,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameState'] });
      setError('');
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to save');
    },
    onSettled: () => {
      setSaving(null);
    },
  });

  const handleSave = (index: number) => {
    const text = texts[index].trim();
    if (!text) return;
    saveMutation.mutate({ index, text, isLie: lieIndex === index });
  };

  const handleLieChange = (index: number) => {
    setLieIndex(index);
    // Auto-save if the statement has text
    const text = texts[index].trim();
    if (text) {
      saveMutation.mutate({ index, text, isLie: true });
    }
  };

  const statementsEntered = texts.filter(t => t.trim()).length;

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-1">Group {groupLetter}</h2>
        <p className="text-gray-400 text-sm">Enter 2 truths and 1 lie</p>
      </div>

      {state.groupMembers && (
        <p className="text-gray-500 text-xs text-center">
          Members: {state.groupMembers.map(m => m.displayName).join(', ')}
        </p>
      )}

      {[0, 1, 2].map(i => (
        <div key={i} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm w-24">Statement {i + 1}</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="lie"
                checked={lieIndex === i}
                onChange={() => handleLieChange(i)}
                className="accent-red-500"
              />
              <span className={`text-xs ${lieIndex === i ? 'text-red-400' : 'text-gray-500'}`}>
                The lie
              </span>
            </label>
          </div>
          <div className="flex gap-2">
            <textarea
              value={texts[i]}
              onChange={(e) => {
                const newTexts = [...texts] as [string, string, string];
                newTexts[i] = e.target.value;
                setTexts(newTexts);
              }}
              onBlur={() => handleSave(i)}
              placeholder={`Statement ${i + 1}...`}
              maxLength={200}
              rows={2}
              className="flex-1 p-2 rounded bg-gray-800 border border-gray-700 text-sm resize-none"
            />
            {saving === i && (
              <span className="text-blue-400 text-xs self-center">Saving...</span>
            )}
          </div>
        </div>
      ))}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <div className="text-center">
        <p className={`text-sm ${statementsEntered === 3 && lieIndex !== null ? 'text-green-400' : 'text-gray-500'}`}>
          {statementsEntered}/3 statements {lieIndex !== null ? '• lie marked ✓' : '• no lie marked'}
        </p>
      </div>
    </div>
  );
}

function VotingSection({ state, session }: { state: GameState; session: PlayerSession }) {
  const queryClient = useQueryClient();
  const [selectedStatement, setSelectedStatement] = useState<number | null>(null);
  const [lastGroup, setLastGroup] = useState<string | undefined>(undefined);

  // Reset selection when the voting group changes
  if (state.game.currentVotingGroup !== lastGroup) {
    setLastGroup(state.game.currentVotingGroup);
    setSelectedStatement(null);
  }

  const isOwnGroup = state.game.currentVotingGroup === state.player?.groupLetter;
  const hasVoted = state.hasVoted;
  const votingClosed = state.votingClosed;
  const statements = state.currentVotingStatements || [];
  const result = state.playerVoteResult;

  const voteMutation = useMutation({
    mutationFn: (chosenStatement: number) =>
      castVote(session.gameId, session.playerId, state.game.currentVotingGroup!, chosenStatement),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameState'] });
    },
  });

  // No group being voted on yet
  if (!state.game.currentVotingGroup) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Voting Phase</h2>
        <p className="text-gray-400">Waiting for the host to open voting...</p>
      </div>
    );
  }

  // Own group is being presented
  if (isOwnGroup) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Group {state.game.currentVotingGroup}</h2>
        <p className="text-yellow-400 text-xl">Your group is being presented!</p>
        <p className="text-gray-400 mt-2">Watch the screen — you can't vote on your own group.</p>
      </div>
    );
  }

  // Reveal: voting closed for this group
  if (votingClosed && result) {
    const lieStatement = statements.find(s => s.isLie);
    return (
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">Group {state.game.currentVotingGroup}</h2>
        <div className="space-y-3">
          {statements.map(s => (
            <div key={s.statementNumber} className={`rounded-lg p-4 ${
              s.isLie ? 'bg-red-900/40 border-2 border-red-500' : 'bg-gray-800'
            }`}>
              <p className={s.isLie ? 'text-red-300' : ''}>{s.text}</p>
              {s.isLie && <span className="text-red-400 text-sm font-bold">← THE LIE</span>}
            </div>
          ))}
        </div>
        <div className={`rounded-lg p-4 ${result.isCorrect ? 'bg-green-900/40' : 'bg-gray-800'}`}>
          <p className="text-lg font-bold">
            {result.isCorrect ? '✓ Correct!' : '✗ Wrong!'}
          </p>
          <p className="text-gray-400 text-sm">
            You picked statement {result.chosenStatement}
            {lieStatement ? ` — the lie was statement ${lieStatement.statementNumber}` : ''}
          </p>
          {result.pointsAwarded > 0 && (
            <p className="text-green-400 font-bold mt-1">+{result.pointsAwarded} points</p>
          )}
        </div>
      </div>
    );
  }

  // Reveal: voting closed but player didn't vote (own group or didn't vote in time)
  if (votingClosed) {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">Group {state.game.currentVotingGroup}</h2>
        <div className="space-y-3">
          {statements.map(s => (
            <div key={s.statementNumber} className={`rounded-lg p-4 ${
              s.isLie ? 'bg-red-900/40 border-2 border-red-500' : 'bg-gray-800'
            }`}>
              <p className={s.isLie ? 'text-red-300' : ''}>{s.text}</p>
              {s.isLie && <span className="text-red-400 text-sm font-bold">← THE LIE</span>}
            </div>
          ))}
        </div>
        <p className="text-gray-500">Waiting for the next group...</p>
      </div>
    );
  }

  // Already voted, waiting for close
  if (hasVoted) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Group {state.game.currentVotingGroup}</h2>
        <p className="text-green-400 text-lg">Vote submitted!</p>
        <p className="text-gray-400 mt-2">Waiting for voting to close...</p>
      </div>
    );
  }

  // Vote buttons
  return (
    <div className="text-center space-y-4">
      <h2 className="text-2xl font-bold">Group {state.game.currentVotingGroup}</h2>
      <p className="text-gray-400">Which one is the lie?</p>

      <div className="space-y-3">
        {statements.map(s => (
          <button
            key={s.statementNumber}
            onClick={() => setSelectedStatement(s.statementNumber)}
            disabled={voteMutation.isPending}
            className={`w-full text-left rounded-lg p-4 transition-colors ${
              selectedStatement === s.statementNumber
                ? 'bg-blue-700 border-2 border-blue-400'
                : 'bg-gray-800 hover:bg-gray-700 border-2 border-transparent'
            }`}
          >
            <p>{s.text}</p>
          </button>
        ))}
      </div>

      {selectedStatement !== null && (
        <button
          onClick={() => voteMutation.mutate(selectedStatement)}
          disabled={voteMutation.isPending}
          className="px-8 py-3 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 font-semibold"
        >
          {voteMutation.isPending ? 'Submitting...' : 'Lock In Vote'}
        </button>
      )}

      {voteMutation.isError && (
        <p className="text-red-400 text-sm">{voteMutation.error.message}</p>
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
    try {
      const stored = localStorage.getItem('playerSession');
      if (stored) return JSON.parse(stored);
    } catch {
      localStorage.removeItem('playerSession');
    }
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
            case 'statements': return <StatementsSection state={state} session={session} />;
            case 'voting': return <VotingSection state={state} session={session} />;
            case 'results': return <ResultsSection state={state} />;
          }
        })()
      )}
    </div>
  );
}
