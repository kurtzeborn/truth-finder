import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { gamesTable, playersTable, statementsTable, votesTable } from '../shared/storage.js';
import { requireGameKeeper, AuthError } from '../shared/auth.js';
import { GameEntity, PlayerEntity } from '../shared/types.js';
import { validateGameId, getGameEntity } from '../shared/helpers.js';

// Generate a random 4-character alphanumeric code
function generateGameCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST /api/games
app.http('createGame', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = await requireGameKeeper(request);

      // Generate unique game code with retry
      let gameCode = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        gameCode = generateGameCode();
        try {
          await gamesTable.getEntity('game', gameCode);
          // Code exists, try again
        } catch (error: any) {
          if (error.statusCode === 404) break; // Code is available
          throw error;
        }
      }

      const entity: GameEntity = {
        partitionKey: 'game',
        rowKey: gameCode,
        createdBy: user.userDetails,
        createdAt: new Date(),
        status: 'lobby',
        groupSize: 0,
        votedGroups: '[]',
      };

      await gamesTable.createEntity(entity);

      return {
        status: 201,
        jsonBody: {
          id: gameCode,
          createdBy: entity.createdBy,
          createdAt: entity.createdAt,
          status: entity.status,
          groupSize: entity.groupSize,
          votedGroups: [],
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to create game:', error);
      return { status: 500, jsonBody: { error: 'Failed to create game' } };
    }
  },
});

// GET /api/games — list all games for the current game keeper
app.http('listGames', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = await requireGameKeeper(request);

      // Get all games created by this game keeper
      const gameEntities = gamesTable.listEntities<GameEntity>({
        queryOptions: { filter: `PartitionKey eq 'game' and createdBy eq '${user.userDetails}'` },
      });

      const games: Array<{
        id: string;
        createdAt: string;
        status: string;
        groupSize: number;
        playerCount: number;
      }> = [];

      for await (const entity of gameEntities) {
        // Count players for each game
        let playerCount = 0;
        const players = playersTable.listEntities<PlayerEntity>({
          queryOptions: { filter: `PartitionKey eq '${entity.rowKey}'`, select: ['rowKey'] },
        });
        for await (const _p of players) {
          playerCount++;
        }

        games.push({
          id: entity.rowKey!,
          createdAt: entity.createdAt instanceof Date ? entity.createdAt.toISOString() : String(entity.createdAt),
          status: entity.status,
          groupSize: entity.groupSize,
          playerCount,
        });
      }

      // Sort newest first
      games.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return { status: 200, jsonBody: games };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to list games:', error);
      return { status: 500, jsonBody: { error: 'Failed to list games' } };
    }
  },
});

// GET /api/games/:id
app.http('getGame', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games/{gameId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = validateGameId(request.params.gameId);
      if (!gameId) {
        return { status: 400, jsonBody: { error: 'Invalid game ID' } };
      }

      const entity = await getGameEntity(gameId);
      if (!entity) {
        return { status: 404, jsonBody: { error: 'Game not found' } };
      }

      return {
        status: 200,
        jsonBody: {
          id: entity.rowKey,
          createdAt: entity.createdAt,
          status: entity.status,
          groupSize: entity.groupSize,
          currentVotingGroup: entity.currentVotingGroup,
          votedGroups: JSON.parse(entity.votedGroups || '[]'),
        },
      };
    } catch (error) {
      context.error('Failed to get game:', error);
      return { status: 500, jsonBody: { error: 'Failed to get game' } };
    }
  },
});

// DELETE /api/games/:id
app.http('deleteGame', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'games/{gameId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      await requireGameKeeper(request);
      const gameId = validateGameId(request.params.gameId);
      if (!gameId) {
        return { status: 400, jsonBody: { error: 'Invalid game ID' } };
      }

      // Delete game
      try {
        await gamesTable.deleteEntity('game', gameId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 404, jsonBody: { error: 'Game not found' } };
        }
        throw error;
      }

      // Clean up all related data
      const tables = [playersTable, statementsTable, votesTable];
      for (const table of tables) {
        const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${gameId}'` } });
        for await (const entity of entities) {
          await table.deleteEntity(entity.partitionKey!, entity.rowKey!);
        }
      }

      return { status: 204, body: undefined };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to delete game:', error);
      return { status: 500, jsonBody: { error: 'Failed to delete game' } };
    }
  },
});

// POST /api/games/:id/join
app.http('joinGame', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/join',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = validateGameId(request.params.gameId);
      if (!gameId) {
        return { status: 400, jsonBody: { error: 'Invalid game ID' } };
      }

      let body;
      try {
        body = await request.json() as { displayName: string };
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
      }
      const displayName = body.displayName?.trim()?.replace(/[<>]/g, '');
      if (!displayName || displayName.length > 20) {
        return { status: 400, jsonBody: { error: 'Display name must be 1-20 characters' } };
      }

      // Verify game exists and is in lobby
      const game = await getGameEntity(gameId);
      if (!game) {
        return { status: 404, jsonBody: { error: 'Game not found' } };
      }

      if (game.status === 'results') {
        return { status: 400, jsonBody: { error: 'Game is already in progress' } };
      }

      const isLateArrival = game.status !== 'lobby';

      // Generate player ID
      const playerId = crypto.randomUUID();

      await playersTable.createEntity({
        partitionKey: gameId,
        rowKey: playerId,
        displayName,
        joinedAt: new Date(),
        score: 0,
        ...(isLateArrival ? { lateArrival: true } : {}),
      });

      return {
        status: 201,
        jsonBody: { playerId },
      };
    } catch (error) {
      context.error('Failed to join game:', error);
      return { status: 500, jsonBody: { error: 'Failed to join game' } };
    }
  },
});
