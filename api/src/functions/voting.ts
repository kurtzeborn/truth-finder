import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { gamesTable, playersTable, votesTable } from '../shared/storage.js';
import { requireGameKeeper, AuthError } from '../shared/auth.js';
import { PlayerEntity, VoteEntity } from '../shared/types.js';
import { validateGameId, validateGroupLetter, getGameEntity, parseVotedGroups, getGroupStatements, getGroupVotes } from '../shared/helpers.js';

// POST /api/games/:id/voting/open/:letter
app.http('openVoting', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/voting/open/{letter}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      await requireGameKeeper(request);
      const gameId = validateGameId(request.params.gameId);
      const letter = validateGroupLetter(request.params.letter);

      if (!gameId) return { status: 400, jsonBody: { error: 'Invalid game ID' } };
      if (!letter) return { status: 400, jsonBody: { error: 'Invalid group letter' } };

      const game = await getGameEntity(gameId);
      if (!game) return { status: 404, jsonBody: { error: 'Game not found' } };
      if (game.status !== 'voting') {
        return { status: 400, jsonBody: { error: 'Game is not in voting phase' } };
      }

      const votedGroups = parseVotedGroups(game);
      if (votedGroups.includes(letter)) {
        return { status: 400, jsonBody: { error: `Group ${letter} has already been voted on` } };
      }

      // Can't open a new group while voting is still open for another
      if (game.currentVotingGroup && !votedGroups.includes(game.currentVotingGroup)) {
        return { status: 400, jsonBody: { error: 'Close voting for the current group first' } };
      }

      await gamesTable.updateEntity({
        partitionKey: 'game',
        rowKey: gameId,
        currentVotingGroup: letter,
      }, 'Merge');

      return {
        status: 200,
        jsonBody: { currentVotingGroup: letter, votedGroups },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to open voting:', error);
      return { status: 500, jsonBody: { error: 'Failed to open voting' } };
    }
  },
});

// POST /api/games/:id/voting/close/:letter
app.http('closeVoting', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/voting/close/{letter}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      await requireGameKeeper(request);
      const gameId = validateGameId(request.params.gameId);
      const letter = validateGroupLetter(request.params.letter);

      if (!gameId) return { status: 400, jsonBody: { error: 'Invalid game ID' } };
      if (!letter) return { status: 400, jsonBody: { error: 'Invalid group letter' } };

      const game = await getGameEntity(gameId);
      if (!game) return { status: 404, jsonBody: { error: 'Game not found' } };
      if (game.status !== 'voting') {
        return { status: 400, jsonBody: { error: 'Game is not in voting phase' } };
      }
      if (game.currentVotingGroup !== letter) {
        return { status: 400, jsonBody: { error: `Group ${letter} is not currently being voted on` } };
      }

      const votedGroups = parseVotedGroups(game);
      if (votedGroups.includes(letter)) {
        return { status: 400, jsonBody: { error: `Voting already closed for Group ${letter}` } };
      }

      // Find the lie for this group
      const groupStatements = await getGroupStatements(gameId, letter);
      const lieStatement = groupStatements.find(s => s.isLie);
      const lieStatementNumber = lieStatement?.statementNumber ?? null;

      // Get all votes for this group
      const votes = await getGroupVotes(gameId, letter);

      // Score each vote and update player scores
      for (const vote of votes) {
        const isCorrect = vote.chosenStatement === lieStatementNumber;
        const pointsAwarded = isCorrect ? 3 : 0;

        await votesTable.updateEntity({
          partitionKey: gameId,
          rowKey: vote.rowKey,
          isCorrect,
          pointsAwarded,
        }, 'Merge');

        if (pointsAwarded > 0) {
          try {
            const player = await playersTable.getEntity<PlayerEntity>(gameId, vote.playerId);
            await playersTable.updateEntity({
              partitionKey: gameId,
              rowKey: vote.playerId,
              score: (player.score || 0) + pointsAwarded,
            }, 'Merge');
          } catch (error: any) {
            if (error.statusCode !== 404) throw error;
          }
        }
      }

      // Add to voted groups
      votedGroups.push(letter);
      await gamesTable.updateEntity({
        partitionKey: 'game',
        rowKey: gameId,
        votedGroups: JSON.stringify(votedGroups),
      }, 'Merge');

      // Build vote breakdown
      const breakdown = [0, 0, 0];
      for (const vote of votes) {
        if (vote.chosenStatement >= 1 && vote.chosenStatement <= 3) {
          breakdown[vote.chosenStatement - 1]++;
        }
      }

      return {
        status: 200,
        jsonBody: {
          lieStatementNumber,
          totalVotes: votes.length,
          correctVotes: votes.filter(v => v.chosenStatement === lieStatementNumber).length,
          breakdown: { statement1: breakdown[0], statement2: breakdown[1], statement3: breakdown[2] },
          votedGroups,
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to close voting:', error);
      return { status: 500, jsonBody: { error: 'Failed to close voting' } };
    }
  },
});

// POST /api/games/:id/vote
app.http('castVote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/vote',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const gameId = validateGameId(request.params.gameId);
      if (!gameId) return { status: 400, jsonBody: { error: 'Invalid game ID' } };

      let body;
      try {
        body = await request.json() as { playerId: string; groupLetter: string; chosenStatement: number };
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
      }

      const { playerId, groupLetter, chosenStatement } = body;
      if (!playerId) return { status: 400, jsonBody: { error: 'playerId is required' } };
      if (!groupLetter) return { status: 400, jsonBody: { error: 'groupLetter is required' } };
      if (![1, 2, 3].includes(chosenStatement)) {
        return { status: 400, jsonBody: { error: 'chosenStatement must be 1, 2, or 3' } };
      }

      const game = await getGameEntity(gameId);
      if (!game) return { status: 404, jsonBody: { error: 'Game not found' } };
      if (game.status !== 'voting') {
        return { status: 400, jsonBody: { error: 'Game is not in voting phase' } };
      }

      const normalizedLetter = groupLetter.toUpperCase();
      if (game.currentVotingGroup !== normalizedLetter) {
        return { status: 400, jsonBody: { error: 'This group is not currently being voted on' } };
      }

      const votedGroups = parseVotedGroups(game);
      if (votedGroups.includes(normalizedLetter)) {
        return { status: 400, jsonBody: { error: 'Voting has already closed for this group' } };
      }

      // Get player and verify they're not in the presenting group
      let player: PlayerEntity;
      try {
        player = await playersTable.getEntity<PlayerEntity>(gameId, playerId);
      } catch (error: any) {
        if (error.statusCode === 404) return { status: 404, jsonBody: { error: 'Player not found' } };
        throw error;
      }

      if (player.groupLetter === normalizedLetter) {
        return { status: 403, jsonBody: { error: 'You cannot vote on your own group' } };
      }

      // Check for duplicate vote
      try {
        await votesTable.getEntity(gameId, `${playerId}_${normalizedLetter}`);
        return { status: 409, jsonBody: { error: 'You have already voted on this group' } };
      } catch (error: any) {
        if (error.statusCode !== 404) throw error;
      }

      await votesTable.createEntity({
        partitionKey: gameId,
        rowKey: `${playerId}_${normalizedLetter}`,
        playerId,
        groupLetter: normalizedLetter,
        chosenStatement,
        votedAt: new Date(),
      });

      return { status: 201, jsonBody: { message: 'Vote recorded' } };
    } catch (error) {
      context.error('Failed to cast vote:', error);
      return { status: 500, jsonBody: { error: 'Failed to cast vote' } };
    }
  },
});

// GET /api/games/:id/voting/results/:letter
app.http('getVotingResults', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'games/{gameId}/voting/results/{letter}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      await requireGameKeeper(request);
      const gameId = validateGameId(request.params.gameId);
      const letter = validateGroupLetter(request.params.letter);

      if (!gameId) return { status: 400, jsonBody: { error: 'Invalid game ID' } };
      if (!letter) return { status: 400, jsonBody: { error: 'Invalid group letter' } };

      const game = await getGameEntity(gameId);
      if (!game) return { status: 404, jsonBody: { error: 'Game not found' } };

      const votedGroups = parseVotedGroups(game);
      if (!votedGroups.includes(letter)) {
        return { status: 400, jsonBody: { error: 'Voting has not closed for this group yet' } };
      }

      // Get statements with isLie
      const groupStatements = await getGroupStatements(gameId, letter);
      const statements = groupStatements.map(s => ({
        statementNumber: s.statementNumber, text: s.text, isLie: s.isLie,
      }));

      // Get votes and build breakdown
      const votes = await getGroupVotes(gameId, letter);
      const breakdown = [0, 0, 0];
      let correctVotes = 0;
      for (const v of votes) {
        if (v.isCorrect) correctVotes++;
        if (v.chosenStatement >= 1 && v.chosenStatement <= 3) {
          breakdown[v.chosenStatement - 1]++;
        }
      }

      return {
        status: 200,
        jsonBody: {
          statements,
          totalVotes: votes.length,
          correctVotes,
          breakdown: { statement1: breakdown[0], statement2: breakdown[1], statement3: breakdown[2] },
        },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to get voting results:', error);
      return { status: 500, jsonBody: { error: 'Failed to get voting results' } };
    }
  },
});
