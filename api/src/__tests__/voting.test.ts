import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest, InvocationContext } from '@azure/functions';
import { gamesTable, playersTable, statementsTable, votesTable } from '../shared/storage.js';
import { AuthError } from '../shared/auth.js';

vi.mock('../shared/storage.js', () => ({
  gamesTable: { getEntity: vi.fn(), updateEntity: vi.fn() },
  playersTable: { getEntity: vi.fn(), updateEntity: vi.fn() },
  statementsTable: { getEntity: vi.fn() },
  votesTable: {
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    listEntities: vi.fn(),
  },
}));

vi.mock('../shared/auth.js', () => ({
  requireGameKeeper: vi.fn().mockResolvedValue({ userId: 'gk1' }),
  AuthError: class AuthError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('../shared/helpers.js', () => ({
  validateGameId: vi.fn((id: string) => {
    if (!id || !/^[A-Z0-9]{4}$/.test(id.toUpperCase())) return null;
    return id.toUpperCase();
  }),
  getGameEntity: vi.fn(),
}));

import { getGameEntity } from '../shared/helpers.js';
import { requireGameKeeper } from '../shared/auth.js';

const mockGetGame = vi.mocked(getGameEntity);
const mockGamesUpdate = vi.mocked(gamesTable.updateEntity);
const mockPlayersGet = vi.mocked(playersTable.getEntity);
const mockPlayersUpdate = vi.mocked(playersTable.updateEntity);
const mockStatementsGet = vi.mocked(statementsTable.getEntity);
const mockVotesGet = vi.mocked(votesTable.getEntity);
const mockVotesCreate = vi.mocked(votesTable.createEntity);
const mockVotesUpdate = vi.mocked(votesTable.updateEntity);
const mockVotesList = vi.mocked(votesTable.listEntities);
const mockRequireGK = vi.mocked(requireGameKeeper);

// Capture handlers
const handlers: Record<string, any> = {};
vi.mock('@azure/functions', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    app: {
      ...orig.app,
      http: (name: string, opts: any) => {
        handlers[name] = opts.handler;
      },
    },
  };
});

await import('../functions/voting.js');

function makeRequest(params: Record<string, string>, body?: unknown, query?: Record<string, string>): HttpRequest {
  return {
    params,
    json: () => Promise.resolve(body),
    query: new Map(Object.entries(query || {})),
  } as unknown as HttpRequest;
}

const mockContext = { error: vi.fn() } as unknown as InvocationContext;

function asyncIter<T>(...items: T[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const item of items) yield item;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireGK.mockResolvedValue({ userId: 'gk1' } as any);
});

describe('castVote', () => {
  const handler = () => handlers.castVote;

  it('records a valid vote', async () => {
    mockGetGame.mockResolvedValue({ rowKey: 'ABCD', status: 'voting', currentVotingGroup: 'A', votedGroups: '[]' } as any);
    mockPlayersGet.mockResolvedValue({ rowKey: 'p1', groupLetter: 'B' } as any);
    mockVotesGet.mockRejectedValue({ statusCode: 404 });

    const res = await handler()(makeRequest({ gameId: 'ABCD' }, { playerId: 'p1', groupLetter: 'A', chosenStatement: 2 }), mockContext);
    expect(res.status).toBe(201);
    expect(mockVotesCreate).toHaveBeenCalledWith(expect.objectContaining({
      partitionKey: 'ABCD',
      rowKey: 'p1_A',
      playerId: 'p1',
      groupLetter: 'A',
      chosenStatement: 2,
    }));
  });

  it('rejects voting on own group', async () => {
    mockGetGame.mockResolvedValue({ rowKey: 'ABCD', status: 'voting', currentVotingGroup: 'A', votedGroups: '[]' } as any);
    mockPlayersGet.mockResolvedValue({ rowKey: 'p1', groupLetter: 'A' } as any);

    const res = await handler()(makeRequest({ gameId: 'ABCD' }, { playerId: 'p1', groupLetter: 'A', chosenStatement: 1 }), mockContext);
    expect(res.status).toBe(403);
  });

  it('rejects duplicate vote', async () => {
    mockGetGame.mockResolvedValue({ rowKey: 'ABCD', status: 'voting', currentVotingGroup: 'A', votedGroups: '[]' } as any);
    mockPlayersGet.mockResolvedValue({ rowKey: 'p1', groupLetter: 'B' } as any);
    mockVotesGet.mockResolvedValue({} as any);

    const res = await handler()(makeRequest({ gameId: 'ABCD' }, { playerId: 'p1', groupLetter: 'A', chosenStatement: 1 }), mockContext);
    expect(res.status).toBe(409);
  });

  it('rejects vote when not in voting phase', async () => {
    mockGetGame.mockResolvedValue({ rowKey: 'ABCD', status: 'statements', currentVotingGroup: 'A', votedGroups: '[]' } as any);

    const res = await handler()(makeRequest({ gameId: 'ABCD' }, { playerId: 'p1', groupLetter: 'A', chosenStatement: 1 }), mockContext);
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toContain('not in voting phase');
  });

  it('rejects vote for wrong group', async () => {
    mockGetGame.mockResolvedValue({ rowKey: 'ABCD', status: 'voting', currentVotingGroup: 'A', votedGroups: '[]' } as any);

    const res = await handler()(makeRequest({ gameId: 'ABCD' }, { playerId: 'p1', groupLetter: 'B', chosenStatement: 1 }), mockContext);
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toContain('not currently being voted on');
  });

  it('rejects invalid statement number', async () => {
    const res = await handler()(makeRequest({ gameId: 'ABCD' }, { playerId: 'p1', groupLetter: 'A', chosenStatement: 4 }), mockContext);
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toContain('chosenStatement');
  });

  it('rejects vote after voting closed', async () => {
    mockGetGame.mockResolvedValue({ rowKey: 'ABCD', status: 'voting', currentVotingGroup: 'A', votedGroups: '["A"]' } as any);

    const res = await handler()(makeRequest({ gameId: 'ABCD' }, { playerId: 'p1', groupLetter: 'A', chosenStatement: 1 }), mockContext);
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toContain('already closed');
  });
});

describe('openVoting', () => {
  const handler = () => handlers.openVoting;

  it('opens voting for a group', async () => {
    mockGetGame.mockResolvedValue({ rowKey: 'ABCD', status: 'voting', votedGroups: '[]', currentVotingGroup: undefined } as any);

    const res = await handler()(makeRequest({ gameId: 'ABCD', letter: 'A' }), mockContext);
    expect(res.status).toBe(200);
    expect(mockGamesUpdate).toHaveBeenCalledWith(expect.objectContaining({
      currentVotingGroup: 'A',
    }), 'Merge');
  });

  it('rejects already voted group', async () => {
    mockGetGame.mockResolvedValue({ rowKey: 'ABCD', status: 'voting', votedGroups: '["A"]', currentVotingGroup: undefined } as any);

    const res = await handler()(makeRequest({ gameId: 'ABCD', letter: 'A' }), mockContext);
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toContain('already been voted on');
  });

  it('rejects when another group is still voting', async () => {
    mockGetGame.mockResolvedValue({ rowKey: 'ABCD', status: 'voting', votedGroups: '[]', currentVotingGroup: 'A' } as any);

    const res = await handler()(makeRequest({ gameId: 'ABCD', letter: 'B' }), mockContext);
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toContain('Close voting');
  });

  it('rejects when not in voting phase', async () => {
    mockGetGame.mockResolvedValue({ rowKey: 'ABCD', status: 'lobby', votedGroups: '[]' } as any);

    const res = await handler()(makeRequest({ gameId: 'ABCD', letter: 'A' }), mockContext);
    expect(res.status).toBe(400);
  });
});

describe('closeVoting', () => {
  const handler = () => handlers.closeVoting;

  it('scores votes and closes voting', async () => {
    mockGetGame.mockResolvedValue({ rowKey: 'ABCD', status: 'voting', currentVotingGroup: 'A', votedGroups: '[]' } as any);

    // Statement 2 is the lie
    mockStatementsGet.mockImplementation((_pk: any, rk: any) => {
      const n = parseInt(rk.split('_')[1]);
      return Promise.resolve({ statementNumber: n, text: `S${n}`, isLie: n === 2 } as any);
    });

    // Two votes: one correct (chose 2), one wrong (chose 1)
    mockVotesList.mockReturnValue(asyncIter(
      { rowKey: 'p1_A', playerId: 'p1', groupLetter: 'A', chosenStatement: 2 },
      { rowKey: 'p2_A', playerId: 'p2', groupLetter: 'A', chosenStatement: 1 },
    ) as any);

    mockPlayersGet.mockResolvedValue({ rowKey: 'p1', score: 0 } as any);

    const res = await handler()(makeRequest({ gameId: 'ABCD', letter: 'A' }), mockContext);
    expect(res.status).toBe(200);
    expect(res.jsonBody.lieStatementNumber).toBe(2);
    expect(res.jsonBody.totalVotes).toBe(2);
    expect(res.jsonBody.correctVotes).toBe(1);
    expect(res.jsonBody.breakdown).toEqual({ statement1: 1, statement2: 1, statement3: 0 });

    // Correct voter gets 3 points
    expect(mockVotesUpdate).toHaveBeenCalledWith(expect.objectContaining({
      rowKey: 'p1_A',
      isCorrect: true,
      pointsAwarded: 3,
    }), 'Merge');

    // Wrong voter gets 0 points
    expect(mockVotesUpdate).toHaveBeenCalledWith(expect.objectContaining({
      rowKey: 'p2_A',
      isCorrect: false,
      pointsAwarded: 0,
    }), 'Merge');

    // Player score updated for correct voter
    expect(mockPlayersUpdate).toHaveBeenCalledWith(expect.objectContaining({
      rowKey: 'p1',
      score: 3,
    }), 'Merge');

    // Game updated with voted groups
    expect(mockGamesUpdate).toHaveBeenCalledWith(expect.objectContaining({
      votedGroups: '["A"]',
    }), 'Merge');
  });

  it('rejects closing wrong group', async () => {
    mockGetGame.mockResolvedValue({ rowKey: 'ABCD', status: 'voting', currentVotingGroup: 'A', votedGroups: '[]' } as any);

    const res = await handler()(makeRequest({ gameId: 'ABCD', letter: 'B' }), mockContext);
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toContain('not currently being voted on');
  });
});
