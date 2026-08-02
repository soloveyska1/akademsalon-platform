# UX debt ledger

| ID | Severity | Статус | Симптом / риск | Связи | Acceptance | Target |
|---|---:|---|---|---|---|---|
| `UXD-0001` | P2 | planned | Полный production E2E новой заявки не имеет безопасного тестового маркера и процедуры очистки | `OUT-001`, `JRN-006` | один контролируемый submit виден во всех системах и удаляем без побочных эффектов | следующий релиз |
| `UXD-0002` | P2 | planned | В насыщенном деле следующий шаг может конкурировать с деталями и требовать вертикального поиска | `OUT-002`, `JRN-004` | действие, статус и срок видны в первом viewport при длинных данных | следующий релиз |
| `UXD-0003` | P2 | verified | Общие элементы имели большой радиус регрессии без единого контракта: терялась saved theme, consent-modal не изолировал фон, footer/settings и admin shortcut расходились, dark CTA/badges были ниже AA | `OUT-003`, `SUR-003`, `SUR-006`, `E-1006` | route/state contract, direct/home parity, 472/472 regression и exact browser spine подтверждают тему, consent, focus, cache, overflow и AA; `verified_commit=7e6f33a6088888ccf49dbbd81cb2a8f68c9cecc2` | закрыто в OUT-003 |
| `UXD-0004` | P1 | verified | Summary/detail независимо трактовали `due_now`, `claimed`, ready и паузу: literal frontend states давали ложную оплату/маскирование, а live fingerprint не перерисовывал context-only изменения | `OUT-004`, `OUT-002`, `JRN-005`, `E-1004`, `E-1005` | единый fail-closed resolver и pre-mutation guard согласуют priority/overview/bands/payment/destination; 2304-state matrix, 390 px light/dark proof и full regression зелёные; `verified_commit=4bb148af0abed033bd113249cda82fe45b60205b` | закрыто в OUT-004 |

Статусы: `open`, `planned`, `fixed-unverified`, `verified`, `waived`. Закрытие без
`verified_commit` запрещено. Неподтверждённое мнение модели не создаёт UX debt без
воспроизведения или проверяемой гипотезы.
