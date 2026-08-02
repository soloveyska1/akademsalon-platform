# Current handoff

## Цель новой задачи

Создать доказуемый сквозной путь `OUT-001`: заявка один раз проходит frontend →
API → обработку → кабинет, сохраняя контекст авторизации и показывая честный статус.

## Frozen state

- Production release: `release98-c30dbd4924b5`
- Verified source: `c30dbd4924b55bd92bfe096014231bbbaaa99a9b`
- Branch: `codex/full-reference-production`
- Production: <https://akademsalon.ru/?v=release98>
- Preview: <https://akademsalon-desktop-preview.saymoon.chatgpt.site/?v=release98>
- Full regression: 430/430.
- Production safe smoke: путь доведён до активной кнопки отправки; реальный submit не выполнялся.

## Подтверждённо работает

- Основные production-маршруты загружают release98.
- Конфигуратор обновляет дату и состояния валидации вживую.
- Авторизованный Telegram-контекст распознаётся; согласие корректно включает submit.
- API health возвращает `ok`; production симлинк и rollback проверены.
- Контрольные desktop/mobile/light/dark проверки не выявили P0/P1.

## Не проверено полностью

- Создание маркированной тестовой заявки во всех production-системах.
- Появление этого же дела в кабинете и канале оператора/бота.
- Полный recovery при сетевом сбое между API, уведомлением и обновлением кабинета.

## Безопасность

- Не отправлять немаркированную production-заявку.
- Не сохранять OAuth-коды, токены, контакты и клиентские данные в файлы/evidence.
- Сначала определить test marker, способ удаления и ожидаемые серверные записи.
- Пользовательские dirty-файлы из исходного checkout не трогать.

## Первый точный шаг

Картировать фактический submit-контракт и все downstream consumers read-only:
endpoint, payload, idempotency key, success condition, bot/operator delivery и
cabinet refresh. После этого предложить безопасный E2E test plan без реальной
клиентской путаницы.
