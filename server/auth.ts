import crypto from 'node:crypto';
import type {NextFunction, Request, Response} from 'express';
import {db, nowIso} from './db.ts';

const SESSION_COOKIE_NAME = 'arix_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  sessionTokenHash?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: string): {
  token: string;
  tokenHash: string;
  expiresAt: string;
} {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const id = crypto.randomUUID();
  const createdAt = nowIso();

  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, tokenHash, expiresAt, createdAt);

  return {token, tokenHash, expiresAt};
}

export function setSessionCookie(
  req: Request,
  res: Response,
  token: string
): void {
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https';

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https';

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
  });
}

export function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }
  return null;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const rawToken = extractSessionToken(req);
  if (!rawToken) {
    res.status(401).json({error: 'Authentication required.'});
    return;
  }

  const tokenHash = hashSessionToken(rawToken);
  const row = db
    .prepare(
      `SELECT s.user_id, s.expires_at, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {user_id: string; expires_at: string; email: string}
    | undefined;

  if (!row) {
    res.status(401).json({error: 'Invalid or expired session.'});
    return;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    res.status(401).json({error: 'Session expired. Please sign in again.'});
    return;
  }

  req.userId = row.user_id;
  req.userEmail = row.email;
  req.sessionTokenHash = tokenHash;
  next();
}
