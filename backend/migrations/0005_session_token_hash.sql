BEGIN IMMEDIATE;

ALTER TABLE sessions ADD COLUMN token_hash_version INTEGER NOT NULL DEFAULT 0;

INSERT INTO schema_migrations(version, applied_at)
VALUES('0005_session_token_hash', strftime('%Y-%m-%dT%H:%M:%S', 'now'));

COMMIT;
