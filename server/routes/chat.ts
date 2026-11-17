import crypto from 'node:crypto';
import {Router} from 'express';
import {z} from 'zod';
import {requireAuth, type AuthenticatedRequest} from '../auth.ts';
import {db, nowIso} from '../db.ts';

const router = Router();
router.use(requireAuth);

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).default('New Chat'),
  projectId: z.string().uuid().nullable().optional(),
  mode: z.string().trim().max(32).default('chat'),
});

const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  projectId: z.string().uuid().nullable().optional(),
});

const addMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(150000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

router.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const rawPage = Number(req.query.page ?? 1);
  const rawLimit = Number(req.query.limit ?? 20);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), 50)
      : 20;
  const offset = (page - 1) * limit;

  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS count FROM conversations WHERE user_id = ? AND mode = 'chat'`
    )
    .get(userId) as {count: number};
  const total = countRow.count;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const rows = db
    .prepare(
      `SELECT id, title, project_id AS projectId, updated_at AS updatedAt
       FROM conversations
       WHERE user_id = ? AND mode = 'chat'
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, limit, offset);

  res.json({
    conversations: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  });
});

router.post('/', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = createConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: parsed.error.issues[0]?.message ?? 'Invalid input.'});
    return;
  }

  const id = crypto.randomUUID();
  const timestamp = nowIso();

  if (parsed.data.projectId) {
    const owned = db
      .prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
      .get(parsed.data.projectId, userId);
    if (!owned) {
      res.status(404).json({error: 'Linked project not found.'});
      return;
    }
  }

  db.prepare(
    `INSERT INTO conversations (id, user_id, project_id, title, mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    parsed.data.projectId ?? null,
    parsed.data.title,
    parsed.data.mode,
    timestamp,
    timestamp
  );

  res.status(201).json({
    conversation: {
      id,
      title: parsed.data.title,
      projectId: parsed.data.projectId ?? null,
      mode: parsed.data.mode,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
});

router.patch('/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = updateConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: parsed.error.issues[0]?.message ?? 'Invalid input.'});
    return;
  }

  const existing = db
    .prepare('SELECT id, title, project_id FROM conversations WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as
    | {id: string; title: string; project_id: string | null}
    | undefined;

  if (!existing) {
    res.status(404).json({error: 'Conversation not found.'});
    return;
  }

  const timestamp = nowIso();
  db.prepare(
    `UPDATE conversations SET title = ?, project_id = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ).run(
    parsed.data.title ?? existing.title,
    parsed.data.projectId !== undefined ? parsed.data.projectId : existing.project_id,
    timestamp,
    req.params.id,
    userId
  );

  res.json({ok: true});
});

router.delete('/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const result = db
    .prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);
  if (result.changes === 0) {
    res.status(404).json({error: 'Conversation not found.'});
    return;
  }
  res.json({ok: true});
});

router.get('/:id/messages', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const conv = db
    .prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId);
  if (!conv) {
    res.status(404).json({error: 'Conversation not found.'});
    return;
  }

  const rawPage = Number(req.query.page ?? 1);
  const rawLimit = Number(req.query.limit ?? 20);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), 50)
      : 20;
  const offset = (page - 1) * limit;

  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND user_id = ?`
    )
    .get(req.params.id, userId) as {count: number};
  const total = countRow.count;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const rows = db
    .prepare(
      `SELECT id, role, content, created_at AS createdAt
       FROM messages
       WHERE conversation_id = ? AND user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(req.params.id, userId, limit, offset) as Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
  }>;

  res.json({
    messages: rows.reverse(),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  });
});

router.post('/:id/messages', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = addMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: parsed.error.issues[0]?.message ?? 'Invalid message.'});
    return;
  }

  const conv = db
    .prepare('SELECT id, title FROM conversations WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as {id: string; title: string} | undefined;
  if (!conv) {
    res.status(404).json({error: 'Conversation not found.'});
    return;
  }

  const id = crypto.randomUUID();
  const timestamp = nowIso();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      req.params.id,
      userId,
      parsed.data.role,
      parsed.data.content,
      JSON.stringify(parsed.data.metadata ?? {}),
      timestamp,
      timestamp
    );

    // Auto-title conversation on first user message if still default
    const nextTitle =
      conv.title === 'New Chat' && parsed.data.role === 'user'
        ? parsed.data.content.trim().slice(0, 48) +
          (parsed.data.content.trim().length > 48 ? '...' : '')
        : conv.title;

    db.prepare(
      'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).run(nextTitle, timestamp, req.params.id, userId);
  });

  tx();

  res.status(201).json({
    message: {
      id,
      role: parsed.data.role,
      content: parsed.data.content,
      createdAt: timestamp,
    },
  });
});

export default router;
