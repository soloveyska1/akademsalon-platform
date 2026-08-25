# START HERE — Академический Салон

Последнее обновление: 25 августа 2026 г.

## Текущая истина

- Production: <https://akademsalon.ru/?v=release169>
- Закрытое превью: <https://akademsalon-desktop-preview.saymoon.chatgpt.site/?v=38>
- Production release: `release169-51f3556`
- Production source: `51f3556210d2821df17829d4b7776ad2f1dee948`
- Проверенный privacy result: `1011060c9b2f30b55809ab9bb253ae64cf811925`
- Проверенный Analytics v2 result: `9e09e986d91779f6de95f4677c6437e0b088eaf3`.
- Проверенный master-parity result: `10fce082029dd198a770272fa8ec642b438825f0`.
- Проверенный quote-scope result: `5ef9b235d970969b5479d1708a1fdb7e9b3c0db6`.
- Проверенный practice-price result: `89a2887eff51561e519c1357e5da88046b9c9d9c`.
- Проверенный practice-continuity result: `34e10367eac4f7451b56bbe01753ff00e9dffce2`.
- Проверенный practice-passport result: `29376844dc9691f0f9f8f40dbd83ebcdc0f2d1ee`.
- Проверенный practice mobile-dock result: `c8afde5c2199a8d19c5cab01acb31e7fc99d506d`.
- Проверенный practice Browser Back result: `89ddeed5744c428a09d0096b1b37621538a3ff72`.
- Проверенный keyboard-action-shelf result: `8adcfb4543f7388f7b03403007771d63dae1e19f`.
- Проверенный private-checkpoint result: `eb60be42dcf773f42553c737db92f92b4efcfd8e`.
- Проверенный admin-auth recovery result: `cc9cfed21c3ebebba386d6962954fc85f8a87df7`.
- Проверенный first-order promo result: `157d6f7a0507bb091d313acce7412c751ca9bce9`.
- Проверенный material promo economics result: `bd2334f2459f106ebea15241359101164ab5c7bd`.
- Проверенный SQLite recovery result: `1101c16c1fd68d65c6999d3d16f9815284eb4015`.
- Проверенный, но не опубликованный September entry candidate:
  `1ee9533df1d677c34b44c95bf8e13ec9a7cda5e3`.
- Каноническая integration-ветка: `origin/main`
- Текущую task-ветку и точный HEAD всегда брать из `brain context`/`brain doctor`, а не из этого файла.
- Static rollback: `release168-afe4755`; static production — release169.
- Backend promo result: coherent six-source economics v2, including
  `webapp.py` `346a41ea…f735` and `promo.py` `b10967c0…8a00`; rollback copy
  `/root/salon_bot/backups/first-order-promo-economics-20260824T120008432055Z`.
  Analytics v2 contract остаётся 2.3.0.
- Backend SQLite REL-0170 установлен как exact ten-source set. Обычные записи
  идут через отдельный autocommit writer, shared reader работает `query_only`,
  а multi-write операции используют isolated transactions. Финальный rollback
  copy —
  `/root/salon_bot/backups/sqlite-recovery-20260825T030859216319Z`; SQLite
  snapshot для этого инцидента восстанавливать запрещено.
- REL-0170 имеет G10 GO: детерминированно воспроизведён и устранён
  `SQLITE_BUSY_SNAPSHOT`, два review дали P0=0/P1=0, production Python 18/18,
  backend 76/76, public 603/603 и Brain 39/39. Exact source rollback и forward
  выполнены; финальный PID стабилен 158 секунд с `NRestarts=0`, journal errors
  0, `quick_check=ok`, external/VPS smoke 14/14. Точная запись:
  [releases/REL-0170.md](releases/REL-0170.md).
- REL-0171 — не production-релиз, а проверенный кандидат первого входа. WebP
  уменьшает eligible median bytes на 70,2% без изменения Lighthouse score/LCP;
  старые, failed-eligibility и returning посетители не загружают artwork,
  owner preview остаётся безопасным. Public 606/606, Brain 39/39 и двенадцать
  Chromium/WebKit eligibility/fallback cases зелёные. Полный сентябрьский G10
  остаётся NO-GO из-за deposit/referral contract mismatch, legal confirmations
  и отдельного UX-долга. Точная запись: [releases/REL-0171.md](releases/REL-0171.md),
  доказательства: [evidence/E-1033.md](evidence/E-1033.md).
- REL-0169 имеет G10 GO: `ПЕРВЫЙЛИСТ` даёт ощутимые 12% от 2 500 RUB с
  потолком 5 000 RUB, а квалифицированное удержание — 10% от 5 000 RUB с
  потолком 2 500 RUB на 72 часа. Старые пользователи подавляются, owner preview
  ничего не активирует, promo/Salon+ работают best-of, а общая выгода вместе с
  потраченными баллами ограничена 25%. Три review дали P0=0/P1=0; public
  603/603, backend 19/19, Kladovaya 277/277, Brain 39/39, production Chromium,
  smoke 14/14 с двух vantage и все rollback-forward зелёные. Точная запись:
  [releases/REL-0169.md](releases/REL-0169.md).
- REL-0168 имеет G10 GO: новые посетители Салона и Кладовой видят фирменный
  лист `ПЕРВЫЙЛИСТ`, старые и уже использовавшие серию подавляются, удержание
  ограничено 1%/1 000 RUB/72 часами, а сервер повторно проверяет первый заказ
  атомарно. Три review дали P0=0/P1=0; public 602/602, backend 47/47,
  Kladovaya 277/277, production Chromium, external/VPS smoke 14/14 и
  backend/Salon/Kladovaya rollback-forward зелёные. Точная запись:
  [releases/REL-0168.md](releases/REL-0168.md).
- REL-0167 имеет G10 GO: просроченная или отозванная HttpOnly session-cookie
  больше не блокирует новый Telegram-вход через CSRF `403`. Исключение строго
  ограничено exact `POST /api/auth/start` и не ослабляет valid-session CSRF или
  другие unsafe routes. Focused 8/8, backend 39/39, site 596/596, Brain 39/39;
  production stale-cookie matrix, исходная вкладка, exact hashes, service,
  Nginx, SQLite и выполненный backend rollback/forward зелёные. Точная запись:
  [releases/REL-0167.md](releases/REL-0167.md).
- Release166 имеет G10 GO: контакт, согласие и файлы не сохраняются; если
  обязательный временный файл исчез после reload, все пути возвращают только к
  материалам с видимым объяснением, сохраняя scope, срок, корзину и цену.
  Повторное вложение или описание от 40 знаков возобновляет путь. Site 596/596,
  backend 31/31, Brain 39/39, production 360/390 без overflow, POST и
  storage-residue, external/VPS smoke 14/14 после выпуска, в выполненном
  rollback на release165 и после forward restore. Точная запись:
  [releases/REL-0166.md](releases/REL-0166.md).
- Release165 имеет G10 GO: при открытой мобильной клавиатуре активное поле,
  причина валидации и единственный primary остаются доступными; на границе
  39/40 → 40/40 тот же primary включается без потери фокуса. Цены, маршруты,
  submit-контракт, backend и Analytics не менялись. Site 592/592, backend
  31/31, Chromium/WebKit 6/6, production 360/390 без overflow и POST,
  external/VPS smoke 14/14 после выпуска, в выполненном rollback на release164
  и после forward restore. Точная запись:
  [releases/REL-0165.md](releases/REL-0165.md).
- Release164 имеет G10 GO: ближайшее мобильное действие сохраняет выбранный
  объём практики 2 500/8 000/14 000 RUB, не затирает существующий черновик и
  восстанавливается вместе с radio/status после specification -> Browser Back.
  Site 592/592, backend 31/31, Brain 39/39, production Chromium 360/390
  light/dark без overflow/console errors, external/VPS smoke 14/14 после
  выпуска, в выполненном rollback на release162 и после forward restore.
  Точная запись: [releases/REL-0164.md](releases/REL-0164.md).
- Release163 был снят с production по G10 P1: после Browser Back видимый
  support от 14 000 RUB расходился с мобильным editing-route. Немедленный
  rollback вернул release162 и smoke 14/14; неуспешный immutable artifact
  остаётся только для аудита. Точная запись:
  [releases/REL-0163.md](releases/REL-0163.md).
- Release162 имеет G10 GO: при выборе сопровождения от 14 000 RUB до контакта
  раскрывается паспорт с реальными входами, четырьмя проверяемыми результатами,
  границами авторства, исключениями и точным смыслом цены; варианты 2 500/8 000
  не перегружены им. Site 590/590, backend 31/31, Brain 39/39, 390/1440
  light/dark без overflow/console errors, external/VPS smoke 14/14 после
  выпуска, в выполненном rollback на release161 и после forward restore. Точная
  запись: [releases/REL-0162.md](releases/REL-0162.md).
- Release161 имеет G10 GO: выбранные разбор, редактура и сопровождение практики
  сохраняют точный результат, входные материалы и границы через конфигуратор,
  request и предоплатную спецификацию. Site 589/589, backend 31/31, Brain
  39/39, 390/1440 light/dark без overflow/console errors, external/VPS smoke
  14/14 после выпуска, в выполненном rollback на release160 и после forward
  restore. Точная запись: [releases/REL-0161.md](releases/REL-0161.md).
- Release160 имеет G10 GO: три объёма практики и их цена видны до контакта,
  `draft+support` непрерывен до конфигуратора, site 584/584, backend 31/31,
  Brain 39/39, 390/1440 light/dark без overflow/console errors, external/VPS
  smoke 14/14 после выпуска, в выполненном rollback на release159 и после
  forward restore. Точная запись: [releases/REL-0160.md](releases/REL-0160.md).
- Release159 имеет G10 GO: site 580/580, backend 31/31, Brain 39/39, exact live
  hashes, 360/390/1024/1440 light/dark без overflow/console errors, zero-residue
  synthetic contract proof и external/VPS smoke 14/14 после выпуска, в полном
  rollback на release158 + contract 2.2.0 и после backend-first forward restore.
  Точная запись: [releases/REL-0159.md](releases/REL-0159.md).
- 3 августа после release103 исправлен production-wide отказ
  заявок и подарочных форм: backend оставался на privacy/oferta
  3.0/3.0 при опубликованных 3.1/3.2. Активные константы выровнены,
  сервис active, VPS read-only smoke 14/14; реальная тестовая заявка
  не создавалась. Точная запись: [evidence/E-1013.md](evidence/E-1013.md).
- 20–21 августа устранён ложный всплеск 502: остановленный соседний vhost
  проксировал сканеры в отсутствующий 4310, а Салон-дозор читал общий лог всего
  VPS. Kiskispace теперь локально отвечает 404, `akademsalon.ru` имеет отдельный
  privacy-safe log и PHP reject, duplicate enabled backup удалён; external/VPS
  smoke 14/14 и rollback/forward проверены. Static release/backend не менялись.
  Точная запись: [evidence/E-1017.md](evidence/E-1017.md).
- 21 августа повторный сигнал локализован как 500 честных `404` за 12 секунд
  при `5xx=0` и без совпадающей consented-сессии. Raw public 404 больше не
  создаёт alert, суточный health-счётчик или throttle; проверка настоящих 5xx
  сохранена без изменения. Live 50-request threshold, smoke 14/14 с двух
  vantage и watcher rollback/forward зелёные; release/backend не менялись.
  Точная запись: [evidence/E-1018.md](evidence/E-1018.md).

## Главная цель продукта

Клиент быстро понимает, какая помощь подходит именно сейчас, видит первый
проверяемый результат, условия и следующий шаг, а после обращения всегда понимает
состояние своего дела. Интерфейс сохраняет фирменный стиль «Оттиск»: взрослая
редакционная подача, тёплая бумага, графит, сургучный акцент, компактность и один
главный CTA на смысловой экран.

## NOW

1. Для следующего лида по практике давать прямую ссылку
   `/otchet-po-praktike.html#service-price` и обсуждать выбранный объём, а не
   защищать 14 000 RUB как цену той же редактуры. Выбранный объём теперь должен
   совпадать с паспортом, первым экраном и спецификацией; цену не снижать и
   uplift по факту релиза не обещать.
2. Продолжить OUT-008 следующим отдельным измерением, не переписывая экран
   целиком: проверить, понимает ли клиент на Contact, что произойдёт после
   нажатия и когда он получит первый содержательный ответ. Приватность,
   обязательные материалы и восстановление после reload уже закрыты
   release166; новую механику открывать только по воспроизводимому P0/P1 и
   отдельному bounded-плану.
3. Аналитику и админку не развивать в текущем product-фокусе. Позже измерять
   только достаточный органический consented sample по заранее выбранному окну;
   до этого не заявлять conversion uplift.
4. `OUT-001` — не выполнять production submit, пока не появятся безопасные
   marker/lookup/cleanup и authoritative backend/bot evidence.

`OUT-002`, `OUT-003`, `OUT-004` и `OUT-005` verified; точные implementation/evidence SHA
находятся в `ROADMAP.md` и `CURRENT-HANDOFF.md`.

Подробности: [ROADMAP.md](ROADMAP.md). Карта: [PRODUCT-MAP.md](PRODUCT-MAP.md).

## Защищённые решения

- Главная и конфигуратор ведут через одно основное действие; каталог остаётся справочником.
- Светлая и тёмная темы сохраняют роли палитры «Оттиск», а не копируют буквальные цвета.
- Успех заявки показывается только после подтверждённого ответа сервера.
- Production не активирует demo-fixtures; реальные мутации не выполняются во время визуального аудита.
- Клиентские тексты, контакты, файлы и OAuth-артефакты не попадают в product analytics или project brain.
- Модельный совет создаёт гипотезы; решение принимает write-owner по evidence и gate-критериям.

## Где что искать

- [PRODUCT-MAP.md](PRODUCT-MAP.md) — поверхности и ключевые клиентские пути.
- [ROADMAP.md](ROADMAP.md) — NOW/NEXT/LATER и критерии outcomes.
- [DECISIONS.md](DECISIONS.md) — принятые и пересматриваемые решения.
- [UX-DEBT.md](UX-DEBT.md) — единый реестр подтверждённых дефектов.
- [QUALITY-GATES.md](QUALITY-GATES.md) — условия GO/NO-GO.
- [MODEL-COUNCIL.md](MODEL-COUNCIL.md) — роли моделей и бюджет вызовов.
- [CURRENT-HANDOFF.md](CURRENT-HANDOFF.md) — актуальная передача следующей сессии.
- [plans/BRAIN-15-MVP.md](plans/BRAIN-15-MVP.md) — контракт атомарного контекста и локальной безопасности параллельных веток.
- [workstream-policy.json](workstream-policy.json) — разрешённые semantic namespaces и proof IDs; executable-команд здесь нет.
- [releases/REL-0170.md](releases/REL-0170.md) — доказательная запись текущего GO-релиза.
- [../../ops/monitoring/README.md](../../ops/monitoring/README.md) — контракт
  изоляции Nginx virtual hosts и Салон-дозора на общем VPS.

## Старт новой сессии

```bash
./bin/brain context --task "следующая цель"
./bin/brain validate --strict
./bin/council --doctor --providers kimi,sonnet,glm,opus,fable --allow-fable
```

После этого выберите один outcome, зафиксируйте acceptance criteria и proof plan.
Редизайн допустим, когда воспроизводимая проблема или измерение показывает его
необходимость; решение всё равно проходит независимые review и quality gates.

## Новая параллельная ветка без ручного manifest

Сначала обновите локальное знание remote и создайте ветку от точного canonical:

```bash
git fetch origin
git switch -c codex/out-002-active-case origin/codex/full-reference-production
./bin/brain workstream init \
  --outcome OUT-002 \
  --slug out-002-active-case \
  --write-exact assets/js/cabinet.js \
  --semantic-write ui-state:cabinet-active-case
```

Флаги `--write-exact`, `--write-tree`, `--read-exact`, `--read-tree` и semantic
scope можно повторять. Команда сама фиксирует branch, exact canonical SHA,
безопасный UUID и allowlisted proof IDs; она откажется работать на dirty или
stacked branch. Она также создаёт branch-local `HANDOFF.md` и сама включает его в
write scope. Заполните его, добавьте в Git ровно два напечатанных файла,
закоммитьте declaration и выполните `./bin/brain conflicts --strict`.

После реализации и детерминированных gates на чистом worktree:

```bash
./bin/brain workstream set-status submitted
```

Снова добавьте только exact manifest path и закоммитьте submission revision.

`submitted` замораживает implementation HEAD в `result_sha`. После включения
этого SHA и submission commit в свежий canonical ref integration owner либо
возвращается на исходную task-ветку, либо на exact canonical checkout передаёт
`--manifest`. Затем он переводит workstream в `integrated`, коммитит terminal
revision и ещё раз fast-forward интегрирует только этот closure commit.
`./bin/brain workstream status` показывает полный path/semantic/proof scope;
status/hash вручную не меняют.

Старый live manifest schema v1 переводится только командой
`./bin/brain workstream migrate`: она не принимает внешний SHA, вычисляет hash
предыдущей revision и безопасно переоткрывает legacy `submitted` как `active`.
Свежий `result_sha` появится лишь после нового проверенного implementation commit.

Canonical proof-ID registry не исполняется из manifest:

- `brain:test` → `python3 -m unittest discover -s tools/brain/tests -p 'test_*.py' -v`;
- `brain:validate` → `./bin/brain validate --strict`.

В параллельной ветке обновляйте собственный `workstreams/<WS>/HANDOFF.md`.
`CURRENT-HANDOFF.md`, `DECISIONS.md` и другие singleton-реестры изменяет только
ветка, явно зарезервировавшая их; иначе durable итог последовательно переносит
integration owner. Так обязательная память не превращается в гарантированный
merge conflict.

`brain conflicts` не делает fetch и не обещает знания об unfetched/unpushed
работе. Он читает manifests и фактические diffs доступных локальных refs,
проверяет active/detached worktrees и сообщает `decision`, `blocking`, counts и
точный `NEXT`. Непересекающиеся dormant/environment observations идут как INFO и
не блокируют bootstrap. HARD нельзя подавить; warnings (реальный dormant overlap,
невалидный/неизвестный active state) разрешает только осознанный integration owner
на bootstrap либо непосредственно перед интеграцией. Перед обоими scan нужен
свежий `git fetch origin`, потому что Brain намеренно не делает сеть.

`record_schema_version: 1` в `catalog.json` означает additive-only Markdown
contract: существующие ID и обязательные поля не меняются молча. Новый record-kind
или breaking field требует новой версии, миграционного теста на весь corpus и
отдельного `DEC-*`. Любой невалидный active manifest намеренно блокирует
`validate/context/doctor` для всего tree: это fail-closed blast radius, а не
локальное предупреждение.
