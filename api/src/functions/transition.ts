import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { gamesTable } from '../shared/storage.js';
import { requireGameKeeper, AuthError } from '../shared/auth.js';
import { validateGameId, getGameEntity } from '../shared/helpers.js';

const validTransitions: Record<string, string> = {
  'grouping': 'statements',
  'statements': 'voting',
  'voting': 'results',
};

// POST /api/games/:id/transition
app.http('transitionGame', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/transition',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      await requireGameKeeper(request);
      const gameId = validateGameId(request.params.gameId);
      if (!gameId) {
        return { status: 400, jsonBody: { error: 'Invalid game ID' } };
      }

      let body;
      try {
        body = await request.json() as { targetStatus: string };
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
      }

      const { targetStatus } = body;
      if (!targetStatus) {
        return { status: 400, jsonBody: { error: 'targetStatus is required' } };
      }

      // Get current game
      const game = await getGameEntity(gameId);
      if (!game) {
        return { status: 404, jsonBody: { error: 'Game not found' } };
      }

      // Validate transition
      // lobby → grouping is handled by assign-groups endpoint
      const allowedNext = validTransitions[game.status];
      if (!allowedNext || allowedNext !== targetStatus) {
        return {
          status: 400,
          jsonBody: {
            error: `Cannot transition from '${game.status}' to '${targetStatus}'`,
          },
        };
      }

      // Update game status
      await gamesTable.updateEntity({
        partitionKey: 'game',
        rowKey: gameId,
        status: targetStatus,
      }, 'Merge');

      return {
        status: 200,
        jsonBody: {
          id: gameId,
          status: targetStatus,
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to transition game:', error);
      return { status: 500, jsonBody: { error: 'Failed to transition game' } };
    }
  },
});
