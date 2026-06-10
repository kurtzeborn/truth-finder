import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchAuthStatus, fetchGameKeepers, inviteGameKeeper, removeGameKeeper } from '../api';

export function GameKeepersPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');

  const { data: auth } = useQuery({
    queryKey: ['auth'],
    queryFn: fetchAuthStatus,
  });

  const { data: keepers, isLoading } = useQuery({
    queryKey: ['gamekeepers'],
    queryFn: fetchGameKeepers,
    enabled: auth?.isGameKeeper,
  });

  const inviteMutation = useMutation({
    mutationFn: (email: string) => inviteGameKeeper(email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamekeepers'] });
      setEmail('');
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeGameKeeper,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamekeepers'] });
    },
  });

  if (!auth?.isGameKeeper) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-red-400">Not authorized</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Game Keepers</h1>
          <a href="/manage" className="text-blue-400 hover:underline text-sm">← Dashboard</a>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) inviteMutation.mutate(email.trim()); }}
          className="flex gap-2 mb-8">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="flex-1 p-2 rounded bg-gray-800 border border-gray-700"
          />
          <button type="submit" disabled={inviteMutation.isPending}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            Invite
          </button>
        </form>

        {inviteMutation.isError && <p className="text-red-400 mb-4">{inviteMutation.error.message}</p>}

        {isLoading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <ul className="space-y-2">
            {keepers?.map(k => (
              <li key={k.email} className="flex justify-between items-center p-3 rounded bg-gray-800">
                <div>
                  <span className="font-medium">{k.displayName}</span>
                  <span className="text-gray-400 ml-2 text-sm">{k.email}</span>
                </div>
                {k.email !== auth.user?.userDetails && (
                  <button onClick={() => removeMutation.mutate(k.email)}
                    className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
