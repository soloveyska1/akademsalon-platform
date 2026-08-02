# BRAIN-15-MVP — Markdown-authoritative graph и локальная безопасность веток

- Статус: integration candidate; final gates and canonical fast-forward pending
- Base: `da0a05e83b0cf98d931820aa1468160e2ac66df0`
- Product anchor: `OUT-001`; это operational workstream, не второй product outcome
- Write-owner: Codex root
- Independent review: schema/context, conflict safety, QA/security
- Git-origin integration: явно разрешена пользователем; production/OAuth/deploy/data mutations запрещены

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
   semantic, base, scope drift, manifests из локальных branch refs и active/
   detached worktree evidence.
6. Symlink/path/privacy/strict-JSON/atomic-index hardening.
7. Python stdlib golden tests без package-script hotspot.
8. `brain workstream init/status/set-status`: exact-canonical bootstrap,
   атомарная запись, controlled transitions и frozen `result_sha`.
9. Branch-local `workstreams/<WS>/HANDOFF.md`, автоматически объявленный в
   manifest и обязательный для context текущей ветки; canonical handoff остаётся
   зоной последовательной интеграции, а не общим merge-hotspot каждой ветки.

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
  overlap. Он сверяет declaration с фактическим diff локального branch ref,
  обнаруживает foreign scope escape и не пропускает active/detached worktree.
  Read/read и полностью disjoint scope проходят.
- Вывод conflicts называется только `CLEAR_LOCAL_SNAPSHOT*`, перечисляет SHA и
  пределы проверки; отсутствие manifest/semantic scope не выдаётся за global safe.
- CLI `conflicts` обнаруживает manifest текущей ветки и трактует warnings как
  non-zero по умолчанию; `--allow-warnings` является явным решением integration
  owner. Text/JSON согласованно содержат decision, blocking, counts и exit code.
- `workstream init` проходит только на clean HEAD, равном canonical ref, и сам
  создаёт schema-v2 manifest, UUID/base/default proof IDs и handoff. Canonical
  branch запрещена для init. `submitted` фиксирует implementation HEAD;
  `integrated` разрешён только если frozen result и submission revision уже
  являются предками canonical.
- Унаследованный `submitted` освобождает scope только по exact frozen result SHA;
  `active/paused` продолжают резервировать scope. Terminal dormant refs не
  создают ложный конфликт, но dirty overlap terminal worktree остаётся hard.
- Legacy schema v1 читается без падения старых refs, но unfrozen submitted/
  integrated никогда не освобождает scope. Изменять lifecycle можно только после
  явной миграции в v2; повторный active manifest одной branch запрещён.
- `integrated` доказывает result ancestry и отсутствие non-manifest drift после
  frozen result; `abandoned` игнорируется только как dormant ref. Explicit current
  manifest обязан принадлежать checkout-ветке и не может быть terminal.
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
- terminal/submitted manifest скрывает commit после frozen result;
- две live manifest revision заявляют одну branch;
- параллельная ветка использует singleton handoff без объявленного scope.

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

Dormant `codex/out-001-contract-plan` меняет Brain singleton docs и поэтому
видим как aggregated warning, а не как активная блокировка. Если его снова
checkout-нуть или объявить active manifest, тот же overlap станет hard. Brain 1.5
не обещает глобальной независимости: integration owner обязан fetch-нуть refs,
проверить exact snapshot и последовательно интегрировать пересекающиеся scopes.

## Следующие слои после доказанного MVP

Это roadmap системы памяти, а не уже реализованные гарантии:

1. **Brain 1.6 · branch cockpit.** Поверх уже доступных decision/counts/NEXT —
   единый read-only отчёт по всем active manifests: владелец, base/head, declared
   scope, dirty drift, proof state и точная очередь интеграции. Он по-прежнему не
   обещает знание unfetched work.
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
