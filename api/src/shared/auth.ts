import { HttpRequest } from '@azure/functions';
import { gamekeepersTable } from './storage.js';

export interface AuthUser {
  userId: string;
  userDetails: string; // email
  identityProvider: string;
  userRoles: string[];
}

export function getAuthUser(request: HttpRequest): AuthUser | null {
  const clientPrincipal = request.headers.get('x-ms-client-principal');
  if (!clientPrincipal) {
    return null;
  }

  try {
    const decoded = Buffer.from(clientPrincipal, 'base64').toString('utf8');
    const principal = JSON.parse(decoded);
    return {
      userId: principal.userId,
      userDetails: principal.userDetails,
      identityProvider: principal.identityProvider,
      userRoles: principal.userRoles || [],
    };
  } catch {
    return null;
  }
}

export async function isGameKeeper(email: string): Promise<boolean> {
  if (!email) return false;
  try {
    const entity = await gamekeepersTable.getEntity('gamekeeper', email.toLowerCase());
    return !!entity;
  } catch (error: any) {
    if (error.statusCode === 404) return false;
    throw error;
  }
}

export function requireAuth(request: HttpRequest): AuthUser {
  const user = getAuthUser(request);
  if (!user) {
    throw new AuthError('Authentication required', 401);
  }
  return user;
}

export async function requireGameKeeper(request: HttpRequest): Promise<AuthUser> {
  const user = requireAuth(request);
  const keeper = await isGameKeeper(user.userDetails);
  if (!keeper) {
    throw new AuthError('Game keeper access required', 403);
  }
  return user;
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'AuthError';
  }
}
