# Workstream handoff

- Branch: `codex/out-006-analytics-v2-core`
- Outcomes: `OUT-006`
- Goal: заменить недостоверную legacy-аналитику отдельной privacy-safe серией
  v2: единый контракт событий, идемпотентный server ingest, серверные агрегаты
  одного периода и понятная русская панель администратора.
- Acceptance: frontend/backend/admin используют один schema version и совпадающие
  allowlist; повтор `event_id` не меняет счётчики; конверсия не превышает 100%;
  24 часа/7/30/90 дней считаются сервером целиком; источники, страницы,
  переходы, устройства, приблизительная география, воронка, ошибки, сессии и
  качество доставки видны без IP, raw UA, контакта, заказа или содержимого
  полей; отказ запрещает новый сбор и запускает подтверждаемое удаление raw v2.
- Proof: failure-first Node/Python contract tests, browser smoke на 390/1024/1440,
  `./bin/brain test`, `./bin/brain validate --strict`, независимые privacy/UX
  reviews, затем production backup/restore, synthetic exact-count smoke,
  revoke/cleanup proof и rollback. Durable evidence: `E-1015`.
- Changed: none yet.
- Unverified: implementation и production rollout не начаты; старая серия
  считается legacy/untrusted и не должна смешиваться с v2.
- Risks/rollback: приватные `dashboard.html` и `zayavka.html`, а также
  зарезервированные другим workstream `app.js` и home bundle не меняются;
  backend выпускать аддитивно после проверенного SQLite backup/restore; при
  сбое отключить v2 routes/static entrypoints и вернуть прежние неизменяемые
  артефакты, не удаляя новые таблицы на горячую.
- Next: review and commit the manifest plus this handoff.
