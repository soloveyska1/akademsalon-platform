# Workstream handoff

- Branch: `claude/kladovaya-pay-20261031`
- Outcomes: `OUT-004`
- Goal: касса Салона (Robokassa) принимает оплату платных услуг Кладовой ГИПСР.
  Первая услуга — `format_fix` «Исправить оформление»: бот Кладовой
  (@kladovoygipsrbot) правит .docx студента после подтверждённой оплаты.
  290 ₽ — курсовая, НПР, отчёт по практике, самостоятельная; 390 ₽ — ВКР.
- Acceptance:
  - страница `/kladovaya-oplata.html?o&p&a&e&s` принимает только ссылку,
    подписанную HMAC-SHA256 общим секретом (`o|p|a|e`), живую (не дольше 24 ч)
    и с ценой из прайса; показывает Спецификацию позиции (оферта 3.2, п. 3.3),
    почту для чека и ведёт на Robokassa с `Shp_kind=kladovaya`, `Shp_order`;
  - ResultURL с `Shp_kind=kladovaya` проходит существующую проверку подписи,
    сверяет сумму со счётом и прайсом, идемпотентен по InvId и по заказу,
    пишет свою базу и `payment_receipts`, отвечает `OK<InvId>`;
  - уведомление боту подписано `X-Kladovaya-Signature`, повторяется с паузами
    до суток, после — сообщение владельцу; оплата не теряется при потере
    ResultURL (сверка OpStateExt);
  - SuccessURL/FailURL ведут в бота `?start=paid_<order>` / `payfail_<order>`.
- Proof: `python -m unittest backend/salon_bot/tests/test_kladovaya_pay.py`
  (локально и на продовом Python 3.10), `brain:test`, `brain:validate`.
- Changed:
  - `backend/salon_bot/kladovaya_pay.py` — модуль кассы (маршруты quote/checkout/return,
    хук ResultURL, своя SQLite, сверка OpStateExt до ясного ответа кассы, очередь уведомлений,
    очередь сообщений админам с повторами, закрытие приёма при `CHECKOUT=0`, выключенной кассе
    или смене `DOC_EDITIONS`, 503 без падения Салона при сломанной базе, CLI status/requeue);
  - `backend/salon_bot/install_kladovaya_pay.py` — установщик: хеш `webapp.py` и наличие
    символов, на которые опирается модуль, два хука по точному совпадению, drop-in с
    `LoadCredential`, секрет из `zero_campaign_hmac`, бэкап, автооткат при сбое
    перезапуска, health или пробы, `--rollback` (отказ при счетах в базе без `--force`);
  - `backend/salon_bot/tests/test_kladovaya_pay.py` — 41 тест;
  - `scripts/kladovaya-pay-20261031/` — страница (`page/`, спецификация ред. 1.0 с хешем
    `SPEC_SHA256`), `apply_static.py` (сверка редакций оферты и политики в релизе), README
    с контрактом, выкаткой и откатом.
- Verified (31.10.2026, локально): 41/41 тест (Python 3.14, aiohttp 3.13); синтаксис всех
  новых файлов — Python 3.10 (`ast.parse(feature_version=(3, 10))`); `brain:validate` VALID;
  `brain:test` 39/39 под Linux (WSL; на Windows 6 ошибок fsync каталога — окружение).
  Два независимых ревью (страница и юридический текст; бэкенд и установщик), замечания
  учтены. Превью страницы на живых стилях и CSP Салона с настоящим модулем, фейковыми кассой
  и ботом: 290/390 ₽, счёт `InvId 40000001`, ResultURL → `OK40000001`, одно подписанное
  уведомление боту, повтор без второго, возвраты в бота, все состояния ошибок ссылки, 502 на
  `quote` с повтором, 502, отказ кассы и обрыв сети на оплате без потери формы, 375 px без
  прокрутки вбок. Остальной набор `backend/salon_bot/tests` даёт те же 3 провала и 11 ошибок
  на Windows с новым файлом и без него.
- Production (31.10.2026, по «выкатывай» владельца, коммит `7ebfe5d6`):
  - артефакты — `/root/salon_bot/release-artifacts/kladovaya-pay-7ebfe5d6` (LF;
    первая заливка `git archive` с `core.autocrlf=true` дала CRLF — перезалито);
  - 41/41 тест на Python 3.10.12 / aiohttp 3.12.15 сервера; `--check` чистый
    (`webapp.py` `ecf371e7…`);
  - `--apply --derive-secret --restart` в 10:09 МСК: `webapp.py` → `e51926d5…`, модуль `61623e9c…`,
    секрет `/etc/kladovaya-pay/secret` (root 600) выведен из `zero_campaign_hmac`, drop-in
    `kladovaya-pay.conf`, бэкап `/root/salon_bot/backups/kladovaya-pay-20261031T070931821354Z`;
    health 200, подписанная проба 200, в журнале ошибок нет;
  - статика: `current` → `release262-kladovaya-pay-7ebfe5d6` (была `release261-docs-v4-064ed622`),
    diff — только `oplaceno.html` и новая `kladovaya-oplata.html`;
  - smoke (сервер, GET/POST без оплаты): `quote` 200 `format_fix 1.0`; checkout →
    неоплаченный счёт `InvId 40000001`, заказ `ksmoke00001`, страница Robokassa 200 с 290 ₽; возвраты
    302 → `t.me/kladovoygipsrbot?start=paid_ksmoke00001` / `payfail_…`; OpStateExt ответил
    `not_found`; `payment_receipts` — `scope=kladovaya`, без `buyer_email`. Счёт закроется сам
    через 10 мин после конца ссылки;
  - Chromium на проде (375 px, светлая тема, счёт открыт): форма, факты и 15 строк спецификации,
    шрифты загружены, прокрутки вбок нет, консоль пустая;
  - откат вхолостую: `unpatched(живой webapp.py)` → `ecf371e7…` = бэкап; прежний релиз статики на месте.
- Unverified: настоящая оплата Robokassa (ResultURL → уведомление боту) и чек НПД; какую сумму
  OpStateExt отдаёт в `OutSum` (сверка смотрит и `IncSum`); сторона бота Кладовой (приём
  уведомления, nginx `/salon/paid`, секрет на её сервере). Evidence-запись (E-номер) не заведена:
  `docs/brain/evidence` вне scope этого workstream — данные для неё выше.
- Risks/rollback: аддитивный модуль, два хука в `webapp.py` с хешем до правки,
  своя SQLite; откат статики — `current` обратно на `release261-docs-v4-064ed622`, бэкенда до
  первой оплаты — `install_kladovaya_pay.py --rollback /root/salon_bot/backups/kladovaya-pay-20261031T070931821354Z --restart`
  (откажет из-за смоук-счёта — `--force`, он не оплачен), после — `ACADEMIC_SALON_KLADOVAYA_PAY_CHECKOUT=0`;
  базу не восстанавливать поверх оплат. Редакцию оферты не менять: `consent_doc`
  зашит в формах сайта (урок 26.07).
- Contract: отступления (адрес уведомления `https://studkladovaya.ru/salon/paid` — серверы разные;
  секрет из общего `zero_campaign_hmac`; возврат через сервер Салона) приняты стороной Кладовой
  31.10, её ветка `claude/listik-autoformat`. Бот перед предложением оплаты пробует `quote` с
  `kprobe00000` с 94.241.143.29; отпечаток ключа — sha256(ключа)[:12].
- Next: сторона Кладовой — `bot-deploy.yml` и nginx `/salon/paid`, сверка отпечатка ключа,
  подписанный `kping000000` с сервера Салона (ждём 404), затем первая настоящая оплата 290 ₽
  по ссылке из бота (README, шаги 6–7).
