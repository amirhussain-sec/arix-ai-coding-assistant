import crypto from 'node:crypto';
import {Router} from 'express';
import {z} from 'zod';
import {requireAuth, type AuthenticatedRequest} from '../auth.ts';
import {db, nowIso} from '../db.ts';

const router = Router();
router.use(requireAuth);

const createAgentProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default('Built with Arix Agent'),
});

const saveVersionSchema = z.object({
  prompt: z.string().max(10000).default(''),
  htmlContent: z.string().min(1).max(500000),
  summary: z.string().max(300).default('Updated application'),
});

const saveMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(50000),
});

router.get('/projects', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const rows = db
    .prepare(
      `SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt
       FROM projects
       WHERE user_id = ? AND is_agent_project = 1
       ORDER BY updated_at DESC`
    )
    .all(userId);
  res.json({projects: rows});
});

router.post('/projects', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = createAgentProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: parsed.error.issues[0]?.message ?? 'Invalid payload.'});
    return;
  }

  const projectId = crypto.randomUUID();
  const convId = crypto.randomUUID();
  const timestamp = nowIso();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO projects (id, user_id, name, description, category, primary_language, is_agent_project, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Web', 'html', 1, ?, ?)`
    ).run(projectId, userId, parsed.data.name, parsed.data.description, timestamp, timestamp);

    db.prepare(
      `INSERT INTO conversations (id, user_id, project_id, title, mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'agent', ?, ?)`
    ).run(convId, userId, projectId, parsed.data.name, timestamp, timestamp);
  });

  tx();

  res.status(201).json({
    project: {
      id: projectId,
      name: parsed.data.name,
      description: parsed.data.description,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
});

router.get('/projects/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const project = db
    .prepare(
      `SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt
       FROM projects
       WHERE id = ? AND user_id = ?`
    )
    .get(req.params.id, userId) as
    | {id: string; name: string; description: string; createdAt: string; updatedAt: string}
    | undefined;

  if (!project) {
    res.status(404).json({error: 'Agent project not found.'});
    return;
  }

  const versions = db
    .prepare(
      `SELECT id, version_number AS versionNumber, prompt, html_content AS htmlContent, summary, created_at AS createdAt
       FROM agent_versions
       WHERE project_id = ? AND user_id = ?
       ORDER BY version_number DESC
       LIMIT 20`
    )
    .all(req.params.id, userId);

  const conv = db
    .prepare(
      `SELECT id FROM conversations WHERE project_id = ? AND user_id = ? AND mode = 'agent' LIMIT 1`
    )
    .get(req.params.id, userId) as {id: string} | undefined;

  const messages = conv
    ? db
        .prepare(
          `SELECT id, role, content, created_at AS createdAt
           FROM messages
           WHERE conversation_id = ? AND user_id = ?
           ORDER BY created_at ASC`
        )
        .all(conv.id, userId)
    : [];

  res.json({project, versions, messages});
});

router.post('/projects/:id/versions', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = saveVersionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: parsed.error.issues[0]?.message ?? 'Invalid version payload.'});
    return;
  }

  const project = db
    .prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId);
  if (!project) {
    res.status(404).json({error: 'Project not found.'});
    return;
  }

  const maxRow = db
    .prepare(
      'SELECT COALESCE(MAX(version_number), 0) AS maxVer FROM agent_versions WHERE project_id = ? AND user_id = ?'
    )
    .get(req.params.id, userId) as {maxVer: number};

  const nextVer = maxRow.maxVer + 1;
  const versionId = crypto.randomUUID();
  const timestamp = nowIso();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO agent_versions (id, project_id, user_id, version_number, prompt, html_content, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      versionId,
      req.params.id,
      userId,
      nextVer,
      parsed.data.prompt,
      parsed.data.htmlContent,
      parsed.data.summary,
      timestamp,
      timestamp
    );

    // Keep max 20 versions per project
    db.prepare(
      `DELETE FROM agent_versions
       WHERE project_id = ? AND user_id = ?
         AND id NOT IN (
           SELECT id FROM agent_versions
           WHERE project_id = ? AND user_id = ?
           ORDER BY version_number DESC
           LIMIT 20
         )`
    ).run(req.params.id, userId, req.params.id, userId);

    // Sync index.html into project_files so Open in Editor & Thumbnails stay live
    const existingFile = db
      .prepare(
        `SELECT id FROM project_files WHERE project_id = ? AND user_id = ? AND path = 'index.html'`
      )
      .get(req.params.id, userId) as {id: string} | undefined;

    if (existingFile) {
      db.prepare(
        'UPDATE project_files SET content = ?, updated_at = ? WHERE id = ? AND user_id = ?'
      ).run(parsed.data.htmlContent, timestamp, existingFile.id, userId);
    } else {
      db.prepare(
        `INSERT INTO project_files (id, project_id, user_id, path, content, language, created_at, updated_at)
         VALUES (?, ?, ?, 'index.html', ?, 'html', ?, ?)`
      ).run(
        crypto.randomUUID(),
        req.params.id,
        userId,
        parsed.data.htmlContent,
        timestamp,
        timestamp
      );
    }

    db.prepare(
      'UPDATE projects SET is_agent_project = 1, updated_at = ? WHERE id = ? AND user_id = ?'
    ).run(timestamp, req.params.id, userId);
  });

  tx();

  res.status(201).json({
    version: {
      id: versionId,
      versionNumber: nextVer,
      prompt: parsed.data.prompt,
      htmlContent: parsed.data.htmlContent,
      summary: parsed.data.summary,
      createdAt: timestamp,
    },
  });
});

router.post('/projects/:id/messages', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = saveMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: parsed.error.issues[0]?.message ?? 'Invalid message.'});
    return;
  }

  const project = db
    .prepare('SELECT id, name FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as {id: string; name: string} | undefined;
  if (!project) {
    res.status(404).json({error: 'Project not found.'});
    return;
  }

  const timestamp = nowIso();
  let conv = db
    .prepare(
      `SELECT id FROM conversations WHERE project_id = ? AND user_id = ? AND mode = 'agent' LIMIT 1`
    )
    .get(req.params.id, userId) as {id: string} | undefined;

  if (!conv) {
    const convId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO conversations (id, user_id, project_id, title, mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'agent', ?, ?)`
    ).run(convId, userId, req.params.id, project.name, timestamp, timestamp);
    conv = {id: convId};
  }

  const msgId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, user_id, role, content, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '{}', ?, ?)`
  ).run(msgId, conv.id, userId, parsed.data.role, parsed.data.content, timestamp, timestamp);

  res.status(201).json({
    message: {
      id: msgId,
      role: parsed.data.role,
      content: parsed.data.content,
      createdAt: timestamp,
    },
  });
});

export default router;
