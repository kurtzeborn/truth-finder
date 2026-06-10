import { gamesTable } from './storage.js';
import { GameEntity } from './types.js';

const GAME_ID_PATTERN = /^[A-Z0-9]{4}$/;

/**
 * Validate and normalize a game ID from request params.
 * Returns uppercase 4-char alphanumeric string, or null if invalid.
 */
export function validateGameId(raw: string | undefined): string | null {
  if (!raw) return null;
  const id = raw.toUpperCase();
  return GAME_ID_PATTERN.test(id) ? id : null;
}

/**
 * Look up a game entity by ID. Returns null if not found.
 */
export async function getGameEntity(gameId: string): Promise<GameEntity | null> {
  try {
    return await gamesTable.getEntity<GameEntity>('game', gameId);
  } catch (error: any) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}
