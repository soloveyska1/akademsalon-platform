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

## VERIFIED

### OUT-005 — Выбор услуги сохраняет намерение и ведёт к одному шагу

- Результат: четыре ситуации дают один explicit continuation; saved progress
  владеет единственным primary до явного нового выбора; continue/replace не
  смешивают intent. Все 22 detail CTA несут allowlisted URL-context, девять
  discipline routes сохраняют физическую цену, а backend получает прежний
  transport vocabulary только на границе сериализации.
- Proof: `E-1007`; failing-first 1/8→10/10 contract, independent P0/P1/P2=0,
  focused 73/73, full 482/482, Brain 39/39 and exact browser/runtime matrix.
- Implementation/result:
  `db93a45a385521600fbe1a5121334c413ebdbfa4`; terminal manifest revision 9 is
  `WS-9f644e92a3a04eb280a49d550b0ae513`.

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

### OUT-003 — Единая оболочка не ломает геометрию и контекст

- Результат: route/state contract согласует theme, menu/search, consent,
  footer/settings, admin exception, focus return, dark contrast, direct/home
  delivery и один atomic cache wave без редизайна утверждённых экранов.
- Proof: `E-1006`, implementation
  `7e6f33a6088888ccf49dbbd81cb2a8f68c9cecc2`; full regression 472/472 and
  exact 360/390/768/1024/1440 local browser spine are green.

## NEXT

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
