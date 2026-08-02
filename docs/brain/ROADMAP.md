# Карта разработки: NOW / VERIFIED / NEXT / LATER

Roadmap хранит пользовательские результаты, а не перечень CSS-правок. В `NOW`
одновременно не более трёх outcomes. Статус integration результата берётся из
workstream manifest, а не из чата или model report.

## NOW

### OUT-001 — Заявка становится подтверждённым делом

- Почему важно: это единственный критический участок release98, где frontend
  success доказан локально, но downstream production/staging E2E намеренно не
  создавался.
- Результат: контролируемая тестовая заявка один раз проходит frontend → API →
  бот/оператор → кабинет и получает проверяемый ID и первый статус.
- Связи: `JRN-001`, `JRN-003`, `JRN-006`, `SUR-002`, `SUR-003`, `SUR-005`.
- Метрика: 100% контрольных сценариев создают ровно одно дело; ложный success и
  дубли — 0.
- Proof: staging или согласованный production marker, network/server/cabinet/
  notification evidence и повторный submit.
- Gate: backend/bot source или безопасные marker, lookup и cleanup пока
  отсутствуют. Никакой реальной клиентской мутации без них.

### OUT-003 — Единая оболочка не ломает геометрию и контекст

- Почему следующий: header/appbar/footer/auth/theme/consent имеют максимальный
  радиус, полностью проверяемы локально и пока не сведены в один executable
  state contract. Подтверждённого shell P0/P1 нет, поэтому это proof-first, не
  редизайн.
- Результат: единые состояния входа, навигации, темы, overlays, footer и CTA без
  скачков, дублей, потери focus/history или визуальных конфликтов.
- Связи: `SUR-003`, `SUR-006`, `UXD-0003` и все journeys.
- Метрика: P0/P1=0 в route/state/viewport matrix; touch targets ≥44 px; один
  intended primary CTA; корректный auth/overlay return.
- Proof: machine-readable contract + executable browser matrix for route family,
  360/390/768/1024/1440, auth states, light/dark/reduced motion, menu/search/
  footer/consent and explicit route exceptions.
- Kill/stop: runtime не менять без failing reproduction; live OAuth/production
  session не имитировать; shared code требует полного consumer inventory,
  bundle parity и cache key.

## VERIFIED

### OUT-002 — Следующий шаг по делу находится за 10 секунд

- Результат: первый viewport кабинета показывает не более одного реального
  действия со строгим приоритетом и честным calm state.
- Proof: `E-1004`; integrated result is in canonical history.

### OUT-004 — Сообщения, документы и деньги согласованы с активным делом

- Результат: единый fail-closed context resolver согласует summary/detail,
  priority, overview, bands, payment, destination and live refresh; все три
  платёжных пути имеют pre-mutation guard.
- Proof: `E-1005`, implementation
  `4bb148af0abed033bd113249cda82fe45b60205b`; exact terminal state is in
  `WS-cf01d4d63ca2421e93288e3518298bfa` manifest.

## NEXT

- `OUT-005` — сократить выбор на `services.html` и вести от ситуации к одному
  релевантному контекстному сценарию, не удаляя physical SEO URLs, canonical,
  schema, sitemap или ценовые контракты.
- `OUT-006` — измерять понимание первого шага и время до него без чувствительных
  данных; использовать как evidence до preference-led каталожных изменений.

## LATER

- Production/staging исполнение `OUT-001` после появления marker/lookup/cleanup
  и authoritative backend/bot contract.
- Калибровка модельного совета на слепых задачах главной, мобильного дела и
  тёмной темы.
- Контентный граф знаний: материал → проблема → услуга → следующий шаг.
- Редакторская операционная панель после фиксации API-контрактов и ролей.

## Правило приоритета

Безопасность и фактическая работоспособность → выполнение задачи → accessibility
и mobile → ясность → бренд → декоративная новизна. При равенстве выбирается более
простое, локально доказуемое и обратимое решение.
