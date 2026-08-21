# START HERE — Академический Салон

Последнее обновление: 21 августа 2026 г.

## Текущая истина

- Production: <https://akademsalon.ru/?v=release158>
- Закрытое превью: <https://akademsalon-desktop-preview.saymoon.chatgpt.site/?v=release98>
- Production release: `release158-fa2b317`
- Production source: `fa2b317f8e99abcc7917a9d867407c460d82b9b6`
- Проверенный privacy result: `1011060c9b2f30b55809ab9bb253ae64cf811925`
- Проверенный Analytics v2 result: `9e09e986d91779f6de95f4677c6437e0b088eaf3`.
- Проверенный master-parity result: `10fce082029dd198a770272fa8ec642b438825f0`.
- Каноническая integration-ветка: `origin/main`
- Текущую task-ветку и точный HEAD всегда брать из `brain context`/`brain doctor`, а не из этого файла.
- Static rollback: `release157-c891d24`; backend остаётся release157. Полный
  pre-v2 backend rollback сохранён в `REL-0157`.
- Release158 имеет G10 GO: site 563/563, backend 30/30, Brain 39/39, три
  независимых P0/P1 review GO, точные live SHA/CSP/403 и external/VPS smoke
  14/14 до выпуска, после выпуска, в выполненном static rollback и после
  forward restore. Точная запись: [releases/REL-0158.md](releases/REL-0158.md).
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

1. Открыть авторизованную Analytics v2 в `/admin-analytics.html` и подтвердить
   первый естественный consented-сеанс; не подмешивать legacy history.
2. Получить от пользователя повторный результат его реальной заявки
   после исправления `E-1013`; агенты сами production submit не выполняют.
   Затем отдельно закрыть stale-page copy/classification и версию 3.0 в
   `consent-request.html`.
3. `OUT-001` — не выполнять production submit, пока не появятся безопасные
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
- [releases/REL-0158.md](releases/REL-0158.md) — доказательная запись текущего GO-релиза.
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
