import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { playersTable, votesTable } from '../shared/storage.js';
import { PlayerEntity, VoteEntity } from '../shared/types.js';
import { validateGameId, getGameEntity, parseVotedGroups, getGroupStatements, getGroupVotes } from '../shared/helpers.js';

// GET /api/games/:id/state?playerId=X
app.http('getGameState', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/state',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = validateGameId(request.params.gameId);
      const playerId = request.query.get('playerId');

      if (!gameId || !playerId) {
        return { status: 400, jsonBody: { error: 'gameId and playerId are required' } };
      }

      // Get game
      const game = await getGameEntity(gameId);
      if (!game) {
        return { status: 404, jsonBody: { error: 'Game not found' } };
      }

      // Get requesting player (skip lookup for GK polling with __gk__)
      let player: PlayerEntity | null = null;
      if (playerId !== '__gk__') {
        try {
          player = await playersTable.getEntity<PlayerEntity>(gameId, playerId);
        } catch (error: any) {
          if (error.statusCode === 404) {
            if (game.status !== 'lobby') {
              return { status: 404, jsonBody: { error: 'Player not found' } };
            }
          } else {
            throw error;
          }
        }
      }

      const votedGroups = parseVotedGroups(game);

      const gameData = {
        id: game.rowKey,
        status: game.status,
        groupSize: game.groupSize,
        currentVotingGroup: game.currentVotingGroup,
        votedGroups,
      };

      const playerData = player ? {
        id: player.rowKey,
        displayName: player.displayName,
        groupLetter: player.groupLetter,
        score: player.score,
      } : undefined;

      const result: Record<string, unknown> = { game: gameData, player: playerData || null };

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
          if (player?.groupLetter) {
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
          if (game.status === 'statements' && player?.groupLetter) {
            const groupStatements = await getGroupStatements(gameId, player.groupLetter);
            result.statements = groupStatements.map(s => ({
              statementNumber: s.statementNumber, text: s.text, isLie: s.isLie,
            }));
          }
          break;
        }

        case 'voting': {
          if (game.currentVotingGroup) {
            const isVotingClosed = votedGroups.includes(game.currentVotingGroup);
            result.votingClosed = isVotingClosed;

            // Get statements (include isLie only after voting closes)
            const groupStatements = await getGroupStatements(gameId, game.currentVotingGroup);
            result.currentVotingStatements = groupStatements.map(s => {
              const stmt: { statementNumber: number; text: string; isLie?: boolean } = {
                statementNumber: s.statementNumber, text: s.text,
              };
              if (isVotingClosed) stmt.isLie = s.isLie;
              return stmt;
            });

            // Check if player has voted (only for non-GK, non-presenting players)
            if (player && player.groupLetter !== game.currentVotingGroup) {
              try {
                const vote = await votesTable.getEntity<VoteEntity>(gameId, `${playerId}_${game.currentVotingGroup}`);
                result.hasVoted = true;
                if (isVotingClosed) {
                  result.playerVoteResult = {
                    chosenStatement: vote.chosenStatement,
                    isCorrect: !!vote.isCorrect,
                    pointsAwarded: vote.pointsAwarded || 0,
                  };
                }
              } catch (error: any) {
                if (error.statusCode === 404) result.hasVoted = false;
                else throw error;
              }
            }

            // Count total votes for this group
            const groupVotes = await getGroupVotes(gameId, game.currentVotingGroup);
            result.voteCount = groupVotes.length;
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
