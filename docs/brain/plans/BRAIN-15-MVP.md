# BRAIN-15-MVP — Markdown-authoritative graph и локальная безопасность веток

- Статус: implemented-local, deterministic gates green; awaiting integration
- Base: `da0a05e83b0cf98d931820aa1468160e2ac66df0`
- Product anchor: `OUT-001`; это operational workstream, не второй product outcome
- Write-owner: Codex root
- Independent review: schema/context, conflict safety, QA/security
- Remote/production mutations: запрещены

Daily council Kimi+Sonnet+GLM привёл к strict-by-default bootstrap и явной
record-schema policy. Один Opus review выбрал вариант A и нашёл policy/comparator
fail-open; mismatch устранён policy-driven сравнением и отдельным regression test.
Model observations не являются hard-gate evidence.

## Решение и граница MVP

Markdown в `docs/brain` остаётся единственной долговечной product truth. Brain
детерминированно извлекает records `OUT/JRN/SUR/DEC/UXD/E/REL`, их полные
атомарные блоки и generic `links` по явным ID-ссылкам. Производный граф и поиск
живут только в ignored `.brain/index.sqlite`.

Отдельный tracked typed graph сейчас не вводится: он создал бы второй источник
связей и новый merge hotspot. Семантические типы связи остаются будущей миграцией
после доказанного index-only MVP. Единственный новый tracked machine contract —
workstream manifest: base, owner, read/write paths, controlled semantic scope и
allowlisted proof IDs. Brain не исполняет значения manifest.

В scope:

1. Strict `brain validate --strict` для catalog, Markdown records и manifests.
2. Derived SQLite v2: records, generic links, atomic blocks и provenance.
3. `brain map --id OUT-001` без домысла о типе связи.
4. Atomic `brain context --task ... [--id OUT-001]`: никаких byte slices;
   полный included/omitted ledger; mandatory record overflow fail closed.
5. Read-only `brain conflicts --manifest ...`: no fetch/write/index; path,
   semantic, base, scope drift и unmanaged worktree evidence.
6. Symlink/path/privacy/strict-JSON/atomic-index hardening.
7. Python stdlib golden tests и package scripts.

Не в scope: remote leases, auto-renew, merge queue, force-push protection,
автоматический merge/rebase, production writes, local LLM, daemon, inferred
`proves/closes/depends_on`, гарантия для unfetched/unpushed/undeclared работы.

## Acceptance и proof

- `validate --strict` не принимает duplicate/ambiguous IDs, dangling numeric
  references, wrong owner, invalid UTF-8, symlink escape, malformed/duplicate-key
  JSON, raw commands, privacy signatures или unsafe paths.
- `doctor`, `refresh` и canonical-ID `context` fail closed при invalid truth.
- OUT-001 context содержит целый seed и связанные rows/sections; output не
  превышает budget; omitted records перечислены; ни один record/code fence не
  обрезан.
- Одинаковый tree даёт byte-identical map/context и digest.
- Failed/oversized index build не заменяет предыдущую исправную DB; `.brain`
  имеет mode 0700, DB/temp — 0600; `.brain` symlink запрещён.
- `conflicts` ловит write/write, write/read, exact/tree, case/NFC aliases,
  exclusive semantic claims, stale/diverged base, scope escape и foreign dirty
  overlap. Read/read и полностью disjoint scope проходят.
- Вывод conflicts называется только `CLEAR_LOCAL_SNAPSHOT*`, перечисляет SHA и
  пределы проверки; отсутствие manifest/semantic scope не выдаётся за global safe.
- CLI `conflicts` обнаруживает manifest текущей ветки и трактует warnings как
  non-zero по умолчанию; `--allow-warnings` является явным решением integration owner.
- Ни одна команда MVP не делает network, checkout, stash, reset, prune,
  update-ref, push и не исполняет proof strings.
- `python3 -m unittest discover -s tools/brain/tests -p 'test_*.py' -v`, полный
  repository test suite, `brain validate`, `brain doctor` и diff check зелёные.

## Stop conditions

- canonical record прочитан/записан через symlink или вне repo;
- secret/client material появляется в diagnostic/index;
- mandatory blocker скрыт budget-ом или record частично обрезан;
- model-review или co-occurrence объявлены доказательством hard gate;
- overlapping dirty/workstream scope назван clear;
- conflicts меняет refs/worktree/`.brain` или вызывает сеть;
- неудачная сборка уничтожает предыдущий индекс;
- для одного ID появляется два authoritative источника.

Один битый active `manifest.json` намеренно останавливает global
`validate/context/doctor` на содержащем его tree. Это fail-closed trade-off с
широким blast radius: manifest исправляют или recoverable-откатывают, но не
игнорируют для продолжения с частичной картой.

`GIT_OPTIONAL_LOCKS=0` применяется только к read-only Git-командам Brain, чтобы
они не refresh-или shared index во время snapshot scan. Это не отключает Git
locking у commit/merge и не создаёт remote concurrency guarantee.

## Rollback

Один изолированный Brain 1.5 commit откатывается `git revert <exact-commit>`.
Product/runtime/deploy rollback не нужен. Никогда не удалять `.brain` целиком:
`.brain/council` принадлежит отдельной подсистеме. Пересоздаётся только exact
Brain-owned `index.sqlite` через проверенный atomic replace.

## Integration note

Локальный `codex/out-001-contract-plan` уже меняет Brain singleton docs и потому
является реальным path conflict. Brain 1.5 не объявляет ветки независимыми:
integration owner должен последовательно replay/cherry-pick change-sets на свежий
canonical и повторить validate/conflicts/tests на resulting tree.

## Следующие слои после доказанного MVP

Это roadmap системы памяти, а не уже реализованные гарантии:

1. **Brain 1.6 · branch cockpit.** Единый read-only отчёт по active manifests:
   владелец, base/head, declared scope, dirty drift, hard conflicts, proof state и
   точная очередь интеграции. Он по-прежнему не обещает знание unfetched work.
2. **Brain 1.7 · handoff freshness.** Машинная проверка, что current handoff
   ссылается на точный commit/tree, перечисляет unverified и один next step;
   устаревший handoff видимо маркируется, а не молча попадает в context.
3. **Brain 2.0 · explicit typed edges.** Только после corpus и миграционного
   теста добавить authored `depends_on/proves/closes/affects`; generic
   co-occurrence не повышается до семантики автоматически, у каждого edge есть
   owner и provenance.
4. **Brain 2.1 · role packs.** Детерминированные профили context для UX,
   reliability, release и product review с одним seed, safety floor и общей
   omission ledger — без копий product truth.
5. **Brain 2.2 · proof graph.** Allowlisted proof ID связывается с хешем
   воспроизводимого результата и gate, но модельный review остаётся observation,
   а production evidence хранит только безопасные metadata.
6. **Brain 3.0 · coordinated integration.** Remote lease/merge queue возможны
   только как отдельная система с authenticated actor, TTL, audit trail и
   recoverable rollback. Локальный `CLEAR_LOCAL_SNAPSHOT` никогда не переименовывается
   в глобальную гарантию.
