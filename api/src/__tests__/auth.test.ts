import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest } from '@azure/functions';
import { getAuthUser, isGameKeeper } from '../shared/auth.js';
import { gamekeepersTable } from '../shared/storage.js';

vi.mock('../shared/storage.js', () => ({
  gamekeepersTable: {
    getEntity: vi.fn(),
  },
}));

const mockGetEntity = vi.mocked(gamekeepersTable.getEntity);

describe('Auth Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuthUser', () => {
    it('returns null when no client principal header', () => {
      const request = {
        headers: { get: vi.fn().mockReturnValue(null) },
      } as unknown as HttpRequest;

      expect(getAuthUser(request)).toBeNull();
    });

    it('parses valid client principal', () => {
      const principal = {
        userId: 'user-123',
        userDetails: 'test@example.com',
        identityProvider: 'aad',
        userRoles: ['authenticated', 'anonymous'],
      };
      const encoded = Buffer.from(JSON.stringify(principal)).toString('base64');
      const request = {
        headers: { get: vi.fn().mockReturnValue(encoded) },
      } as unknown as HttpRequest;

      const result = getAuthUser(request);
      expect(result).toEqual(principal);
    });

    it('handles missing userRoles', () => {
      const principal = {
        userId: 'user-456',
        userDetails: 'other@example.com',
        identityProvider: 'github',
      };
      const encoded = Buffer.from(JSON.stringify(principal)).toString('base64');
      const request = {
        headers: { get: vi.fn().mockReturnValue(encoded) },
      } as unknown as HttpRequest;

      const result = getAuthUser(request);
      expect(result?.userRoles).toEqual([]);
    });

    it('returns null for invalid base64', () => {
      const request = {
        headers: { get: vi.fn().mockReturnValue('not-valid!!!') },
      } as unknown as HttpRequest;

      expect(getAuthUser(request)).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      const encoded = Buffer.from('{ not valid }').toString('base64');
      const request = {
        headers: { get: vi.fn().mockReturnValue(encoded) },
      } as unknown as HttpRequest;

      expect(getAuthUser(request)).toBeNull();
    });
  });

  describe('isGameKeeper', () => {
    it('returns false for empty email', async () => {
      expect(await isGameKeeper('')).toBe(false);
      expect(mockGetEntity).not.toHaveBeenCalled();
    });

    it('returns true when email exists', async () => {
      mockGetEntity.mockResolvedValue({
        partitionKey: 'gamekeeper',
        rowKey: 'test@example.com',
        etag: 'mock',
      } as any);

      expect(await isGameKeeper('test@example.com')).toBe(true);
      expect(mockGetEntity).toHaveBeenCalledWith('gamekeeper', 'test@example.com');
    });

    it('returns false when email not found (404)', async () => {
      const error = new Error('Not found');
      (error as any).statusCode = 404;
      mockGetEntity.mockRejectedValue(error);

      expect(await isGameKeeper('unknown@example.com')).toBe(false);
    });

    it('throws on non-404 errors', async () => {
      const error = new Error('Server error');
      (error as any).statusCode = 500;
      mockGetEntity.mockRejectedValue(error);

      await expect(isGameKeeper('test@example.com')).rejects.toThrow('Server error');
    });

    it('normalizes email to lowercase', async () => {
      mockGetEntity.mockResolvedValue({
        partitionKey: 'gamekeeper',
        rowKey: 'test@example.com',
        etag: 'mock',
      } as any);

      await isGameKeeper('TEST@EXAMPLE.COM');
      expect(mockGetEntity).toHaveBeenCalledWith('gamekeeper', 'test@example.com');
    });
  });
});
