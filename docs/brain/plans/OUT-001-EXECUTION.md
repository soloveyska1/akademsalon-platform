# OUT-001 — execution plan сквозного пути заявки

- Статус: frontend audit complete; production E2E `NO-GO`
- Write-owner: Codex
- Base: `0350ae4a0e95961ddd8f4d77fdc5a4c1a83bb9a4`
- Evidence: `E-0001`
- Scope: `OUT-001`, `JRN-001`, `JRN-003`, `JRN-006`

## Выбранный следующий срез

Сначала привести все публичные producer-ы `POST /orders` к одному проверяемому
контракту. В release98 их два: основной конфигуратор и microlead «Спросите
мастера» на гайдах/в knowledge. Реальный E2E до этого создаст ложное ощущение,
что проверен весь путь, хотя второй вход не имеет request ID и строгого success.

`OUT-002` не входит в этот change-set. Он остаётся следующим outcome после
доказанного `OUT-001`; подтверждённый mobile P2 не требует немедленного редизайна.

## Критерии готовности

### Единый frontend-контракт

1. Machine-readable inventory не позволяет добавить новый `POST /orders` в обход
   canonical helper/contract.
2. Оба producer-а используют стабильный `client_request_id`; повтор после
   неоднозначного исхода сохраняет тот же ключ, а double-click/Enter создают не
   более одного POST intent.
3. Success возможен только после HTTP 2xx, `ok:true` и ID, соответствующего
   документированной server schema и маршрутизации кабинета. Для текущего
   кабинета это положительное целое число или его каноническая decimal-строка.
4. Guest-success имеет явный usable access context: guest session и/или валидный
   одноразовый `claim_url`; экран ведёт к точному созданному делу.
5. Upload сообщает «у мастера» только после подтверждения server identity для
   `order_id` и стабильного `client_file_id`; повтор не создаёт второй файл.
6. Fresh-tab cookie auth обновляет видимый contact state после
   `salon:session-ready`; manual contact не становится скрытым обязательным
   условием для уже авторизованного клиента.
7. Success/failure/upload доступны с клавиатуры: фон ожидания не интерактивен,
   focus предсказуем, ошибки сохраняются, file status объявляется assistive tech.

### Server contract до внешнего submit

Read-only проверка server-кода/схемы или подтверждённая staging-спецификация должна
зафиксировать:

- unique scope и TTL `client_request_id`;
- одинаковый payload + тот же ключ → тот же order ID и ровно одна запись;
- другой payload + тот же ключ → conflict без нового дела;
- transaction/outbox boundary order → event → operator/bot;
- точную response schema, ownership guest/auth и первый статус;
- `test_marker`/`run_id`, read-only поиск по marker/request/order ID;
- очистку order, guest access, uploads, operator queue и bot artifact.

Комментарий фронтенда, старый audit или model review не заменяют эту проверку.

## Proof plan

| Фаза | Действие | Доказательство | Переход дальше |
|---|---|---|---|
| 0. Read-only | карта producer/consumer, parity, локальные gates | `E-0001`, 430/430 | выполнено |
| 1. Contract tests | route interception без сети: 2xx/4xx/409/429/5xx, bad JSON/ID, delayed response, reload, double submit, auth, upload | количество POST, request-key lifecycle, UI/focus, exact ID | P0/P1=0 |
| 2. Server preflight | read-only схема, idempotency/outbox/cleanup contract | ссылки на код/миграцию/runbook без секретов | marker и cleanup однозначны |
| 3. Staging | один synthetic marker; byte-equivalent replay того же request ID | одна DB row, один event/outbox, тот же ID в operator/bot/cabinet, статус `new` | cardinality=1 во всех системах |
| 4. Accessibility | 360/390/768/1024/1440, light/dark, reduced motion, keyboard, 200% zoom | focus, live errors/status, 44 px, contrast, no overflow | G6 зелёный |
| 5. Production | только после явного согласования: один marker в выделенной test identity/channel | redacted network trace, exact admin row, bot/operator, кабинет, первый статус | затем cleanup verification |

В кабинете новый order на 390 px должен показать в первом viewport точный ID,
честный первый статус и либо одно действие, либо явное «от вас ничего не
требуется». Это не разрешает редизайн других состояний активного дела в OUT-001.

## Test marker и cleanup

Предпочтителен отдельный server field `test_marker` с форматом
`OUT001-<UTC-run-id>`. Пока он не подтверждён, fallback marker допускается только
в выделенном окружении/канале:

- name: `OUT-001 TEST`;
- topic: `[TEST OUT-001 <UTC-run-id>] DO NOT PROCESS`;
- details: `synthetic; no payment; cleanup required`.

Контакт принадлежит только выделенной test identity и не фиксируется в evidence.
Request ID хранится в evidence только как hash/suffix, если он нужен для
корреляции.

Cleanup всегда выбирает exact immutable order ID после сверки marker и отсутствия
платежей. Сначала допустима обратимая корзина через `/admin/orders/flag` с
`delete:1`; permanent `purge:1` — только после отдельного подтверждения точной
цели. После cleanup нужны отрицательные проверки admin/cabinet/access/uploads и
явный результат по operator/bot artifact. Если notification нельзя изолировать
или очистить, production-фаза запрещена.

## Stop conditions

- branch/base/dirty state не зафиксированы;
- live static/server version разошлись;
- нет test identity, isolated operator/bot channel, marker или exact cleanup;
- server dedupe/outbox semantics остаются неизвестными;
- ответ success не даёт usable ID/access или дело отсутствует в кабинете;
- появился второй order/event/notification либо разные ID;
- неизвестен первый статус или notification попал реальному клиенту;
- cleanup выбирает больше одного exact ID, затрагивает оплату или требует
  импровизированного удаления;
- evidence содержит контакт, токен, OAuth-код, клиентский текст или файл;
- обнаружен P0/P1 или hard accessibility failure.

## Риски и rollback

- Главный риск — неоднозначный POST уже создал order, а UI/ручной fallback создаёт
  второй канал. До доказанной server idempotency fault injection выполняется
  только локально/staging.
- Bot может оставить необратимый artifact даже после purge order. Поэтому нужен
  dedicated channel либо staging.
- В текущем change-set нет deploy и data mutation: rollback кода не требуется,
  документационный diff обратим.
- Для будущего frontend/server release rollback target — текущий проверенный
  release98; API-изменения должны быть backward-compatible. Test-data rollback —
  exact cleanup и отрицательная проверка, не массовое удаление.

## Один точный следующий шаг

Получить read-only server-side доказательство schema/idempotency/outbox/cleanup
для `POST /orders` и одновременно подготовить локальный failing contract test,
который обнаруживает обход canonical helper обоими текущими producer-ами.
