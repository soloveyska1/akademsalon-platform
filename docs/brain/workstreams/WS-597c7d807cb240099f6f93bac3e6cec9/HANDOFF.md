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
- Changed: none yet.
- Unverified: браузерные и production mutations не выполняются; implementation
  не начат и будет отдельным workstream после выбора.
- Risks/rollback: не редизайнить утверждённые экраны без воспроизводимой проблемы;
  ветка пишет только новый evidence и собственный handoff, rollback — `git revert`.
- Next: commit bootstrap, run strict conflict scan, then dispatch independent
  read-only audits and council from the exact clean snapshot.
