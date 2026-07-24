BEGIN IMMEDIATE;

ALTER TABLE reviews ADD COLUMN publication_consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN publication_consent_at TEXT;
ALTER TABLE reviews ADD COLUMN publication_consent_doc TEXT;
ALTER TABLE reviews ADD COLUMN publication_categories TEXT;
ALTER TABLE reviews ADD COLUMN publication_author INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN publication_screenshot INTEGER NOT NULL DEFAULT 0;

-- Старые отзывы не содержат доказательства отдельного согласия. Они остаются
-- в базе, но снимаются с публичной выдачи до нового осознанного согласия.
UPDATE reviews
SET status = 'pending', moderated_at = NULL
WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_reviews_public
ON reviews(status, publication_consent, id DESC);

CREATE TRIGGER IF NOT EXISTS trg_reviews_consent_before_insert
BEFORE INSERT ON reviews
WHEN NEW.status = 'approved' AND (
  NEW.publication_consent != 1
  OR NEW.publication_consent_at IS NULL
  OR length(trim(NEW.publication_consent_at)) = 0
  OR NEW.publication_consent_doc IS NULL
  OR length(trim(NEW.publication_consent_doc)) = 0
  OR NEW.publication_consent_doc != 'consent-publication 1.0 · akademsalon.ru'
)
BEGIN
  SELECT RAISE(ABORT, 'review publication consent required');
END;

CREATE TRIGGER IF NOT EXISTS trg_reviews_consent_before_update
BEFORE UPDATE OF status, publication_consent, publication_consent_at,
  publication_consent_doc ON reviews
WHEN NEW.status = 'approved' AND (
  NEW.publication_consent != 1
  OR NEW.publication_consent_at IS NULL
  OR length(trim(NEW.publication_consent_at)) = 0
  OR NEW.publication_consent_doc IS NULL
  OR length(trim(NEW.publication_consent_doc)) = 0
  OR NEW.publication_consent_doc != 'consent-publication 1.0 · akademsalon.ru'
)
BEGIN
  SELECT RAISE(ABORT, 'review publication consent required');
END;

INSERT INTO schema_migrations(version, applied_at)
VALUES('0001_review_publication_consent', strftime('%Y-%m-%dT%H:%M:%S', 'now'));

COMMIT;
