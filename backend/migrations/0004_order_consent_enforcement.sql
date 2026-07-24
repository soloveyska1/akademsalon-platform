BEGIN IMMEDIATE;

CREATE TRIGGER IF NOT EXISTS trg_orders_site_consent_before_insert
BEFORE INSERT ON orders
WHEN NEW.source = 'сайт' AND (
  NEW.consent_at IS NULL
  OR NEW.consent_doc != 'consent-request 1.0 · privacy 3.0 · oferta 3.0'
)
BEGIN
  SELECT RAISE(ABORT, 'order consent required');
END;

CREATE TRIGGER IF NOT EXISTS trg_orders_site_consent_before_update
BEFORE UPDATE OF consent_at, consent_doc ON orders
WHEN NEW.source = 'сайт' AND (
  NEW.consent_at IS NULL
  OR NEW.consent_doc != 'consent-request 1.0 · privacy 3.0 · oferta 3.0'
)
BEGIN
  SELECT RAISE(ABORT, 'order consent required');
END;

INSERT INTO schema_migrations(version, applied_at)
VALUES('0004_order_consent_enforcement', strftime('%Y-%m-%dT%H:%M:%S', 'now'));

COMMIT;
