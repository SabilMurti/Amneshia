export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'personal',
  visibility TEXT NOT NULL DEFAULT 'public',
  allowed_agents TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source TEXT,
  importance TEXT NOT NULL DEFAULT 'normal',
  confidence REAL NOT NULL DEFAULT 1.0,
  authority_tier TEXT NOT NULL DEFAULT 'contextual' CHECK(authority_tier IN ('invariant', 'architectural', 'contextual', 'ephemeral')),
  derived_from TEXT NOT NULL DEFAULT '[]',
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'stale', 'invalidated', 'superseded', 'decayed')),
  expires_at TEXT,
  supersedes TEXT REFERENCES observations(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  from_entity TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(from_entity, to_entity, relation_type)
);

CREATE TABLE IF NOT EXISTS observation_history (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  old_content TEXT NOT NULL,
  new_content TEXT NOT NULL,
  changed_by TEXT,
  changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'markdown',
  auto_export INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contradiction_log (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL,
  conflicting_observation_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  resolution TEXT CHECK(resolution IN ('override', 'kept_both', 'rejected', NULL)),
  detected_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS access_log (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  observation_id TEXT,
  accessed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(entity_id, sha256)
);

CREATE INDEX IF NOT EXISTS idx_obs_entity_status ON observations(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_obs_authority ON observations(authority_tier);
CREATE INDEX IF NOT EXISTS idx_obs_status ON observations(status);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity);
CREATE INDEX IF NOT EXISTS idx_access_log_obs ON access_log(observation_id);
CREATE INDEX IF NOT EXISTS idx_contradiction_entity ON contradiction_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_media_entity ON media_assets(entity_id);
CREATE INDEX IF NOT EXISTS idx_media_sha256 ON media_assets(sha256);

CREATE TABLE IF NOT EXISTS observation_embeddings (
  observation_id TEXT PRIMARY KEY REFERENCES observations(id) ON DELETE CASCADE,
  dimensions INTEGER NOT NULL,
  vector BLOB NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_obs_emb_model ON observation_embeddings(model);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  entity_name,
  entity_type,
  observation_content,
  observation_id UNINDEXED,
  entity_id UNINDEXED,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
  INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id)
  SELECT e.name, e.entity_type, NEW.content, NEW.id, NEW.entity_id
  FROM entities e
  WHERE e.id = NEW.entity_id;
END;

CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
  DELETE FROM memory_fts WHERE observation_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
  DELETE FROM memory_fts WHERE observation_id = OLD.id;
  INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id)
  SELECT e.name, e.entity_type, NEW.content, NEW.id, NEW.entity_id
  FROM entities e
  WHERE e.id = NEW.entity_id;
END;

CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id)
  VALUES (NEW.name, NEW.entity_type, NEW.name || ' ' || NEW.entity_type, NULL, NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
  DELETE FROM memory_fts WHERE observation_id IS NULL AND entity_id = OLD.id;
  INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id)
  VALUES (NEW.name, NEW.entity_type, NEW.name || ' ' || NEW.entity_type, NULL, NEW.id);
  UPDATE observations SET updated_at = updated_at WHERE entity_id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
  DELETE FROM memory_fts WHERE entity_id = OLD.id;
END;
`;
