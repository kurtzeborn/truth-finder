import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { gamesTable, playersTable, statementsTable } from '../shared/storage.js';
import { requireGameKeeper, AuthError } from '../shared/auth.js';
import { GameEntity, PlayerEntity, StatementEntity } from '../shared/types.js';
import { shuffle, assignToGroups, MAX_GROUPS } from '../shared/groups.js';
import { validateGameId, getGameEntity } from '../shared/helpers.js';

// POST /api/games/:id/assign-groups
app.http('assignGroups', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/assign-groups',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      await requireGameKeeper(request);
      const gameId = validateGameId(request.params.gameId);
      if (!gameId) {
        return { status: 400, jsonBody: { error: 'Invalid game ID' } };
      }

      let body;
      try {
        body = await request.json() as { groupSize: number };
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
      }

      const groupSize = body.groupSize;
      if (!groupSize || !Number.isInteger(groupSize) || groupSize < 2 || groupSize > 20) {
        return { status: 400, jsonBody: { error: 'Group size must be an integer between 2 and 20' } };
      }

      // Get game
      const game = await getGameEntity(gameId);
      if (!game) {
        return { status: 404, jsonBody: { error: 'Game not found' } };
      }

      if (game.status !== 'lobby') {
        return { status: 400, jsonBody: { error: 'Groups can only be assigned during the lobby phase' } };
      }

      // Get all players
      const players: PlayerEntity[] = [];
      const entities = playersTable.listEntities<PlayerEntity>({
        queryOptions: { filter: `PartitionKey eq '${gameId}'` },
      });
      for await (const p of entities) {
        players.push(p);
      }

      if (players.length < 2) {
        return { status: 400, jsonBody: { error: 'At least 2 players are required to assign groups' } };
      }

      // Shuffle and assign to groups
      const shuffled = shuffle([...players]);
      const numGroups = Math.ceil(shuffled.length / groupSize);

      if (numGroups > MAX_GROUPS) {
        return { status: 400, jsonBody: { error: 'Too many groups. Increase group size.' } };
      }

      const groupMap = assignToGroups(shuffled, groupSize);
      for (const [letter, members] of groupMap) {
        for (const member of members) {
          member.groupLetter = letter;
        }
      }

      // Update all players with group assignments
      for (const player of shuffled) {
        await playersTable.updateEntity({
          partitionKey: gameId,
          rowKey: player.rowKey,
          groupLetter: player.groupLetter,
        }, 'Merge');
      }

      // Update game status and group size
      await gamesTable.updateEntity({
        partitionKey: 'game',
        rowKey: gameId,
        status: 'grouping',
        groupSize,
      }, 'Merge');

      // Build group roster for response
      const groups: Record<string, string[]> = {};
      for (const player of shuffled) {
        const letter = player.groupLetter!;
        if (!groups[letter]) groups[letter] = [];
        groups[letter].push(player.displayName);
      }

      return {
        status: 200,
        jsonBody: {
          id: gameId,
          status: 'grouping',
          groupSize,
          groups,
          playerCount: shuffled.length,
          groupCount: numGroups,
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to assign groups:', error);
      return { status: 500, jsonBody: { error: 'Failed to assign groups' } };
    }
  },
});

// GET /api/games/:id/groups
app.http('getGroups', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/groups',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      await requireGameKeeper(request);
      const gameId = validateGameId(request.params.gameId);
      if (!gameId) {
        return { status: 400, jsonBody: { error: 'Invalid game ID' } };
      }

      // Verify game exists
      const game = await getGameEntity(gameId);
      if (!game) {
        return { status: 404, jsonBody: { error: 'Game not found' } };
      }

      // Get all players and organize by group
      const groups: Record<string, Array<{ id: string; displayName: string }>> = {};
      const entities = playersTable.listEntities<PlayerEntity>({
        queryOptions: { filter: `PartitionKey eq '${gameId}'` },
      });
      for await (const p of entities) {
        const letter = p.groupLetter || 'Unassigned';
        if (!groups[letter]) groups[letter] = [];
        groups[letter].push({ id: p.rowKey, displayName: p.displayName });
      }

      // Count statements per group
      const statementCounts: Record<string, number> = {};
      const hasLie: Record<string, boolean> = {};
      const stmtEntities = statementsTable.listEntities<StatementEntity>({
        queryOptions: { filter: `PartitionKey eq '${gameId}'` },
      });
      for await (const s of stmtEntities) {
        statementCounts[s.groupLetter] = (statementCounts[s.groupLetter] || 0) + 1;
        if (s.isLie) hasLie[s.groupLetter] = true;
      }

      // Build response with statement progress
      const result: Record<string, {
        players: Array<{ id: string; displayName: string }>;
        statementCount: number;
        hasLie: boolean;
      }> = {};
      for (const [letter, players] of Object.entries(groups)) {
        result[letter] = {
          players,
          statementCount: statementCounts[letter] || 0,
          hasLie: hasLie[letter] || false,
        };
      }

      return { status: 200, jsonBody: result };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to get groups:', error);
      return { status: 500, jsonBody: { error: 'Failed to get groups' } };
    }
  },
});
