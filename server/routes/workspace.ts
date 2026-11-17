import crypto from 'node:crypto';
import {Router} from 'express';
import {z} from 'zod';
import {clearSessionCookie, requireAuth, type AuthenticatedRequest} from '../auth.ts';
import {db, nowIso} from '../db.ts';

const router = Router();
router.use(requireAuth);

const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name is required.')
    .max(60, 'Display name must be 60 characters or fewer.'),
  preferredLanguage: z.string().trim().min(1).max(32),
  onboarded: z.boolean().optional(),
});

const updateSettingsSchema = z.object({
  theme: z.enum(['dark', 'light']).optional(),
  editorFontSize: z.number().int().min(11).max(24).optional(),
  voiceName: z.string().max(120).optional(),
  voiceRate: z.number().min(0.5).max(2).optional(),
  voicePitch: z.number().min(0.5).max(2).optional(),
  voicePreset: z.string().max(40).optional(),
  autoReadReplies: z.boolean().optional(),
  autoSendSpeech: z.boolean().optional(),
});

const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Project name is required.')
    .max(80, 'Project name must be 80 characters or fewer.'),
  description: z.string().trim().max(300).default(''),
  primaryLanguage: z.string().trim().min(1).max(32),
  category: z.enum(['Web', 'Python', 'JavaScript', 'Other']).default('Web'),
  starterFile: z.string().trim().min(1).max(120).default('main.ts'),
  starterContent: z.string().max(250000).default(''),
  files: z
    .array(
      z.object({
        path: z.string().trim().min(1).max(160),
        content: z.string().max(250000),
        language: z.string().trim().min(1).max(32),
      })
    )
    .optional(),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).optional(),
});

const createFileSchema = z.object({
  path: z.string().trim().min(1).max(160),
  content: z.string().max(250000).default(''),
  language: z.string().trim().min(1).max(32).default('typescript'),
});

const updateFileSchema = z.object({
  path: z.string().trim().min(1).max(160).optional(),
  content: z.string().max(250000).optional(),
  language: z.string().trim().min(1).max(32).optional(),
});

const recordRunSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  language: z.string().trim().min(1).max(32),
  codeSnippet: z.string().max(100000),
  stdout: z.string().max(100000).default(''),
  stderr: z.string().max(100000).default(''),
  exitCode: z.number().int().default(0),
  durationMs: z.number().int().min(0).default(0),
  isAiPredicted: z.boolean().default(false),
});

router.patch('/profile', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid profile data.',
    });
    return;
  }

  const timestamp = nowIso();
  const onboardedValue = parsed.data.onboarded ? 1 : 0;

  db.prepare(
    `UPDATE profiles
     SET display_name = ?,
         preferred_language = ?,
         onboarded = CASE WHEN ? = 1 THEN 1 ELSE onboarded END,
         updated_at = ?
     WHERE user_id = ?`
  ).run(
    parsed.data.displayName,
    parsed.data.preferredLanguage,
    onboardedValue,
    timestamp,
    userId
  );

  const updated = db
    .prepare(
      `SELECT
         u.id AS userId,
         u.email,
         u.auth_provider AS authProvider,
         u.created_at AS createdAt,
         p.display_name AS displayName,
         p.preferred_language AS preferredLanguage,
         p.avatar_color AS avatarColor,
         p.onboarded
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`
    )
    .get(userId) as Record<string, unknown> | undefined;

  res.json({
    profile: updated
      ? {
          ...updated,
          onboarded: Boolean(updated.onboarded),
        }
      : null,
  });
});

router.patch('/settings', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid settings payload.',
    });
    return;
  }

  const current = db
    .prepare('SELECT * FROM user_settings WHERE user_id = ?')
    .get(userId) as
    | {
        theme: 'dark' | 'light';
        editor_font_size: number;
        voice_name: string;
        voice_rate: number;
        voice_pitch: number;
        voice_preset: string;
        auto_read_replies: number;
        auto_send_speech: number;
      }
    | undefined;

  if (!current) {
    res.status(404).json({error: 'User settings not found.'});
    return;
  }

  const data = parsed.data;
  const timestamp = nowIso();

  db.prepare(
    `UPDATE user_settings
     SET theme = ?,
         editor_font_size = ?,
         voice_name = ?,
         voice_rate = ?,
         voice_pitch = ?,
         voice_preset = ?,
         auto_read_replies = ?,
         auto_send_speech = ?,
         updated_at = ?
     WHERE user_id = ?`
  ).run(
    data.theme ?? current.theme,
    data.editorFontSize ?? current.editor_font_size,
    data.voiceName ?? current.voice_name,
    data.voiceRate ?? current.voice_rate,
    data.voicePitch ?? current.voice_pitch,
    data.voicePreset ?? current.voice_preset,
    data.autoReadReplies !== undefined
      ? data.autoReadReplies
        ? 1
        : 0
      : current.auto_read_replies,
    data.autoSendSpeech !== undefined
      ? data.autoSendSpeech
        ? 1
        : 0
      : current.auto_send_speech,
    timestamp,
    userId
  );

  res.json({
    settings: {
      theme: data.theme ?? current.theme,
      editorFontSize: data.editorFontSize ?? current.editor_font_size,
      voiceName: data.voiceName ?? current.voice_name,
      voiceRate: data.voiceRate ?? current.voice_rate,
      voicePitch: data.voicePitch ?? current.voice_pitch,
      voicePreset: data.voicePreset ?? current.voice_preset,
      autoReadReplies:
        data.autoReadReplies !== undefined
          ? data.autoReadReplies
          : Boolean(current.auto_read_replies),
      autoSendSpeech:
        data.autoSendSpeech !== undefined
          ? data.autoSendSpeech
          : Boolean(current.auto_send_speech),
    },
  });
});

router.get('/dashboard', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;

  const projectCountRow = db
    .prepare('SELECT COUNT(*) AS count FROM projects WHERE user_id = ?')
    .get(userId) as {count: number};
  const runCountRow = db
    .prepare('SELECT COUNT(*) AS count FROM run_history WHERE user_id = ?')
    .get(userId) as {count: number};
  const aiCountRow = db
    .prepare('SELECT COUNT(*) AS count FROM ai_usage WHERE user_id = ?')
    .get(userId) as {count: number};

  const recentProjectRows = db
    .prepare(
      `SELECT
         p.id,
         p.name,
         p.description,
         p.category,
         p.primary_language AS primaryLanguage,
         p.is_agent_project AS isAgentProject,
         p.created_at AS createdAt,
         p.updated_at AS updatedAt,
         COUNT(pf.id) AS fileCount,
         COALESCE(SUM(CASE WHEN pf.content = '' THEN 0 ELSE LENGTH(pf.content) - LENGTH(REPLACE(pf.content, CHAR(10), '')) + 1 END), 0) AS lineCount
       FROM projects p
       LEFT JOIN project_files pf ON pf.project_id = p.id AND pf.user_id = p.user_id
       WHERE p.user_id = ?
       GROUP BY p.id
       ORDER BY p.updated_at DESC
       LIMIT 6`
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    primaryLanguage: string;
    isAgentProject: number;
    createdAt: string;
    updatedAt: string;
    fileCount: number;
    lineCount: number;
  }>;

  const recentAiRows = db
    .prepare(
      `SELECT id, mode, language, status, created_at AS createdAt
       FROM ai_usage
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 6`
    )
    .all(userId) as Array<{
    id: string;
    mode: string;
    language: string;
    status: string;
    createdAt: string;
  }>;

  const recentRunRows = db
    .prepare(
      `SELECT id, language, exit_code AS exitCode, duration_ms AS durationMs, created_at AS createdAt
       FROM run_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 6`
    )
    .all(userId) as Array<{
    id: string;
    language: string;
    exitCode: number;
    durationMs: number;
    createdAt: string;
  }>;

  const recentProjectActivity = recentProjectRows.slice(0, 4).map((p) => ({
    id: `proj-${p.id}`,
    type: 'project' as const,
    title: `Saved project "${p.name}"`,
    detail: `${p.fileCount} ${p.fileCount === 1 ? 'file' : 'files'}`,
    language: p.primaryLanguage,
    createdAt: p.updatedAt,
  }));

  const recentAiActivity = recentAiRows.map((a) => ({
    id: `ai-${a.id}`,
    type: 'ai' as const,
    title: `AI ${a.mode} request`,
    detail: a.status,
    language: a.language,
    createdAt: a.createdAt,
  }));

  const recentRunActivity = recentRunRows.map((r) => ({
    id: `run-${r.id}`,
    type: 'run' as const,
    title: `Executed ${r.language} code`,
    detail: r.exitCode === 0 ? `Completed in ${r.durationMs}ms` : `Exit ${r.exitCode}`,
    language: r.language,
    createdAt: r.createdAt,
  }));

  const recentActivity = [
    ...recentAiActivity,
    ...recentRunActivity,
    ...recentProjectActivity,
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const usageRows = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
       FROM ai_usage
       WHERE user_id = ?
         AND created_at >= ?
       GROUP BY day`
    )
    .all(
      userId,
      new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    ) as Array<{day: string; count: number}>;

  const usageMap = new Map(usageRows.map((r) => [r.day, r.count]));
  const usageChart = Array.from({length: 7}, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    const isoDay = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', {weekday: 'short'});
    return {
      date: isoDay,
      label,
      count: usageMap.get(isoDay) ?? 0,
    };
  });

  res.json({
    stats: {
      totalProjects: projectCountRow.count,
      codeExecutions: runCountRow.count,
      aiRequests: aiCountRow.count,
      historyEntries: runCountRow.count + aiCountRow.count,
    },
    recentProjects: recentProjectRows.map((p) => ({
      ...p,
      isAgentProject: Boolean(p.isAgentProject),
    })),
    recentActivity,
    usageChart,
  });
});

router.get('/projects', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const fieldsMode = req.query.fields === 'summary' ? 'summary' : 'full';
  const rawPage = Number(req.query.page ?? 1);
  const rawLimit = Number(req.query.limit ?? 20);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), 50)
      : 20;
  const offset = (page - 1) * limit;

  const searchQ = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const category =
    typeof req.query.category === 'string' && req.query.category !== 'All'
      ? req.query.category
      : '';
  const sort =
    req.query.sort === 'name' || req.query.sort === 'files'
      ? req.query.sort
      : 'recent';

  if (fieldsMode === 'summary') {
    const summaryRows = db
      .prepare(
        `SELECT id, name, primary_language AS primaryLanguage, is_agent_project AS isAgentProject
         FROM projects
         WHERE user_id = ?
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(userId, limit, offset) as Array<Record<string, unknown>>;

    res.json({
      projects: summaryRows.map((row) => ({
        ...row,
        isAgentProject: Boolean(row.isAgentProject),
      })),
    });
    return;
  }

  const whereParts = ['p.user_id = ?'];
  const params: Array<string | number> = [userId];

  if (category) {
    whereParts.push('p.category = ?');
    params.push(category);
  }

  if (searchQ) {
    const likePattern = `%${searchQ}%`;
    whereParts.push('(p.name LIKE ? OR p.description LIKE ?)');
    params.push(likePattern, likePattern);
  }

  const whereSql = whereParts.join(' AND ');
  const orderSql =
    sort === 'name'
      ? 'p.name COLLATE NOCASE ASC'
      : sort === 'files'
        ? 'fileCount DESC, p.updated_at DESC'
        : 'p.updated_at DESC';

  const countRow = db
    .prepare(`SELECT COUNT(*) AS count FROM projects p WHERE ${whereSql}`)
    .get(...params) as {count: number};
  const total = countRow.count;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const totalsRow = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM projects WHERE user_id = ?) AS totalProjects,
         (SELECT COUNT(*) FROM project_files WHERE user_id = ?) AS totalFiles,
         (SELECT COALESCE(SUM(CASE WHEN content = '' THEN 0 ELSE LENGTH(content) - LENGTH(REPLACE(content, CHAR(10), '')) + 1 END), 0) FROM project_files WHERE user_id = ?) AS totalLines`
    )
    .get(userId, userId, userId) as {
    totalProjects: number;
    totalFiles: number;
    totalLines: number;
  };

  const rows = db
    .prepare(
      `SELECT
         p.id,
         p.name,
         p.description,
         p.category,
         p.primary_language AS primaryLanguage,
         p.is_agent_project AS isAgentProject,
         p.created_at AS createdAt,
         p.updated_at AS updatedAt,
         COUNT(pf.id) AS fileCount,
         COALESCE(SUM(CASE WHEN pf.content = '' THEN 0 ELSE LENGTH(pf.content) - LENGTH(REPLACE(pf.content, CHAR(10), '')) + 1 END), 0) AS lineCount
       FROM projects p
       LEFT JOIN project_files pf ON pf.project_id = p.id AND pf.user_id = p.user_id
       WHERE ${whereSql}
       GROUP BY p.id
       ORDER BY ${orderSql}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Array<Record<string, unknown>>;

  const previewStmt = db.prepare(
    `SELECT path, substr(content, 1, 2000) AS previewContent
     FROM project_files
     WHERE project_id = ? AND user_id = ?
     ORDER BY CASE WHEN path = 'index.html' THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`
  );
  const pathsStmt = db.prepare(
    `SELECT path
     FROM project_files
     WHERE project_id = ? AND user_id = ?
     ORDER BY created_at ASC
     LIMIT 3`
  );

  const enriched = rows.map((row) => {
    const projectId = String(row.id);
    const previewFile = previewStmt.get(projectId, userId) as
      | {path: string; previewContent: string}
      | undefined;

    const fileList = pathsStmt.all(projectId, userId) as Array<{path: string}>;

    return {
      ...row,
      isAgentProject: Boolean(row.isAgentProject),
      previewContent: previewFile?.previewContent ?? '',
      previewPath: previewFile?.path ?? '',
      filePaths: fileList.map((f) => f.path),
    };
  });

  res.json({
    projects: enriched,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
    totals: {
      projects: totalsRow.totalProjects,
      files: totalsRow.totalFiles,
      lines: totalsRow.totalLines,
    },
  });
});

router.post('/projects', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid project payload.',
    });
    return;
  }

  const projectId = crypto.randomUUID();
  const timestamp = nowIso();
  const data = parsed.data;
  const filesToInsert =
    data.files && data.files.length > 0
      ? data.files
      : [
          {
            path: data.starterFile,
            content: data.starterContent,
            language: data.primaryLanguage,
          },
        ];

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO projects (id, user_id, name, description, category, primary_language, is_agent_project, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      projectId,
      userId,
      data.name,
      data.description,
      data.category,
      data.primaryLanguage,
      timestamp,
      timestamp
    );

    const insertFileStmt = db.prepare(
      `INSERT INTO project_files (id, project_id, user_id, path, content, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const file of filesToInsert) {
      insertFileStmt.run(
        crypto.randomUUID(),
        projectId,
        userId,
        file.path,
        file.content,
        file.language,
        timestamp,
        timestamp
      );
    }
  });

  tx();

  const lineCount = filesToInsert.reduce(
    (sum, f) => sum + (f.content ? f.content.split('\n').length : 0),
    0
  );

  res.status(201).json({
    project: {
      id: projectId,
      name: data.name,
      description: data.description,
      category: data.category,
      primaryLanguage: data.primaryLanguage,
      isAgentProject: false,
      fileCount: filesToInsert.length,
      lineCount,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
});

router.get('/projects/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const project = db
    .prepare(
      `SELECT id, name, description, category, primary_language AS primaryLanguage, is_agent_project AS isAgentProject, created_at AS createdAt, updated_at AS updatedAt
       FROM projects
       WHERE id = ? AND user_id = ?`
    )
    .get(req.params.id, userId) as Record<string, unknown> | undefined;

  if (!project) {
    res.status(404).json({error: 'Project not found.'});
    return;
  }

  const files = db
    .prepare(
      `SELECT id, path, content, language, created_at AS createdAt, updated_at AS updatedAt
       FROM project_files
       WHERE project_id = ? AND user_id = ?
       ORDER BY path ASC`
    )
    .all(req.params.id, userId);

  res.json({
    project: {
      ...project,
      isAgentProject: Boolean(project.isAgentProject),
    },
    files,
  });
});

router.patch('/projects/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: parsed.error.issues[0]?.message ?? 'Invalid project update.'});
    return;
  }

  const existing = db
    .prepare('SELECT id, name, description FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as
    | {id: string; name: string; description: string}
    | undefined;
  if (!existing) {
    res.status(404).json({error: 'Project not found.'});
    return;
  }

  const timestamp = nowIso();
  db.prepare(
    'UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  ).run(
    parsed.data.name ?? existing.name,
    parsed.data.description ?? existing.description,
    timestamp,
    req.params.id,
    userId
  );

  res.json({ok: true});
});

router.delete('/projects/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const result = db
    .prepare('DELETE FROM projects WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);
  if (result.changes === 0) {
    res.status(404).json({error: 'Project not found.'});
    return;
  }
  res.json({ok: true});
});

router.post('/projects/:id/duplicate', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const orig = db
    .prepare(
      'SELECT id, name, description, category, primary_language, is_agent_project FROM projects WHERE id = ? AND user_id = ?'
    )
    .get(req.params.id, userId) as
    | {
        id: string;
        name: string;
        description: string;
        category: string;
        primary_language: string;
        is_agent_project: number;
      }
    | undefined;

  if (!orig) {
    res.status(404).json({error: 'Project not found.'});
    return;
  }

  const files = db
    .prepare(
      'SELECT path, content, language FROM project_files WHERE project_id = ? AND user_id = ?'
    )
    .all(orig.id, userId) as Array<{path: string; content: string; language: string}>;

  const newId = crypto.randomUUID();
  const timestamp = nowIso();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO projects (id, user_id, name, description, category, primary_language, is_agent_project, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId,
      userId,
      `${orig.name} (Copy)`,
      orig.description,
      orig.category,
      orig.primary_language,
      orig.is_agent_project,
      timestamp,
      timestamp
    );

    const ins = db.prepare(
      `INSERT INTO project_files (id, project_id, user_id, path, content, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const f of files) {
      ins.run(crypto.randomUUID(), newId, userId, f.path, f.content, f.language, timestamp, timestamp);
    }
  });

  tx();

  res.status(201).json({id: newId});
});

router.post('/projects/:id/files', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = createFileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: parsed.error.issues[0]?.message ?? 'Invalid file data.'});
    return;
  }

  const proj = db
    .prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId);
  if (!proj) {
    res.status(404).json({error: 'Project not found.'});
    return;
  }

  const existing = db
    .prepare(
      'SELECT id FROM project_files WHERE project_id = ? AND user_id = ? AND path = ?'
    )
    .get(req.params.id, userId, parsed.data.path);
  if (existing) {
    res.status(409).json({error: `A file named "${parsed.data.path}" already exists in this project.`});
    return;
  }

  const fileId = crypto.randomUUID();
  const timestamp = nowIso();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO project_files (id, project_id, user_id, path, content, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      fileId,
      req.params.id,
      userId,
      parsed.data.path,
      parsed.data.content,
      parsed.data.language,
      timestamp,
      timestamp
    );
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ? AND user_id = ?').run(
      timestamp,
      req.params.id,
      userId
    );
  });

  tx();

  res.status(201).json({
    file: {
      id: fileId,
      path: parsed.data.path,
      content: parsed.data.content,
      language: parsed.data.language,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
});

router.patch('/projects/:id/files/:fileId', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = updateFileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: parsed.error.issues[0]?.message ?? 'Invalid file update.'});
    return;
  }

  const file = db
    .prepare(
      'SELECT id, path, content, language FROM project_files WHERE id = ? AND project_id = ? AND user_id = ?'
    )
    .get(req.params.fileId, req.params.id, userId) as
    | {id: string; path: string; content: string; language: string}
    | undefined;

  if (!file) {
    res.status(404).json({error: 'File not found.'});
    return;
  }

  const timestamp = nowIso();
  const nextPath = parsed.data.path ?? file.path;

  if (nextPath !== file.path) {
    const clash = db
      .prepare(
        'SELECT id FROM project_files WHERE project_id = ? AND user_id = ? AND path = ? AND id != ?'
      )
      .get(req.params.id, userId, nextPath, file.id);
    if (clash) {
      res.status(409).json({error: `File "${nextPath}" already exists.`});
      return;
    }
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE project_files SET path = ?, content = ?, language = ?, updated_at = ?
       WHERE id = ? AND project_id = ? AND user_id = ?`
    ).run(
      nextPath,
      parsed.data.content ?? file.content,
      parsed.data.language ?? file.language,
      timestamp,
      req.params.fileId,
      req.params.id,
      userId
    );

    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ? AND user_id = ?').run(
      timestamp,
      req.params.id,
      userId
    );
  });

  tx();

  res.json({
    file: {
      id: file.id,
      path: nextPath,
      content: parsed.data.content ?? file.content,
      language: parsed.data.language ?? file.language,
      updatedAt: timestamp,
    },
  });
});

router.delete('/projects/:id/files/:fileId', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const result = db
    .prepare('DELETE FROM project_files WHERE id = ? AND project_id = ? AND user_id = ?')
    .run(req.params.fileId, req.params.id, userId);

  if (result.changes === 0) {
    res.status(404).json({error: 'File not found.'});
    return;
  }
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ? AND user_id = ?').run(
    nowIso(),
    req.params.id,
    userId
  );
  res.json({ok: true});
});

router.post('/runs', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const parsed = recordRunSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: parsed.error.issues[0]?.message ?? 'Invalid run record.'});
    return;
  }

  const id = crypto.randomUUID();
  const timestamp = nowIso();

  db.prepare(
    `INSERT INTO run_history (id, user_id, project_id, language, code_snippet, stdout, stderr, exit_code, duration_ms, is_ai_predicted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    parsed.data.projectId ?? null,
    parsed.data.language,
    parsed.data.codeSnippet,
    parsed.data.stdout,
    parsed.data.stderr,
    parsed.data.exitCode,
    parsed.data.durationMs,
    parsed.data.isAiPredicted ? 1 : 0,
    timestamp,
    timestamp
  );

  res.status(201).json({id, createdAt: timestamp});
});

router.get('/history', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const rawPage = Number(req.query.page ?? 1);
  const rawLimit = Number(req.query.limit ?? 20);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), 50)
      : 20;
  const offset = (page - 1) * limit;

  const category =
    req.query.category === 'ai' ||
    req.query.category === 'run' ||
    req.query.category === 'save'
      ? req.query.category
      : 'all';
  const searchQ = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const unionSql = `
    SELECT
      'run-' || id AS id,
      'run' AS category,
      CASE WHEN is_ai_predicted = 1
        THEN 'AI-predicted ' || language || ' execution'
        ELSE 'Executed ' || language || ' code'
      END AS title,
      CASE WHEN exit_code = 0
        THEN 'Completed in ' || duration_ms || 'ms'
        ELSE 'Failed with exit code ' || exit_code
      END AS subtitle,
      language,
      substr(COALESCE(NULLIF(stdout, ''), NULLIF(stderr, ''), code_snippet), 1, 400) AS preview,
      created_at AS createdAt
    FROM run_history
    WHERE user_id = ?

    UNION ALL

    SELECT
      'ai-' || id AS id,
      'ai' AS category,
      'AI ' || mode || ' request' AS title,
      status || ' · ~' || tokens_estimate || ' tokens' AS subtitle,
      language,
      'Mode: ' || mode AS preview,
      created_at AS createdAt
    FROM ai_usage
    WHERE user_id = ?

    UNION ALL

    SELECT
      'save-' || pf.id AS id,
      'save' AS category,
      'Saved ' || pf.path AS title,
      'Project: ' || p.name AS subtitle,
      pf.language AS language,
      p.name || '/' || pf.path AS preview,
      pf.updated_at AS createdAt
    FROM project_files pf
    JOIN projects p ON p.id = pf.project_id
    WHERE pf.user_id = ?
  `;

  const filterClauses: string[] = [];
  const filterParams: string[] = [];
  if (category !== 'all') {
    filterClauses.push('category = ?');
    filterParams.push(category);
  }
  if (searchQ) {
    const likePattern = `%${searchQ}%`;
    filterClauses.push('(title LIKE ? OR language LIKE ? OR subtitle LIKE ?)');
    filterParams.push(likePattern, likePattern, likePattern);
  }
  const whereClause =
    filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : '';

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS count FROM (${unionSql}) AS combined ${whereClause}`
    )
    .get(userId, userId, userId, ...filterParams) as {count: number};

  const total = totalRow.count;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const entries = db
    .prepare(
      `SELECT id, category, title, subtitle, language, preview, createdAt
       FROM (${unionSql}) AS combined
       ${whereClause}
       ORDER BY createdAt DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, userId, userId, ...filterParams, limit, offset) as Array<{
    id: string;
    category: 'run' | 'ai' | 'save';
    title: string;
    subtitle: string;
    language: string;
    preview: string;
    createdAt: string;
  }>;

  res.json({
    entries,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  });
});

router.delete('/history', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM run_history WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM ai_usage WHERE user_id = ?').run(userId);
  });
  tx();
  res.json({ok: true});
});

router.get('/export-all', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const profile = db
    .prepare('SELECT user_id, display_name, preferred_language, created_at FROM profiles WHERE user_id = ?')
    .get(userId);
  const settings = db
    .prepare('SELECT * FROM user_settings WHERE user_id = ?')
    .get(userId);
  const projects = db
    .prepare('SELECT * FROM projects WHERE user_id = ?')
    .all(userId);
  const projectFiles = db
    .prepare('SELECT * FROM project_files WHERE user_id = ?')
    .all(userId);
  const agentVersions = db
    .prepare('SELECT * FROM agent_versions WHERE user_id = ?')
    .all(userId);
  const conversations = db
    .prepare('SELECT * FROM conversations WHERE user_id = ?')
    .all(userId);
  const messages = db
    .prepare('SELECT * FROM messages WHERE user_id = ?')
    .all(userId);
  const runHistory = db
    .prepare('SELECT * FROM run_history WHERE user_id = ?')
    .all(userId);
  const aiUsage = db
    .prepare('SELECT * FROM ai_usage WHERE user_id = ?')
    .all(userId);

  res.json({
    exportedAt: nowIso(),
    profile,
    settings,
    projects,
    projectFiles,
    agentVersions,
    conversations,
    messages,
    runHistory,
    aiUsage,
  });
});

router.delete('/account', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  clearSessionCookie(req, res);
  res.json({ok: true});
});

export default router;
