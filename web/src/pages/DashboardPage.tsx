import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchAuthStatus, createGame, deleteGame } from '../api';
import type { Game } from '../types';

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: auth, isLoading: authLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: fetchAuthStatus,
  });

  const createMutation = useMutation({
    mutationFn: createGame,
    onSuccess: (game: Game) => {
      navigate(`/manage/game/${game.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGame,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
  });

  if (authLoading) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>;
  }

  if (!auth?.isGameKeeper) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          {auth?.isAuthenticated ? (
            <>
              <p className="mb-2">Signed in as {auth.user?.userDetails}</p>
              <p className="text-red-400 mb-4">You are not authorized as a game keeper.</p>
              <a href="/.auth/logout" className="text-blue-400 hover:underline">Sign out</a>
            </>
          ) : (
            <>
              <p className="mb-4">Sign in to manage games</p>
              <a href="/.auth/login/aad" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">Sign In</a>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Game Keeper</h1>
          <div className="space-x-4 text-sm">
            <a href="/manage/keepers" className="text-blue-400 hover:underline">Manage Keepers</a>
            <a href="/.auth/logout" className="text-gray-400 hover:underline">Sign Out</a>
          </div>
        </div>

        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="w-full p-4 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 font-semibold text-lg mb-8"
        >
          {createMutation.isPending ? 'Creating...' : '+ Create New Game'}
        </button>

        {createMutation.isError && (
          <p className="text-red-400 mb-4">{createMutation.error.message}</p>
        )}

        {deleteMutation.isError && (
          <p className="text-red-400 mb-4">{deleteMutation.error.message}</p>
        )}

        <p className="text-gray-500 text-center">Game history coming soon</p>
      </div>
    </div>
  );
}
