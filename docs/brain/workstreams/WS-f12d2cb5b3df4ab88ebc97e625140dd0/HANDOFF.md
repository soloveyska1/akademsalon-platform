# Workstream handoff

- Branch: `codex/out-006-analytics-v2-core`.
- Base: `68a9d9c12a9f55844569c210df1fd6dc24a82e61`.
- Outcome: `OUT-006`.
- Goal: заменить недостоверную legacy-аналитику отдельной privacy-safe серией
  v2 с единым контрактом, идемпотентным сервером, агрегатами одного периода и
  понятной русской панелью администратора.
- Durable plan/evidence: `docs/brain/plans/OUT-006-ANALYTICS-V2.md`, `E-1015`.

## Что изменено

- Добавлен общий contract v2 для страниц, событий, воронки, кампаний и русских
  подписей.
- На всех публичных страницах подключён consent-only клиент с очередью,
  event ID, точным временем, sequence, retry, подписанным grant и server revoke.
- Добавлены аддитивные SQLite-таблицы, строгая валидация, сессионализация,
  retention worker, серверные агрегаты и защищённые admin API.
- Добавлена отдельная русская панель: обзор, источники, страницы, переходы,
  устройства, география, воронка, сессии и здоровье данных.
- Старый admin ведёт в новую панель; legacy ingest по умолчанию выключается.
- Добавлена строгая attribution-граница после общего runtime: на всех 87
  измеряемых публичных страницах она повторно канонизирует legacy storage,
  пропускает только точные UTM enums и не даёт произвольной строке попасть в
  аналитику или payload заявки. Кабинет, admin и страница дела не измеряются.
- Добавлены строгая admin CSP, edge body/rate limits, exact installer,
  повторная установка и coherent rollback.
- Обновлены privacy/consent-тексты без обещания установления личности.

## Что и чем проверено

- Полный Node regression: 552/552.
- Backend/installer: 30/30 с ResourceWarning как ошибкой.
- Brain: 39/39; strict validate 69 records/127 links/20 manifests.
- Python compile, `git diff --check`: green.
- Exact production-source copy: install дважды, два отката, исходные SHA и
  SQLite integrity `ok`.
- Независимые backend, privacy/security и Chromium UX reviews: GO по P0/P1.
- Chromium: strict CSP без нарушений/внешних запросов; 390/1024/1440 без
  overflow; stale/race/pagination/dialog/focus прошли.

## Граница приватности

Панель показывает анонимный браузер/сессию, а не человека. В v2 отсутствуют raw
IP/UA, Cookie, контакт, аккаунт, заказ, имя, тексты, файлы, query/hash и OAuth.
Контакты и дела остаются в своих защищённых контурах и не связываются с
аналитикой. При отзыве raw v2 удаляется, offline replay блокируется tombstone.

## Что ещё не проверено

Production не менялся. Обязателен отдельный `production:deploy` workstream:
fresh fetch/conflicts, backend backup/install с выключением legacy ingest строго
до переключения неизменяемого static release,
локальная DB-IP City Lite, `nginx -t`, restart/health, synthetic exact-count
ingest/readback/duplicate/revoke, нулевой остаток, браузерный live smoke и
проверенный rollback-forward.

## Rollback

Вернуть предыдущий static symlink и exact installer backup, затем `nginx -t` и
restart. Таблицы v2 на горячую не удалять; SQLite backup восстанавливать только
при доказанной порче после остановки сервиса и сохранения текущего DB/WAL.

## Следующий точный шаг

Зафиксировать implementation commit, перевести workstream в `submitted`,
интегрировать result SHA в свежий canonical и только затем открыть отдельный
release workstream для production-gate.
