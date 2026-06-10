import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest, InvocationContext } from '@azure/functions';
import { gamesTable, playersTable, statementsTable } from '../shared/storage.js';

vi.mock('../shared/storage.js', () => ({
  gamesTable: { getEntity: vi.fn() },
  playersTable: { getEntity: vi.fn() },
  statementsTable: {
    getEntity: vi.fn(),
    upsertEntity: vi.fn(),
    updateEntity: vi.fn(),
  },
}));

// Capture the handler when app.http is called
let updateStatementHandler: any;
vi.mock('@azure/functions', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    app: {
      ...orig.app,
      http: (name: string, opts: any) => {
        if (name === 'updateStatement') {
          updateStatementHandler = opts.handler;
        }
      },
    },
  };
});

const mockGamesGet = vi.mocked(gamesTable.getEntity);
const mockPlayersGet = vi.mocked(playersTable.getEntity);
const mockStatementsGet = vi.mocked(statementsTable.getEntity);
const mockStatementsUpsert = vi.mocked(statementsTable.upsertEntity);
const mockStatementsUpdate = vi.mocked(statementsTable.updateEntity);

// Import triggers registration
await import('../functions/statements.js');

function makeRequest(params: Record<string, string>, body: unknown): HttpRequest {
  return {
    params,
    json: () => Promise.resolve(body),
  } as unknown as HttpRequest;
}

const mockContext = { error: vi.fn() } as unknown as InvocationContext;

describe('Statement Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid statement number', async () => {
    const req = makeRequest({ gameId: 'TEST', groupLetter: 'A', statementNumber: '4' }, {});
    const res = await updateStatementHandler(req, mockContext);
    expect(res.status).toBe(400);
    expect((res.jsonBody as any).error).toContain('1, 2, or 3');
  });

  it('rejects missing playerId', async () => {
    const req = makeRequest(
      { gameId: 'TEST', groupLetter: 'A', statementNumber: '1' },
      { text: 'hello', isLie: false },
    );
    const res = await updateStatementHandler(req, mockContext);
    expect(res.status).toBe(400);
    expect((res.jsonBody as any).error).toContain('playerId');
  });

  it('rejects empty statement text', async () => {
    const req = makeRequest(
      { gameId: 'TEST', groupLetter: 'A', statementNumber: '1' },
      { text: '   ', isLie: false, playerId: 'p1' },
    );
    const res = await updateStatementHandler(req, mockContext);
    expect(res.status).toBe(400);
    expect((res.jsonBody as any).error).toContain('1-200 characters');
  });

  it('rejects text over 200 characters', async () => {
    const req = makeRequest(
      { gameId: 'TEST', groupLetter: 'A', statementNumber: '1' },
      { text: 'x'.repeat(201), isLie: false, playerId: 'p1' },
    );
    const res = await updateStatementHandler(req, mockContext);
    expect(res.status).toBe(400);
  });

  it('rejects when game is not in statements phase', async () => {
    const req = makeRequest(
      { gameId: 'TEST', groupLetter: 'A', statementNumber: '1' },
      { text: 'hello', isLie: false, playerId: 'p1' },
    );
    mockGamesGet.mockResolvedValue({ status: 'lobby' } as any);
    const res = await updateStatementHandler(req, mockContext);
    expect(res.status).toBe(400);
    expect((res.jsonBody as any).error).toContain('statements phase');
  });

  it('rejects when player is not in the target group', async () => {
    const req = makeRequest(
      { gameId: 'TEST', groupLetter: 'A', statementNumber: '1' },
      { text: 'hello', isLie: false, playerId: 'p1' },
    );
    mockGamesGet.mockResolvedValue({ status: 'statements' } as any);
    mockPlayersGet.mockResolvedValue({ groupLetter: 'B' } as any);
    const res = await updateStatementHandler(req, mockContext);
    expect(res.status).toBe(403);
    expect((res.jsonBody as any).error).toContain('own group');
  });

  it('saves a statement successfully', async () => {
    const req = makeRequest(
      { gameId: 'TEST', groupLetter: 'A', statementNumber: '2' },
      { text: 'We all like pizza', isLie: false, playerId: 'p1' },
    );
    mockGamesGet.mockResolvedValue({ status: 'statements' } as any);
    mockPlayersGet.mockResolvedValue({ groupLetter: 'A' } as any);
    const res = await updateStatementHandler(req, mockContext);
    expect(res.status).toBe(200);
    expect(mockStatementsUpsert).toHaveBeenCalledOnce();
    expect(mockStatementsUpsert.mock.calls[0][0]).toMatchObject({
      partitionKey: 'TEST',
      rowKey: 'A_2',
      text: 'We all like pizza',
      isLie: false,
    });
  });

  it('auto-clears other lies when marking a statement as lie', async () => {
    const req = makeRequest(
      { gameId: 'TEST', groupLetter: 'A', statementNumber: '2' },
      { text: 'We all like pizza', isLie: true, playerId: 'p1' },
    );
    mockGamesGet.mockResolvedValue({ status: 'statements' } as any);
    mockPlayersGet.mockResolvedValue({ groupLetter: 'A' } as any);

    // Statement 1 was previously the lie, statement 3 doesn't exist
    mockStatementsGet.mockImplementation(async (_pk: any, rowKey: any) => {
      if (rowKey === 'A_1') return { isLie: true, rowKey: 'A_1' } as any;
      if (rowKey === 'A_3') {
        const err = new Error('Not found') as any;
        err.statusCode = 404;
        throw err;
      }
      throw new Error('Unexpected');
    });

    const res = await updateStatementHandler(req, mockContext);
    expect(res.status).toBe(200);
    expect(mockStatementsUpdate).toHaveBeenCalledOnce();
    expect(mockStatementsUpdate.mock.calls[0][0]).toMatchObject({
      partitionKey: 'TEST',
      rowKey: 'A_1',
      isLie: false,
    });
    expect(mockStatementsUpsert.mock.calls[0][0]).toMatchObject({
      isLie: true,
      statementNumber: 2,
    });
  });

  it('normalizes gameId and groupLetter to uppercase', async () => {
    const req = makeRequest(
      { gameId: 'test', groupLetter: 'a', statementNumber: '1' },
      { text: 'hello world', isLie: false, playerId: 'p1' },
    );
    mockGamesGet.mockResolvedValue({ status: 'statements' } as any);
    mockPlayersGet.mockResolvedValue({ groupLetter: 'A' } as any);
    const res = await updateStatementHandler(req, mockContext);
    expect(res.status).toBe(200);
    expect(mockGamesGet).toHaveBeenCalledWith('game', 'TEST');
    expect(mockPlayersGet).toHaveBeenCalledWith('TEST', 'p1');
  });
});
