# Workstream handoff

- Branch: `codex/out-001-next-slice-selection`
- Outcomes: `OUT-001`
- Goal: выбрать ровно один следующий продуктовый срез после независимого аудита
  главной/chrome, кабинета и полного клиентского пути OUT-001.
- Acceptance: для каждого кандидата перечислены воспроизводимые наблюдения,
  незакрытые P0/P1, связь с outcome, безопасный proof и stop conditions; выбор
  обоснован риском и ценностью, а не голосованием моделей.
- Proof: read-only code/test/Brain mapping, существующие deterministic tests,
  три независимых агентских review и Kimi+Sonnet+GLM council; одна Opus-проверка
  только для ключевой развилки. Fable — connectivity only без системного deadlock.
- Changed: `E-1002` records the exact audits, the OUT-001 versus cabinet-P1 fork,
  the selected bounded slice, proof/stop conditions and model limitations.
- Unverified: server idempotency/outbox/cleanup, bot/operator delivery and real
  cabinet cardinality; browser and production mutations were not performed.
- Risks/rollback: не редизайнить утверждённые экраны без воспроизводимой проблемы;
  ветка пишет только новый evidence и собственный handoff, rollback — `git revert`.
- Next: validate and integrate this evidence-only selection, then create one new
  OUT-001 implementation workstream for request-identity integrity and a default-
  refusing smoke preflight; do not run an external POST.
