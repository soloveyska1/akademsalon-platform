# Material store, 10 September 2026

The normal path is automatic: existing authenticated account → immutable quote and
15-minute licence hold → Robokassa → signed ResultURL / signed status reconciliation
→ account entitlement → durable email or Telegram delivery. Full customer files
live only in `/var/lib/academic-material-store/private`; previews are separate PNGs.

The store owns a separate SQLite database. Never restore it over newer purchases.
The ordinary Salon database retains the existing receipt audit. No old payment
namespace, session, order, wallet or promotion is replaced.

## Opening checkout

`catalogue.json.checkout_enabled` alone cannot open payment. The existing merchant
must be enabled, production mode must be active and Password3 must be configured.
Isolated test credentials and the precise Indexjson form must be verified first.
The initial deployment is a closed catalogue; it contains no synthetic purchase,
account, price, document or payment fixture. Real payment and receipt readback are
still required before advertising an open shop.

A private positive-integer `verification_owner_id` in that manifest allows only
the matching existing account to complete this real purchase while public
`checkout_enabled` remains false. Banned and impersonated sessions are excluded;
all merchant, production-mode and refund-key guards still apply. The customer
accepts the ordinary terms and pays the unchanged price through the ordinary UI.
Do not synthesize consent, purchases, payments or entitlements in production.
Remove this temporary owner field when opening checkout after the readback.
To close all new payments again, set `checkout_enabled=false` and remove
`verification_owner_id`; restart the service to reload the private manifest.

The 10 September provider probe found that Indexjson signs raw Return URL values.
The percent-encoded Index.aspx example produced error29 here; raw URL signatures
were accepted and a Robokassa demo payment returned to `shop.html#purchases`.
This proves test invoice and redirect behavior, not cash settlement or a receipt.

## Failure handling

- Checkout and callback replay are idempotent. A late paid invoice either receives
  its finite licence or enters `paid_unallocated` and requests a full refund.
- A licence remains held during an unknown provider state. Provider errors rotate
  the reconciliation queue; one batch cannot starve later purchases.
- Refund/Create has no documented idempotency key. An ambiguous outcome is retained
  as `creating`/`needs_review`, never retried as another money movement.
- Outbox retries are automatic. Email has ordinary at-least-once delivery semantics;
  retry cannot grant another licence or award bonuses again.
- The refund API exposes GetState by requestId, not an invoice-wide refund listing.
  Refunds initiated outside this application therefore require merchant evidence.
  They are not claimed to be automatically discoverable.

Host-only status: `python -m app.material_store.admin status`.
For a verified external refund, the host administrator supplies a private JSON
evidence file with `invoice_id`, `operation_key`, `request_id` and a
`merchant_reference` from the merchant operation detail, then runs
`python -m app.material_store.admin reconcile-refund PURCHASE_ID --evidence FILE`.
The command checks invoice amount/namespace remotely and GetState, binds the
merchant evidence hash, restores spent bonuses, reverses earned rewards and revokes
future downloads on full refund. Evidence cannot be supplied by a public customer
endpoint. The command does not create a refund.

## Economics and inventory

Five genuinely finite personal nonexclusive licences per immutable version. A sold
licence is not restocked after a file has been delivered. Additional versions must
be materially described; never create cosmetic versions to fake scarcity.
Prices: 1490 / 1190 / 790 / 690 RUB. Maximum monetary discount plus spent bonuses is
10%; earned rewards are at most 5% of cash paid. Browsing and unpaid holds earn no
rewards. The seasonal 5% code is repeatable through September 30, Moscow time.

## Rollback

Installer pins the exact live webapp hash and saves a source-only backup. Static
deployment overlays only the new shop files on the current release. Existing pages
and their hashes are retained. Before any customer payment, source rollback can
restore the saved webapp and static symlink. After sales begin, disable new checkout
first and keep callback/reconciliation/download handlers available for existing
invoices and purchases; never blindly remove the backend or restore SQLite.
