# Спецификация заказа v2

## Назначение

Один заказ может содержать N самостоятельных и зависимых позиций. Каждая позиция имеет собственный предмет, результат, цену, срок, приёмку и расчёт при отказе. Принятая редакция неизменяема.

Деньги хранятся целыми копейками; даты — ISO 8601; договорная зона — `Europe/Moscow`.

## Корень документа

```text
order_spec
  schema_version
  spec_id, order_id, number, revision
  status: draft | offered | accepted | superseded | cancelled
  created_at, valid_until, accepted_at
  currency: RUB
  parties
  documents
  lines[]
  dependencies[]
  milestones[]
  pricing
  payment_schedule[]
  acceptance
  corrections
  change_control
  cancellation
  evidence
```

### Стороны и документы

```text
parties
  contractor: name, inn, tax_regime, npd_status_checked_at
  customer: customer_id, name, verified_contacts
  beneficiary: id, relation
  payer: payer_id, name, contact, acts_for_customer
  authorized_users[]: id, scope, granted_at, revoked_at

documents
  offer: version, effective_at, url, sha256
  privacy: version, url, sha256
  loyalty: applicable, version, url, sha256
  spec_pdf: url, sha256
  spec_html: url, sha256
```

## Позиция

```text
line
  line_id
  position
  parent_line_id
  dependency_line_ids[]
  separability: independent | dependent
  legal_service_type:
    consultation | editing | formatting | analysis |
    teaching | methodological_material
  service_code
  title
  plain_description
  quantity
  unit
  unit_definition
  scope
    topic, discipline, language
    included[]
    excluded[]
    volume_min, volume_max
  customer_inputs[]
    input_id, name, required, due_at
    file_id, version, sha256, received_at
  deliverables[]
    deliverable_id, name, formats[], quantity
    delivery_channel
    acceptance_criteria[]
  schedule
    start_conditions[]
    planned_start_at
    due_at | duration_days
    day_type: calendar | business
    pause_rules[]
  quality
    plagiarism_check
  corrections
    defect_remedy_included
    voluntary_support_window
  pricing
    unit_price_minor
    gross_minor
    discount_allocations[]
    contractual_line_price_minor
  tax
    regime: NPD
    vat: not_presented
  cancellation_effect
```

### Проверка оригинальности

```text
plagiarism_check
  applicable
  system, product, module, version_or_date
  settings
  metric_name
  threshold_percent
  document_scope
  excluded_sections[]
  source_file_sha256
  report_format
  report_due_event
  tolerance
  ai_detection_not_guaranteed: true
  anti_circumvention: true
```

## Платёжный этап

```text
stage
  stage_id, position, label
  trigger_event
  due_at | pay_within_days
  amount_minor
  funding
    cash_minor
    gift_credit_minor
    deposit_minor
  allocations[]
    line_id
    deliverable_id
    amount_minor
  transfer_after_payment[]
  status
```

## Инварианты

- Сумма договорных цен строк после скидок равна цене заказа.
- Бонус — скидка. Сертификат и депозит — зачёт аванса, не скидка.
- `cash_due = contract_price - gift_credit - deposit_credit`.
- Сумма денежных этапов равна `cash_due`.
- Каждый рубль этапа распределён на строки/результаты.
- У каждого результата есть срок и критерии.
- `qty > 1` допустимо только для идентичных единиц с одинаковыми темой, сроком и требованиями.
- Зависимость не ссылается на клиентский временный UUID и не образует цикл.
- Клиентский `quote_preview` никогда не становится договорной ценой.
- Принятая редакция не редактируется.
- Изменение цены, состава, срока, результата или критерия создаёт новую редакцию и требует нового явного подтверждения.

## Человекочитаемый PDF/HTML

1. Номер заказа, редакция, дата, срок действия, URL/QR и SHA-256.
2. Стороны и роли.
3. Итог: число позиций, твёрдая цена, к оплате деньгами, первый платёж, общий финал.
4. Таблица состава: ID, позиция, единица/количество, результат, срок, цена.
5. Карточка каждой позиции: входит/не входит, входы, объём, файлы, срок, критерии, проверка, цена и этапы.
6. Календарь и зависимости.
7. Расчёт: строки, скидки, бонусы, сертификат/депозит, деньги.
8. График платежей с распределением по строкам.
9. Приёмка и законные права по недостаткам.
10. Изменения и частичный отказ.
11. Иерархия документов и доказательства акцепта.

## Оперативные формулировки

> Каждая позиция является самостоятельной частью заказа, если в графе «Зависимость» прямо не указано иное. Цена, срок, результат и критерии определяются отдельно по строке. Отказ от одной самостоятельной позиции не прекращает остальные.

> Семидневный срок — организационное окно первичной проверки. Его истечение и начало использования результата не ограничивают требования в связи с недостатками и иные права в сроки, установленные законом.

> При отказе возвращается неоспариваемая сумма аванса за вычетом документально подтверждённых необходимых расходов конкретной отменённой позиции и согласованной цены фактически предоставленного самостоятельного результата. Предпросмотр и внутренний процент готовности сами по себе не подтверждают оказание или приёмку.

## Снимок акцепта

До кнопки оплаты пользователь видит и скачивает точный снимок. Журнал содержит:

```text
spec_id, revision, spec_sha256
offer/privacy/loyalty versions + sha256
shown_at, accepted_at
customer/account/session id
verified contact and channel
CTA text
payment id, amount, method
IP, user agent
receipt id
```

После оплаты клиент получает тот же файл, а не документ, заново собранный из текущих данных.
