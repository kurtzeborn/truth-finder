import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { gamekeepersTable } from '../shared/storage.js';
import { requireGameKeeper, AuthError } from '../shared/auth.js';
import { GameKeeperEntity } from '../shared/types.js';

// GET /api/gamekeepers
app.http('listGameKeepers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'gamekeepers',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      await requireGameKeeper(request);

      const keepers: Array<{ email: string; displayName: string; addedBy: string; addedAt: Date }> = [];
      const entities = gamekeepersTable.listEntities<GameKeeperEntity>();
      for await (const entity of entities) {
        keepers.push({
          email: entity.rowKey,
          displayName: entity.displayName,
          addedBy: entity.addedBy,
          addedAt: entity.addedAt,
        });
      }

      keepers.sort((a, b) => a.displayName.localeCompare(b.displayName));
      return { status: 200, jsonBody: keepers };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to list game keepers:', error);
      return { status: 500, jsonBody: { error: 'Failed to list game keepers' } };
    }
  },
});

// POST /api/gamekeepers
app.http('inviteGameKeeper', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'gamekeepers',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = await requireGameKeeper(request);
      let body;
      try {
        body = await request.json() as { email: string; displayName?: string };
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
      }

      if (!body.email) {
        return { status: 400, jsonBody: { error: 'email is required' } };
      }

      const email = body.email.toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { status: 400, jsonBody: { error: 'Invalid email format' } };
      }

      const entity: GameKeeperEntity = {
        partitionKey: 'gamekeeper',
        rowKey: email,
        displayName: (body.displayName || email.split('@')[0]).replace(/[<>]/g, ''),
        addedBy: user.userDetails,
        addedAt: new Date(),
      };

      try {
        await gamekeepersTable.createEntity(entity);
      } catch (error: any) {
        if (error.statusCode === 409) {
          return { status: 409, jsonBody: { error: 'This email is already a game keeper' } };
        }
        throw error;
      }

      return {
        status: 201,
        jsonBody: { email: entity.rowKey, displayName: entity.displayName, addedAt: entity.addedAt },
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to invite game keeper:', error);
      return { status: 500, jsonBody: { error: 'Failed to invite game keeper' } };
    }
  },
});

// DELETE /api/gamekeepers/:email
app.http('removeGameKeeper', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'gamekeepers/{email}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = await requireGameKeeper(request);
      const email = request.params.email?.toLowerCase();

      if (!email) {
        return { status: 400, jsonBody: { error: 'Email is required' } };
      }

      if (email === user.userDetails.toLowerCase()) {
        return { status: 400, jsonBody: { error: 'You cannot remove yourself' } };
      }

      try {
        await gamekeepersTable.deleteEntity('gamekeeper', email);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { status: 404, jsonBody: { error: 'Game keeper not found' } };
        }
        throw error;
      }

      return { status: 204, body: undefined };
    } catch (error) {
      if (error instanceof AuthError) {
        return { status: error.statusCode, jsonBody: { error: error.message } };
      }
      context.error('Failed to remove game keeper:', error);
      return { status: 500, jsonBody: { error: 'Failed to remove game keeper' } };
    }
  },
});

// POST /api/gamekeepers/seed (first-run bootstrapping only)
app.http('seedGameKeeper', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'gamekeepers/seed',
  handler: async (_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      // Only allow seeding when no gamekeepers exist yet
      const existing = gamekeepersTable.listEntities<GameKeeperEntity>();
      for await (const _entity of existing) {
        return { status: 403, jsonBody: { error: 'Seed is disabled after initial setup' } };
      }

      const entity: GameKeeperEntity = {
        partitionKey: 'gamekeeper',
        rowKey: 'scott@kurtzeborn.org',
        displayName: 'Scott Kurtzeborn',
        addedBy: 'system',
        addedAt: new Date(),
      };

      try {
        await gamekeepersTable.createEntity(entity);
        return { status: 201, jsonBody: { message: 'Seeded initial game keeper' } };
      } catch (error: any) {
        if (error.statusCode === 409) {
          return { status: 200, jsonBody: { message: 'Initial game keeper already exists' } };
        }
        throw error;
      }
    } catch (error) {
      context.error('Failed to seed game keeper:', error);
      return { status: 500, jsonBody: { error: 'Failed to seed game keeper' } };
    }
  },
});
