import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { gamesTable, playersTable } from '../shared/storage.js';
import { requireGameKeeper, AuthError } from '../shared/auth.js';
import { GameEntity } from '../shared/types.js';

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

// GET /api/games/:id
app.http('getGame', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games/{gameId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = request.params.gameId;
      if (!gameId) {
        return { status: 400, jsonBody: { error: 'Game ID is required' } };
      }

      try {
        const entity = await gamesTable.getEntity<GameEntity>('game', gameId);
        return {
          status: 200,
          jsonBody: {
            id: entity.rowKey,
            createdBy: entity.createdBy,
            createdAt: entity.createdAt,
            status: entity.status,
            groupSize: entity.groupSize,
            currentVotingGroup: entity.currentVotingGroup,
            votedGroups: JSON.parse(entity.votedGroups || '[]'),
          },
        };
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 404, jsonBody: { error: 'Game not found' } };
        }
        throw error;
      }
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
      const gameId = request.params.gameId;
      if (!gameId) {
        return { status: 400, jsonBody: { error: 'Game ID is required' } };
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

      // Clean up players
      const players = playersTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${gameId}'` } });
      for await (const player of players) {
        await playersTable.deleteEntity(player.partitionKey!, player.rowKey!);
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
      const gameId = request.params.gameId;
      if (!gameId) {
        return { status: 400, jsonBody: { error: 'Game ID is required' } };
      }

      const body = await request.json() as { displayName: string };
      const displayName = body.displayName?.trim();
      if (!displayName || displayName.length > 20) {
        return { status: 400, jsonBody: { error: 'Display name must be 1-20 characters' } };
      }

      // Verify game exists and is in lobby
      let game: GameEntity;
      try {
        game = await gamesTable.getEntity<GameEntity>('game', gameId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 404, jsonBody: { error: 'Game not found' } };
        }
        throw error;
      }

      if (game.status !== 'lobby') {
        return { status: 400, jsonBody: { error: 'Game is already in progress' } };
      }

      // Generate player ID
      const playerId = crypto.randomUUID();

      await playersTable.createEntity({
        partitionKey: gameId,
        rowKey: playerId,
        displayName,
        joinedAt: new Date(),
        score: 0,
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
