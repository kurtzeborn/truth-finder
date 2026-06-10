import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { playersTable, statementsTable } from '../shared/storage.js';
import { PlayerEntity, StatementEntity } from '../shared/types.js';
import { validateGameId, getGameEntity } from '../shared/helpers.js';

// PUT /api/games/:id/groups/:letter/statements/:n
app.http('updateStatement', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/groups/{groupLetter}/statements/{statementNumber}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = validateGameId(request.params.gameId);
      const groupLetter = request.params.groupLetter?.toUpperCase();
      const statementNumber = parseInt(request.params.statementNumber || '');

      if (!gameId || !groupLetter) {
        return { status: 400, jsonBody: { error: 'Invalid game ID or group letter' } };
      }

      if (![1, 2, 3].includes(statementNumber)) {
        return { status: 400, jsonBody: { error: 'Statement number must be 1, 2, or 3' } };
      }

      let body;
      try {
        body = await request.json() as { text: string; isLie: boolean; playerId: string };
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
      }

      const { text, isLie, playerId } = body;
      if (!playerId) {
        return { status: 400, jsonBody: { error: 'playerId is required' } };
      }
      if (!text || typeof text !== 'string') {
        return { status: 400, jsonBody: { error: 'Statement text is required' } };
      }
      const trimmed = text.trim();
      if (trimmed.length < 1 || trimmed.length > 200) {
        return { status: 400, jsonBody: { error: 'Statement text must be 1-200 characters' } };
      }

      // Verify game exists and is in statements phase
      const game = await getGameEntity(gameId);
      if (!game) {
        return { status: 404, jsonBody: { error: 'Game not found' } };
      }

      if (game.status !== 'statements') {
        return { status: 400, jsonBody: { error: 'Statements can only be edited during the statements phase' } };
      }

      // Verify player exists and is in the correct group
      let player: PlayerEntity;
      try {
        player = await playersTable.getEntity<PlayerEntity>(gameId, playerId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 404, jsonBody: { error: 'Player not found' } };
        }
        throw error;
      }

      if (player.groupLetter !== groupLetter) {
        return { status: 403, jsonBody: { error: 'You can only edit statements for your own group' } };
      }

      // If marking this statement as the lie, clear isLie on other statements in this group
      if (isLie) {
        for (let n = 1; n <= 3; n++) {
          if (n === statementNumber) continue;
          try {
            const other = await statementsTable.getEntity<StatementEntity>(gameId, `${groupLetter}_${n}`);
            if (other.isLie) {
              await statementsTable.updateEntity({
                partitionKey: gameId,
                rowKey: `${groupLetter}_${n}`,
                isLie: false,
              }, 'Merge');
            }
          } catch (error: any) {
            if (error.statusCode !== 404) throw error;
          }
        }
      }

      // Upsert the statement (last-writer-wins)
      const entity: StatementEntity = {
        partitionKey: gameId,
        rowKey: `${groupLetter}_${statementNumber}`,
        groupLetter,
        statementNumber,
        text: trimmed,
        isLie: !!isLie,
        enteredBy: playerId,
        updatedAt: new Date(),
      };

      await statementsTable.upsertEntity(entity, 'Replace');

      return {
        status: 200,
        jsonBody: {
          statementNumber,
          text: trimmed,
          isLie: !!isLie,
        },
      };
    } catch (error) {
      context.error('Failed to update statement:', error);
      return { status: 500, jsonBody: { error: 'Failed to update statement' } };
    }
  },
});
