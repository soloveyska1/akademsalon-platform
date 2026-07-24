BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS payment_receipts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  inv_id INTEGER NOT NULL,
  scope TEXT NOT NULL,
  scope_id INTEGER NOT NULL,
  order_id INTEGER,
  user_id INTEGER,
  payment_id INTEGER,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  buyer_email TEXT,
  receipt_payload TEXT NOT NULL,
  receipt_payload_sha256 TEXT NOT NULL,
  expires_at TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  fiscal_status TEXT NOT NULL DEFAULT 'not_paid',
  effects_status TEXT NOT NULL DEFAULT 'pending',
  effects_updated_at TEXT,
  effects_error TEXT,
  provider_operation_key TEXT,
  provider_payment_method TEXT,
  fiscal_url TEXT,
  paid_at TEXT,
  confirmation_email_at TEXT,
  confirmation_tg_at TEXT,
  confirmation_email_attempted_at TEXT,
  confirmation_tg_attempted_at TEXT,
  confirmation_email_attempts INTEGER NOT NULL DEFAULT 0,
  confirmation_tg_attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, inv_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_order
ON payment_receipts(order_id, paid_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_receipts_payment
ON payment_receipts(payment_id) WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_receipts_delivery
ON payment_receipts(payment_status, confirmation_email_at, confirmation_tg_at);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_effects
ON payment_receipts(payment_status, effects_status, effects_updated_at);

INSERT INTO schema_migrations(version, applied_at)
VALUES('0006_payment_receipts', strftime('%Y-%m-%dT%H:%M:%S', 'now'));

COMMIT;
