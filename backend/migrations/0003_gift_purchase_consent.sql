BEGIN IMMEDIATE;

ALTER TABLE gifts ADD COLUMN buyer_consent_at TEXT;
ALTER TABLE gifts ADD COLUMN buyer_consent_doc TEXT;
ALTER TABLE gifts ADD COLUMN privacy_notice_ack INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gifts ADD COLUMN recipient_data_authority INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER IF NOT EXISTS trg_gifts_site_consent_before_insert
BEFORE INSERT ON gifts
WHEN NEW.via = 'сайт' AND (
  NEW.buyer_consent_at IS NULL
  OR NEW.buyer_consent_doc !=
    'consent-request 1.0 · privacy 3.0 · oferta 3.0 · gift form 2.0'
  OR NEW.privacy_notice_ack != 1
  OR (
    NEW.recip_contact IS NOT NULL
    AND length(trim(NEW.recip_contact)) > 0
    AND NEW.recipient_data_authority != 1
  )
)
BEGIN
  SELECT RAISE(ABORT, 'gift purchase consent required');
END;

INSERT INTO schema_migrations(version, applied_at)
VALUES('0003_gift_purchase_consent', strftime('%Y-%m-%dT%H:%M:%S', 'now'));

COMMIT;
