export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    penName TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS volume (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chapter (
    id TEXT PRIMARY KEY,
    volumeId TEXT NOT NULL REFERENCES volume(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    outline TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    wordCount INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chapter_snapshot (
    id TEXT PRIMARY KEY,
    chapterId TEXT NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    label TEXT,
    branchId TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS entity (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    fields TEXT NOT NULL DEFAULT '{}',
    description TEXT NOT NULL DEFAULT '',
    rules TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS entity_timeline (
    id TEXT PRIMARY KEY,
    entityId TEXT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
    chapterId TEXT,
    change TEXT NOT NULL DEFAULT '{}',
    note TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS relationship (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    fromEntityId TEXT NOT NULL,
    toEntityId TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '',
    strength INTEGER NOT NULL DEFAULT 0,
    chapterAnchorId TEXT,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS foreshadowing (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planting',
    plantChapterId TEXT,
    simmerRangeStart INTEGER,
    simmerRangeEnd INTEGER,
    payoffChapterId TEXT,
    relatedEntityIds TEXT NOT NULL DEFAULT '[]',
    note TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_request (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    chapterId TEXT,
    kind TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    accepted INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS setting (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_volume_project ON volume(projectId, "order");
  CREATE INDEX IF NOT EXISTS idx_chapter_volume ON chapter(volumeId, "order");
  CREATE INDEX IF NOT EXISTS idx_snapshot_chapter ON chapter_snapshot(chapterId, version);
  `,
  `
  CREATE VIRTUAL TABLE IF NOT EXISTS chapter_fts USING fts5(
    content,
    content='chapter',
    content_rowid='id'
  );
  CREATE TRIGGER IF NOT EXISTS chapter_fts_ai AFTER INSERT ON chapter BEGIN
    INSERT INTO chapter_fts(rowid, content) VALUES (new.id, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS chapter_fts_ad AFTER DELETE ON chapter BEGIN
    INSERT INTO chapter_fts(chapter_fts, rowid, content) VALUES ('delete', old.id, old.content);
  END;
  CREATE TRIGGER IF NOT EXISTS chapter_fts_au AFTER UPDATE ON chapter BEGIN
    INSERT INTO chapter_fts(chapter_fts, rowid, content) VALUES ('delete', old.id, old.content);
    INSERT INTO chapter_fts(rowid, content) VALUES (new.id, new.content);
  END;
  INSERT INTO chapter_fts(rowid, content)
    SELECT id, content FROM chapter
    WHERE id NOT IN (SELECT rowid FROM chapter_fts);
  `,
];
