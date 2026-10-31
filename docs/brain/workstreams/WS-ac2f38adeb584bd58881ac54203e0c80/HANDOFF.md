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
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: аддитивный модуль, две строки в `webapp.py` с хешем до правки,
  своя SQLite; откат — исходники из бэкапа установщика, базы не трогать.
  Редакцию оферты не менять: `consent_doc` зашит в формах сайта (урок 26.07).
- Next: implement module, installer, page and tests.
