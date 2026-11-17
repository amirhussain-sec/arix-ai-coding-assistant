import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, {recursive: true});
}

const dbPath = path.join(dataDir, 'arix.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    google_sub TEXT UNIQUE,
    auth_provider TEXT NOT NULL DEFAULT 'email',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    preferred_language TEXT NOT NULL DEFAULT 'typescript',
    avatar_color TEXT NOT NULL DEFAULT '#4f6bff',
    onboarded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Web',
    primary_language TEXT NOT NULL DEFAULT 'typescript',
    is_agent_project INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'typescript',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_id, path)
  );

  CREATE TABLE IF NOT EXISTS agent_versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    html_content TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    mode TEXT NOT NULL DEFAULT 'chat',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS run_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    language TEXT NOT NULL,
    code_snippet TEXT NOT NULL DEFAULT '',
    stdout TEXT NOT NULL DEFAULT '',
    stderr TEXT NOT NULL DEFAULT '',
    exit_code INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    is_ai_predicted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'general',
    tokens_estimate INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'dark',
    editor_font_size INTEGER NOT NULL DEFAULT 14,
    voice_name TEXT NOT NULL DEFAULT '',
    voice_rate REAL NOT NULL DEFAULT 1.0,
    voice_pitch REAL NOT NULL DEFAULT 1.0,
    voice_preset TEXT NOT NULL DEFAULT 'Natural',
    auto_read_replies INTEGER NOT NULL DEFAULT 0,
    auto_send_speech INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
  CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_project_files_user_id ON project_files(user_id);
  CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);
  CREATE INDEX IF NOT EXISTS idx_project_files_created_at ON project_files(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id, user_id);

  CREATE INDEX IF NOT EXISTS idx_agent_versions_user_id ON agent_versions(user_id);
  CREATE INDEX IF NOT EXISTS idx_agent_versions_project_id ON agent_versions(project_id);
  CREATE INDEX IF NOT EXISTS idx_agent_versions_created_at ON agent_versions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_versions_project ON agent_versions(project_id, user_id, version_number DESC);

  CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, user_id, created_at ASC);

  CREATE INDEX IF NOT EXISTS idx_run_history_user_id ON run_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_run_history_project_id ON run_history(project_id);
  CREATE INDEX IF NOT EXISTS idx_run_history_created_at ON run_history(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_run_history_user_created ON run_history(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage(user_id);
  CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage(user_id, created_at DESC);
`);

export function nowIso(): string {
  return new Date().toISOString();
}
