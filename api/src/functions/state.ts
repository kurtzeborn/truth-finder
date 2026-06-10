import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { gamesTable, playersTable, statementsTable, votesTable } from '../shared/storage.js';
import { GameEntity, PlayerEntity, StatementEntity, VoteEntity } from '../shared/types.js';

// GET /api/games/:id/state?playerId=X
app.http('getGameState', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/state',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = request.params.gameId;
      const playerId = request.query.get('playerId');

      if (!gameId || !playerId) {
        return { status: 400, jsonBody: { error: 'gameId and playerId are required' } };
      }

      // Get game
      let game: GameEntity;
      try {
        game = await gamesTable.getEntity<GameEntity>('game', gameId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 404, jsonBody: { error: 'Game not found' } };
        }
        throw error;
      }

      // Get requesting player
      let player: PlayerEntity;
      try {
        player = await playersTable.getEntity<PlayerEntity>(gameId, playerId);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 404, jsonBody: { error: 'Player not found' } };
        }
        throw error;
      }

      const gameData = {
        id: game.rowKey,
        status: game.status,
        groupSize: game.groupSize,
        currentVotingGroup: game.currentVotingGroup,
        votedGroups: JSON.parse(game.votedGroups || '[]'),
      };

      const playerData = {
        id: player.rowKey,
        displayName: player.displayName,
        groupLetter: player.groupLetter,
        score: player.score,
      };

      const result: Record<string, unknown> = { game: gameData, player: playerData };

      // Phase-specific data
      switch (game.status) {
        case 'lobby': {
          const allPlayers: Array<{ id: string; displayName: string }> = [];
          const entities = playersTable.listEntities<PlayerEntity>({
            queryOptions: { filter: `PartitionKey eq '${gameId}'` },
          });
          for await (const p of entities) {
            allPlayers.push({ id: p.rowKey, displayName: p.displayName });
          }
          result.players = allPlayers;
          break;
        }

        case 'grouping':
        case 'statements': {
          // Get group members
          if (player.groupLetter) {
            const members: Array<{ id: string; displayName: string }> = [];
            const entities = playersTable.listEntities<PlayerEntity>({
              queryOptions: { filter: `PartitionKey eq '${gameId}'` },
            });
            for await (const p of entities) {
              if (p.groupLetter === player.groupLetter) {
                members.push({ id: p.rowKey, displayName: p.displayName });
              }
            }
            result.groupMembers = members;
          }

          // Get statements for own group during statements phase
          if (game.status === 'statements' && player.groupLetter) {
            const statements: Array<{ statementNumber: number; text: string; isLie: boolean }> = [];
            for (let n = 1; n <= 3; n++) {
              try {
                const s = await statementsTable.getEntity<StatementEntity>(gameId, `${player.groupLetter}_${n}`);
                statements.push({ statementNumber: s.statementNumber, text: s.text, isLie: s.isLie });
              } catch (error: any) {
                if (error.statusCode !== 404) throw error;
              }
            }
            result.statements = statements;
          }
          break;
        }

        case 'voting': {
          if (game.currentVotingGroup) {
            // Get statements for the group being voted on (without isLie)
            const votingStatements: Array<{ statementNumber: number; text: string }> = [];
            for (let n = 1; n <= 3; n++) {
              try {
                const s = await statementsTable.getEntity<StatementEntity>(gameId, `${game.currentVotingGroup}_${n}`);
                votingStatements.push({ statementNumber: s.statementNumber, text: s.text });
              } catch (error: any) {
                if (error.statusCode !== 404) throw error;
              }
            }
            result.currentVotingStatements = votingStatements;

            // Check if player has already voted on this group
            try {
              await votesTable.getEntity(gameId, `${playerId}_${game.currentVotingGroup}`);
              result.hasVoted = true;
            } catch (error: any) {
              if (error.statusCode === 404) result.hasVoted = false;
              else throw error;
            }

            // Count total votes for this group
            let voteCount = 0;
            const votes = votesTable.listEntities<VoteEntity>({
              queryOptions: { filter: `PartitionKey eq '${gameId}'` },
            });
            for await (const v of votes) {
              if (v.groupLetter === game.currentVotingGroup) voteCount++;
            }
            result.voteCount = voteCount;
          }
          break;
        }

        case 'results': {
          const scores: Array<{ id: string; displayName: string; score: number }> = [];
          const entities = playersTable.listEntities<PlayerEntity>({
            queryOptions: { filter: `PartitionKey eq '${gameId}'` },
          });
          for await (const p of entities) {
            scores.push({ id: p.rowKey, displayName: p.displayName, score: p.score });
          }
          scores.sort((a, b) => a.score - b.score); // ascending for bottom-up reveal
          result.scores = scores;
          break;
        }
      }

      return { status: 200, jsonBody: result };
    } catch (error) {
      context.error('Failed to get game state:', error);
      return { status: 500, jsonBody: { error: 'Failed to get game state' } };
    }
  },
});
