import type { AuthStatus, Game, GameKeeper, GameState } from '../types';

const API_BASE = '/api';

// Get auth header for local development (mock auth)
function getAuthHeader(): Record<string, string> {
  const mockPrincipal = localStorage.getItem('mockAuthPrincipal');
  if (mockPrincipal) {
    return { 'x-ms-client-principal': btoa(mockPrincipal) };
  }
  return {};
}

export class ApiError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const authHeaders = getAuthHeader();
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(error.error || 'Request failed', response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ============ Auth ============

export async function fetchAuthStatus(): Promise<AuthStatus> {
  return apiFetch<AuthStatus>('/me');
}

// ============ Games ============

export async function createGame(): Promise<Game> {
  return apiFetch<Game>('/games', { method: 'POST' });
}

export async function deleteGame(gameId: string): Promise<void> {
  return apiFetch<void>(`/games/${gameId}`, { method: 'DELETE' });
}

export async function fetchGame(gameId: string): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}`);
}

export interface GroupInfo {
  players: Array<{ id: string; displayName: string }>;
  statementCount: number;
  hasLie: boolean;
}

export async function fetchGroups(gameId: string): Promise<Record<string, GroupInfo>> {
  return apiFetch<Record<string, GroupInfo>>(`/games/${gameId}/groups`);
}

export async function assignGroups(gameId: string, groupSize: number): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}/assign-groups`, {
    method: 'POST',
    body: JSON.stringify({ groupSize }),
  });
}

export async function transitionGame(gameId: string, targetStatus: string): Promise<Game> {
  return apiFetch<Game>(`/games/${gameId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ targetStatus }),
  });
}

// ============ Players ============

export async function joinGame(gameId: string, displayName: string): Promise<{ playerId: string }> {
  return apiFetch<{ playerId: string }>(`/games/${gameId}/join`, {
    method: 'POST',
    body: JSON.stringify({ displayName }),
  });
}

// ============ Game State (Polling) ============

export async function fetchGameState(gameId: string, playerId: string): Promise<GameState> {
  return apiFetch<GameState>(`/games/${gameId}/state?playerId=${encodeURIComponent(playerId)}`);
}

// ============ Statements ============

export async function updateStatement(
  gameId: string,
  groupLetter: string,
  statementNumber: number,
  text: string,
  isLie: boolean,
  playerId: string,
): Promise<void> {
  return apiFetch<void>(`/games/${gameId}/groups/${groupLetter}/statements/${statementNumber}`, {
    method: 'PUT',
    body: JSON.stringify({ text, isLie, playerId }),
  });
}

// ============ Voting ============

export async function openVoting(gameId: string, letter: string): Promise<void> {
  return apiFetch<void>(`/games/${gameId}/voting/open/${letter}`, { method: 'POST' });
}

export interface VotingCloseResult {
  lieStatementNumber: number | null;
  totalVotes: number;
  correctVotes: number;
  breakdown: { statement1: number; statement2: number; statement3: number };
  votedGroups: string[];
}

export async function closeVoting(gameId: string, letter: string): Promise<VotingCloseResult> {
  return apiFetch<VotingCloseResult>(`/games/${gameId}/voting/close/${letter}`, { method: 'POST' });
}

export interface VotingResults {
  statements: Array<{ statementNumber: number; text: string; isLie: boolean }>;
  totalVotes: number;
  correctVotes: number;
  breakdown: { statement1: number; statement2: number; statement3: number };
}

export async function fetchVotingResults(gameId: string, letter: string): Promise<VotingResults> {
  return apiFetch<VotingResults>(`/games/${gameId}/voting/results/${letter}`);
}

export async function castVote(gameId: string, playerId: string, groupLetter: string, chosenStatement: number): Promise<void> {
  return apiFetch<void>(`/games/${gameId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ playerId, groupLetter, chosenStatement }),
  });
}

// ============ Game Keepers ============

export async function fetchGameKeepers(): Promise<GameKeeper[]> {
  return apiFetch<GameKeeper[]>('/gamekeepers');
}

export async function inviteGameKeeper(email: string): Promise<GameKeeper> {
  return apiFetch<GameKeeper>('/gamekeepers', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function removeGameKeeper(email: string): Promise<void> {
  return apiFetch<void>(`/gamekeepers/${encodeURIComponent(email)}`, { method: 'DELETE' });
}
