# План единого контекста активного дела для OUT-004

- Date: 2026-08-03, Europe/Moscow
- Workstream: `WS-cf01d4d63ca2421e93288e3518298bfa`
- Canonical base: `4c43a42dfc67878d116a79feb528ca3bca4c4309`
- Branch: `codex/out-004-case-context-truth`
- Write-owner: `codex-root`; три независимых агента работали только read-only.
- External mutations: production account/API/payment/OAuth/deploy/delete запрещены.

## Почему выбран этот срез

OUT-002 доказал правильный порядок классов действий, но оставил отдельную
границу: summary и detail одного дела независимо трактуют `due_now`, `claimed`,
`part_ready`, `final_ready` и паузу. Literal-прогоны воспроизвели ложную оплату,
маскирование проверки/файлов/сообщения и stale home после context-only event.
Это уже исполняемый дефект клиентского пути, тогда как на главной, в шапке и
футере нового P0/P1 не воспроизведено. Редизайн утверждённого кабинета не нужен.

## Execution contract

1. Внутри сохраняемого `now-action-contract` ввести один pure resolver:
   `payment = unknown|none|preparing|due|checking|transfer`,
   `owner = paused|client|master`, `action`, `destination`.
2. `claimed` авторитетнее сохранённого positive due. Просить оплату можно только
   при явной положительной сумме и явном отсутствии claimed; неизвестный summary
   не превращать в финансовый CTA.
3. Порядок действий остаётся `payment > price > review > files > message`.
   `prepay` без счёта — ожидание; checking/transfer не маскируют младшее реальное
   действие. Пауза и terminal-состояния не создают priority.
4. Один resolver питает priority, `needsAction`, overview/turn copy, верхние
   bands, payment workspace, default route/jump hot state, карточку/ledger и
   live-list fingerprint. `nowCard` нельзя собирать из summary и другого detail.
5. Client-paused ведёт в доступные «Условия» для снятия паузы; admin-paused — в
   переписку. Все payment/ready CTA во время паузы подавляются.
6. Context-only event обязан вызвать один безопасный rerender. Scroll, drafts и
   keyboard focus сохраняются по стабильному id/data-key.
7. Исправить только подтверждённый dark token: 12 px CTA должен иметь контраст
   не ниже 4.5:1. Markup, маршруты, focus-on-entry и mobile composition не менять.
8. Единственный HTML consumer `cabinet.js` получает отдельный additive cache key.

## Failing-first и доказательство

- Literal VM matrix исполняет реальный resolver для due absent/0/positive,
  claimed, pause, ready, price, review, files и unread; отдельно проверяет
  masking и summary signature.
- Existing overview fixture меняет ложный invariant: bare `prepay` больше не
  payment; явный positive due остаётся приоритетом 5.
- Focused account suites, полный repository suite, syntax/diff checks, Brain
  unit/validate и свежий conflict snapshot должны быть зелёными.
- Synthetic GET-only browser states на 390×844 в light/dark проверяют один CTA,
  правильный destination, 44 px, отсутствие overflow, контраст, Back/focus и
  context-only rerender. Временный сервер после proof останавливается.
- Kimi, Sonnet и GLM выполняют независимый daily review; один Opus проверяет
  contract/UX-развилку. Fable остаётся connectivity-only без systemic deadlock.

## Stop conditions

- absent/zero due или claimed всё ещё создаёт payment CTA;
- positive due с authoritative `claimed=false` маскируется review/files/message;
- pause одновременно показывает pay/ready action;
- priority, overview, bands, payment block или destination расходятся;
- context-only event не обновляет home ровно один раз либо теряет focus/scroll/draft;
- dark CTA ниже 4.5:1, mobile overflow, target ниже 44 px;
- изменённый asset не имеет cache key, появился второй consumer;
- hard conflict, P0/P1 regression или необходимость угадывать production schema.

## Риски и rollback

Unknown summary может временно не показать настоящий счёт, поэтому это состояние
не объявляется спокойной подтверждённой оплатой: оно лишь запрещает финансовый
призыв без доказательства. Отдельная API-схема/revision остаётся долговечным
контрактным долгом. Rollback — exact revert implementation commit; schema,
production data и deployment не затрагиваются.
