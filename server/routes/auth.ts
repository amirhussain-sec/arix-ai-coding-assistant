import crypto from 'node:crypto';
import {Router} from 'express';
import {z} from 'zod';
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  requireAuth,
  setSessionCookie,
  verifyPassword,
  type AuthenticatedRequest,
} from '../auth.ts';
import {db, nowIso} from '../db.ts';

const router = Router();

const signUpSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(128),
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name is required.')
    .max(60)
    .optional(),
});

const signInSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const AVATAR_COLORS = ['#4f6bff', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

function getUserPayload(userId: string) {
  const row = db
    .prepare(
      `SELECT
         u.id AS userId,
         u.email,
         u.auth_provider AS authProvider,
         u.created_at AS createdAt,
         p.display_name AS displayName,
         p.preferred_language AS preferredLanguage,
         p.avatar_color AS avatarColor,
         p.onboarded,
         s.theme,
         s.editor_font_size AS editorFontSize,
         s.voice_name AS voiceName,
         s.voice_rate AS voiceRate,
         s.voice_pitch AS voicePitch,
         s.voice_preset AS voicePreset,
         s.auto_read_replies AS autoReadReplies,
         s.auto_send_speech AS autoSendSpeech
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       JOIN user_settings s ON s.user_id = u.id
       WHERE u.id = ?`
    )
    .get(userId) as
    | {
        userId: string;
        email: string;
        authProvider: string;
        createdAt: string;
        displayName: string;
        preferredLanguage: string;
        avatarColor: string;
        onboarded: number;
        theme: 'dark' | 'light';
        editorFontSize: number;
        voiceName: string;
        voiceRate: number;
        voicePitch: number;
        voicePreset: string;
        autoReadReplies: number;
        autoSendSpeech: number;
      }
    | undefined;

  if (!row) return null;

  return {
    profile: {
      userId: row.userId,
      email: row.email,
      displayName: row.displayName,
      preferredLanguage: row.preferredLanguage,
      avatarColor: row.avatarColor,
      onboarded: Boolean(row.onboarded),
      authProvider: row.authProvider,
      createdAt: row.createdAt,
    },
    settings: {
      theme: row.theme,
      editorFontSize: row.editorFontSize,
      voiceName: row.voiceName,
      voiceRate: row.voiceRate,
      voicePitch: row.voicePitch,
      voicePreset: row.voicePreset,
      autoReadReplies: Boolean(row.autoReadReplies),
      autoSendSpeech: Boolean(row.autoSendSpeech),
    },
  };
}

function createUserRecords(params: {
  email: string;
  passwordHash: string;
  displayName: string;
}): string {
  const userId = crypto.randomUUID();
  const timestamp = nowIso();
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

  const insertTx = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, google_sub, auth_provider, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'email', ?, ?)`
    ).run(userId, params.email.toLowerCase(), params.passwordHash, timestamp, timestamp);

    db.prepare(
      `INSERT INTO profiles (user_id, display_name, preferred_language, avatar_color, onboarded, created_at, updated_at)
       VALUES (?, ?, 'typescript', ?, 0, ?, ?)`
    ).run(userId, params.displayName, color, timestamp, timestamp);

    db.prepare(
      `INSERT INTO user_settings (user_id, theme, editor_font_size, voice_name, voice_rate, voice_pitch, voice_preset, auto_read_replies, auto_send_speech, created_at, updated_at)
       VALUES (?, 'dark', 14, '', 1.0, 1.0, 'Natural', 0, 0, ?, ?)`
    ).run(userId, timestamp, timestamp);
  });

  insertTx();
  return userId;
}

router.post('/signup', (req, res) => {
  const parsed = signUpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid sign-up payload.',
    });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const existing = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(email) as {id: string} | undefined;

  if (existing) {
    res.status(409).json({
      error: 'An account with this email already exists. Please sign in.',
    });
    return;
  }

  const defaultName =
    parsed.data.displayName?.trim() ||
    email.split('@')[0]?.replace(/[._-]+/g, ' ') ||
    'Developer';

  const userId = createUserRecords({
    email,
    passwordHash: hashPassword(parsed.data.password),
    displayName: defaultName,
  });

  const session = createSession(userId);
  setSessionCookie(req, res, session.token);

  const payload = getUserPayload(userId);
  res.status(201).json({
    ...payload,
    sessionToken: session.token,
  });
});

router.post('/signin', (req, res) => {
  const parsed = signInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid sign-in payload.',
    });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const user = db
    .prepare('SELECT id, password_hash FROM users WHERE email = ?')
    .get(email) as {id: string; password_hash: string | null} | undefined;

  if (!user || !user.password_hash) {
    res.status(401).json({error: 'Invalid email or password.'});
    return;
  }

  if (!verifyPassword(parsed.data.password, user.password_hash)) {
    res.status(401).json({error: 'Invalid email or password.'});
    return;
  }

  const session = createSession(user.id);
  setSessionCookie(req, res, session.token);

  const payload = getUserPayload(user.id);
  res.json({
    ...payload,
    sessionToken: session.token,
  });
});

router.post('/signout', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.sessionTokenHash) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(
      req.sessionTokenHash
    );
  }
  clearSessionCookie(req, res);
  res.json({ok: true});
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!req.userId) {
    res.status(401).json({error: 'Unauthorized.'});
    return;
  }
  const payload = getUserPayload(req.userId);
  if (!payload) {
    res.status(404).json({error: 'User profile not found.'});
    return;
  }
  res.json(payload);
});

export default router;
