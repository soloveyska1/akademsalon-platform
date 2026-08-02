# Current handoff

- Objective: подготовить доказуемый `OUT-001` без production-мутации
- Base/head: `0350ae4a0e95961ddd8f4d77fdc5a4c1a83bb9a4`
- Working branch: `codex/out-001-contract-plan`
- Outcome IDs: `OUT-001`, затем `OUT-002`
- Evidence/plan: `E-0001`, `plans/OUT-001-EXECUTION.md`

## Изменено

- Код, UI, production, OAuth и данные не менялись.
- Записана read-only карта producer → API → cabinet/admin и execution plan.
- `DEC-0007` закрепляет единый contract для каждого public `POST /orders`.
- `UXD-0004` фиксирует P1-разрыв guide microlead с canonical submit contract.
- Roadmap уточняет текущий срез внутри `OUT-001`.

## Проверено и чем

- `./bin/brain context`, `doctor`, `processes`: Project Brain готов, сервисы не
  запускались и ничего не остановлено.
- Git: исходный detached HEAD совпадал с `codex/full-reference-production`; перед
  docs-правками создана изолированная ветка `codex/out-001-contract-plan`.
- `node --test tests/*.test.js`: 430/430.
- Анонимные production `GET/HEAD`: health/features/configurator/dashboard отвечают;
  шесть ключевых live-файлов побайтно совпадают с checkout.
- Три независимых read-only review: submit/API/auth/delivery,
  active-case mobile/dark, QA/accessibility/reliability.
- UX-review воспроизвёл существующий `UXD-0002` на 390×844; на 768/1280/1440
  action был в viewport, dark-контраст критических элементов прошёл. Это не
  расширяет текущий scope и не разрешает редизайн.

## Не проверено

- Реальная server-side unique/idempotency semantics `client_request_id`.
- Transaction/outbox boundary order → event → operator/bot.
- Автоматическая bot/operator delivery и первый статус того же order в кабинете.
- Dedicated test identity/channel, machine-readable marker и полная очистка
  order/access/uploads/operator/bot artifacts.
- Fresh-tab cookie auth UI, malformed ID/access response, timeout overlap и
  upload replay в runtime browser tests.
- Production submit намеренно не выполнялся; `tests/production-smoke.js` не
  запускался, потому что содержит `POST /orders` и допускает создание order.

## Новые решения / UX debt

- `DEC-0007`: любой public producer `POST /orders` обязан использовать единый
  idempotency/success/access contract.
- `UXD-0004` P1: guide microlead обходит этот contract; внешний E2E и новый
  release остаются `NO-GO` до исправления и проверки.
- `UXD-0002` остаётся P2 и формирует следующий срез `OUT-002` после `OUT-001`.

## User-owned changes

Основной checkout ветки `codex/full-reference-production` содержит изменённый
`.claude/launch.json` и untracked PNG evidence. Они не читались содержательно,
не менялись и не включены в этот change-set.

## Один следующий шаг

Получить read-only server-side доказательство schema/idempotency/outbox/cleanup
`POST /orders`, затем добавить локальный failing contract test для обоих текущих
producer-ов — без production submit.
