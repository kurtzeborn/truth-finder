import { gamesTable, statementsTable, votesTable } from './storage.js';
import { GameEntity, StatementEntity, VoteEntity } from './types.js';

const GAME_ID_PATTERN = /^[A-Z0-9]{4}$/;
const GROUP_LETTER_PATTERN = /^[A-Z]$/;

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
 * Validate and normalize a group letter from request params.
 * Returns uppercase single letter A-Z, or null if invalid.
 */
export function validateGroupLetter(raw: string | undefined): string | null {
  if (!raw) return null;
  const letter = raw.toUpperCase();
  return GROUP_LETTER_PATTERN.test(letter) ? letter : null;
}

/**
 * Parse the votedGroups JSON field from a game entity.
 */
export function parseVotedGroups(game: GameEntity): string[] {
  return JSON.parse(game.votedGroups || '[]');
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

/**
 * Get all 3 statements for a group. Returns array (may have fewer than 3 if not all entered).
 */
export async function getGroupStatements(gameId: string, groupLetter: string): Promise<StatementEntity[]> {
  const statements: StatementEntity[] = [];
  for (let n = 1; n <= 3; n++) {
    try {
      const s = await statementsTable.getEntity<StatementEntity>(gameId, `${groupLetter}_${n}`);
      statements.push(s);
    } catch (error: any) {
      if (error.statusCode !== 404) throw error;
    }
  }
  return statements;
}

/**
 * Get all votes for a specific group letter in a game.
 */
export async function getGroupVotes(gameId: string, groupLetter: string): Promise<VoteEntity[]> {
  const votes: VoteEntity[] = [];
  const entities = votesTable.listEntities<VoteEntity>({
    queryOptions: { filter: `PartitionKey eq '${gameId}'` },
  });
  for await (const v of entities) {
    if (v.groupLetter === groupLetter) votes.push(v);
  }
  return votes;
}
