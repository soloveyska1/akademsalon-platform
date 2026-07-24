BEGIN IMMEDIATE;

ALTER TABLE sessions ADD COLUMN expires_at TEXT;
ALTER TABLE sessions ADD COLUMN revoked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_expiry
ON sessions(expires_at, last_used_at);

INSERT INTO schema_migrations(version, applied_at)
VALUES('0002_session_expiry', strftime('%Y-%m-%dT%H:%M:%S', 'now'));

COMMIT;
