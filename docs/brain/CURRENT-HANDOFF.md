# Current handoff

## Цель и frozen state

- Цель: сделать детали проекта воспроизводимой картой для новой сессии и
  безопаснее развести параллельные task-ветки, не создавая второй источник истины.
- Product anchor: `OUT-001`; product outcome не расширялся.
- Base: `da0a05e83b0cf98d931820aa1468160e2ac66df0` из
  `origin/codex/full-reference-production`.
- Branch: `codex/brain-v2-out-001`.
- Head: commit, содержащий этот handoff; точный SHA брать из Git/`brain doctor`,
  а не копировать из чата.
- Production release остаётся `release98-c30dbd4924b5`; production mutations,
  OAuth, deploy и удаление данных не выполнялись.

## Что изменено

- `DEC-0007`: tracked Markdown — sole durable truth; SQLite v2 — ignored derived
  projection atomic records и explicit generic ID-links.
- `brain validate/map/context/conflicts`: strict schema, provenance, whole-record
  context с omission ledger, policy-driven semantic overlap и local snapshot limits.
- Workstream manifest: base SHA, one write-owner, exact/tree path scopes,
  controlled semantic scopes и allowlisted proof IDs без executable strings.
- Schema v2 lifecycle: generated `active` manifest, frozen `submitted.result_sha`,
  ancestry-gated `integrated`, revision/hash chain и legacy-v1 normalization без
  права unfrozen legacy status освобождать scope.
- `workstream init` создаёт и автоматически объявляет branch-local `HANDOFF.md`;
  он целиком входит в context текущей ветки. Singleton `CURRENT-HANDOFF` теперь
  последовательно сводит integration owner, поэтому параллельные ветки не обязаны
  конфликтовать на одном файле.
- `conflicts` входит в обязательный bootstrap, сам находит manifest текущей ветки
  и возвращает non-zero на warnings по умолчанию. Он читает manifests из локальных
  refs, сверяет их с actual diff, видит active/detached worktrees и выдаёт
  decision/blocking/counts/NEXT в text и JSON.
- `record_schema_version: 1` — additive-only; definition вне canonical owner-файла
  блокируется, breaking schema требует миграционного теста и отдельного решения.
- Security: strict UTF-8/JSON, duplicate/nonfinite rejection, symlink/privacy/path
  guards, structured Git argv, read-only optional-lock policy, atomic index replace.
- План и дальнейшие слои: `docs/brain/plans/BRAIN-15-MVP.md`.

## Проверено

- Brain tests: 36/36.
- Product regression: 430/430.
- Strict corpus validation, atomic refresh, doctor, map и byte-identical context.
- `.brain`/SQLite modes: 0700/0600; failed size gate preserves previous DB.
- Независимые агенты воспроизвели три fail-open случая lifecycle; terminal/result
  ancestry, post-result drift и current-manifest ownership закрыты regression tests.
- Council doctor и live probe: Kimi/Sonnet/GLM/Opus/Fable READY. Историческое
  утверждение «model integrations недоступны» остаётся историей, но superseded;
  канонический текущий факт — portable integrations работают из этого worktree.
- Daily review: Kimi+Sonnet+GLM; одна Opus contract-fork проверка. Fable после
  connectivity probe не расходовался.
- Полная детерминированная запись: `docs/brain/evidence/E-1001.md`.

## Не проверено и пределы

- Нет global guarantee для unfetched/unpushed/undeclared work, remote lease или
  merge queue. `CLEAR_LOCAL_SNAPSHOT*` означает только точный локальный snapshot.
- Typed `depends_on/proves/closes` не введены; generic co-occurrence не является
  доказательством или причинной связью.
- Production E2E `OUT-001` всё ещё не создавался: downstream bot/operator/cabinet,
  idempotency и cleanup требуют отдельного безопасного proof plan.
- Council reports — observations, не hard-gate evidence; `.brain/council` ignored.

## Решения, риски и rollback

- Вариант A (одна Markdown truth + derived generic graph) выбран вместо второго
  tracked graph: нынешний corpus мал, а singleton docs уже являются merge-hotspot.
- Невалидный current-tree manifest намеренно блокирует validation/context/doctor
  на всём tree; legacy v1 foreign refs нормализуются, но не получают права
  освобождать scope. Это широкий, но видимый fail-closed blast radius.
- Rollback: `git revert` Brain change-set. Не удалять `.brain` целиком, потому что
  `.brain/council` принадлежит отдельной подсистеме; пересоздаётся только
  `index.sqlite` через `./bin/brain refresh`.

## Один точный следующий шаг

Закоммитить integration candidate с active revision 2, повторить deterministic
gates и независимый council review, затем `set-status submitted`, explicit
fast-forward push feature/canonical, `set-status integrated` и terminal closure
push. Только от обновлённого canonical создавать следующую product-ветку и
возвращаться к безопасному marker/cleanup E2E-плану `OUT-001`.
