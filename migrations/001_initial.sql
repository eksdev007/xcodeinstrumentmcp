PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  instrument_family TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  tool_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  snapshot_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  family TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  selection_json TEXT NOT NULL,
  comparability_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(source_id)
);

CREATE TABLE IF NOT EXISTS metrics (
  metric_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  family TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  module TEXT,
  thread_key TEXT,
  interval_key TEXT,
  numeric_value REAL NOT NULL,
  unit TEXT NOT NULL,
  rank INTEGER,
  dimensions_json TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id)
);

CREATE INDEX IF NOT EXISTS idx_metrics_snapshot_id ON metrics (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_metrics_snapshot_metric_type ON metrics (snapshot_id, metric_type);
CREATE INDEX IF NOT EXISTS idx_metrics_family_metric_subject ON metrics (family, metric_type, subject_key);

CREATE TABLE IF NOT EXISTS findings (
  finding_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  family TEXT NOT NULL,
  severity TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  confidence REAL NOT NULL,
  recommendations_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id)
);

CREATE TABLE IF NOT EXISTS comparisons (
  comparison_id TEXT PRIMARY KEY,
  baseline_snapshot_id TEXT NOT NULL,
  candidate_snapshot_id TEXT NOT NULL,
  family TEXT NOT NULL,
  comparable INTEGER NOT NULL,
  compatibility_notes_json TEXT NOT NULL,
  comparison_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comparison_deltas (
  delta_id TEXT PRIMARY KEY,
  comparison_id TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  delta_type TEXT NOT NULL,
  numeric_value REAL NOT NULL,
  unit TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  FOREIGN KEY (comparison_id) REFERENCES comparisons(comparison_id)
);

CREATE TABLE IF NOT EXISTS prompt_packs (
  prompt_pack_id TEXT PRIMARY KEY,
  snapshot_id TEXT,
  comparison_id TEXT,
  family TEXT NOT NULL,
  purpose TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  token_estimate INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  artifact_id TEXT PRIMARY KEY,
  snapshot_id TEXT,
  comparison_id TEXT,
  artifact_type TEXT NOT NULL,
  path TEXT,
  sha256 TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signpost_projects (
  project_id TEXT PRIMARY KEY,
  root_path TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signpost_plans (
  plan_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_snapshot_id TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signpost_patches (
  patch_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  patch_json TEXT NOT NULL,
  applied_at TEXT,
  reverted_at TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('schema_version', '1');
