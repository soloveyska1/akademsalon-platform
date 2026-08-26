BEGIN IMMEDIATE;

ALTER TABLE orders ADD COLUMN synthetic INTEGER NOT NULL DEFAULT 0
  CHECK(synthetic IN (0,1));
ALTER TABLE orders ADD COLUMN test_run_id TEXT;
ALTER TABLE orders ADD COLUMN synthetic_run_hash TEXT;
ALTER TABLE orders ADD COLUMN synthetic_sink TEXT;

CREATE UNIQUE INDEX idx_orders_out001_run
  ON orders(test_run_id) WHERE synthetic=1;
CREATE UNIQUE INDEX idx_orders_out001_run_hash
  ON orders(synthetic_run_hash) WHERE synthetic=1;

CREATE TABLE synthetic_delivery_receipts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  run_hash TEXT NOT NULL UNIQUE,
  sink TEXT NOT NULL CHECK(sink='isolated-out001'),
  receipt_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  CHECK(length(run_hash)=64 AND run_hash NOT GLOB '*[^0-9a-f]*'),
  CHECK(length(receipt_key)=64 AND receipt_key NOT GLOB '*[^0-9a-f]*')
);

CREATE TABLE synthetic_probe_tombstones(
  run_hash TEXT PRIMARY KEY,
  tuple_hash TEXT NOT NULL UNIQUE,
  proof_digest TEXT NOT NULL,
  surface_mask INTEGER NOT NULL CHECK(surface_mask BETWEEN 0 AND 1023),
  contract_version INTEGER NOT NULL CHECK(contract_version=1),
  result TEXT NOT NULL CHECK(result='cleaned'),
  cleaned_at TEXT NOT NULL,
  CHECK(length(run_hash)=64 AND run_hash NOT GLOB '*[^0-9a-f]*'),
  CHECK(length(tuple_hash)=64 AND tuple_hash NOT GLOB '*[^0-9a-f]*'),
  CHECK(length(proof_digest)=64 AND proof_digest NOT GLOB '*[^0-9a-f]*')
);

CREATE TRIGGER out001_order_insert_guard
BEFORE INSERT ON orders
WHEN NOT (
  (NEW.synthetic=0 AND NEW.test_run_id IS NULL
   AND NEW.synthetic_run_hash IS NULL AND NEW.synthetic_sink IS NULL)
  OR
  (NEW.synthetic=1
   AND length(NEW.test_run_id)=39
   AND substr(NEW.test_run_id,1,7)='out001_'
   AND substr(NEW.test_run_id,8) NOT GLOB '*[^0-9a-f]*'
   AND length(NEW.synthetic_run_hash)=64
   AND NEW.synthetic_run_hash NOT GLOB '*[^0-9a-f]*'
   AND NEW.synthetic_sink='isolated-out001'
   AND NOT EXISTS (
     SELECT 1 FROM synthetic_probe_tombstones t
     WHERE t.run_hash=NEW.synthetic_run_hash
   )
   AND NEW.status='new' AND NEW.source='сайт'
   AND NEW.work_type='custom'
   AND NEW.guest_name='OUT-001 probe'
   AND NEW.topic='OUT-001 delivery probe'
   AND NEW.details='Synthetic fixture; no customer content.'
   AND NEW.page='out001://synthetic-e2e'
   AND NEW.user_id IS NULL AND NEW.guest_contact IS NULL
   AND NEW.deadline_text IS NULL
   AND NEW.quote_low IS NULL AND NEW.quote_high IS NULL
   AND NEW.price IS NULL AND NEW.prepay IS NULL
   AND coalesce(NEW.bonus_spent,0)=0
   AND NEW.promo_code IS NULL AND coalesce(NEW.promo_discount,0)=0
   AND coalesce(NEW.sub_discount,0)=0
   AND NEW.gift_code IS NULL AND coalesce(NEW.gift_amount,0)=0
   AND NEW.ref_hint IS NULL AND NEW.deadline_date IS NULL
   AND NEW.topic_id IS NULL AND NEW.handoff_artifact_id IS NULL
   AND NEW.handoff_phase IS NULL AND coalesce(NEW.handoff_version,0)=0
   AND coalesce(NEW.archived_client,0)=0
   AND coalesce(NEW.archived_admin,0)=0
   AND coalesce(NEW.paused,0)=0 AND NEW.paused_by IS NULL
   AND NEW.paused_at IS NULL AND coalesce(NEW.pinned_client,0)=0
   AND coalesce(NEW.pinned_admin,0)=0
   AND coalesce(NEW.final_ready,0)=0 AND NEW.final_ready_at IS NULL
   AND coalesce(NEW.part_ready,0)=0 AND coalesce(NEW.parts_done,0)=0
   AND NEW.admin_note IS NULL AND NEW.cancel_reason IS NULL
   AND length(NEW.client_request_id)=44
   AND substr(NEW.client_request_id,1,4)='syn_'
   AND substr(NEW.client_request_id,5) NOT GLOB '*[^0-9a-f]*'
   AND NEW.request_fingerprint IS NOT NULL
   AND NEW.access_token IS NOT NULL AND NEW.access_token_digest IS NOT NULL
   AND NEW.consent_at IS NOT NULL AND NEW.consent_doc IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT,'out001 synthetic invariant');
END;

CREATE TRIGGER out001_order_immutable
BEFORE UPDATE ON orders
WHEN OLD.synthetic=1 OR NEW.synthetic=1
BEGIN
  SELECT RAISE(ABORT,'out001 synthetic immutable');
END;

CREATE TRIGGER out001_order_marker_guard
BEFORE UPDATE OF synthetic,test_run_id,synthetic_run_hash,synthetic_sink ON orders
WHEN OLD.synthetic IS NOT NEW.synthetic
  OR OLD.test_run_id IS NOT NEW.test_run_id
  OR OLD.synthetic_run_hash IS NOT NEW.synthetic_run_hash
  OR OLD.synthetic_sink IS NOT NEW.synthetic_sink
BEGIN
  SELECT RAISE(ABORT,'out001 marker immutable');
END;

INSERT INTO schema_migrations(version,applied_at)
VALUES('0010_out001_synthetic',strftime('%Y-%m-%dT%H:%M:%S','now'));

COMMIT;
