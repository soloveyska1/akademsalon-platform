# Release gates

Красный hard-gate означает NO-GO независимо от среднего score.

| Gate | Требование |
|---|---|
| G0 Freeze | base/head, dirty state, fixtures, environment и scope зафиксированы |
| G1 Regression | обязательные тесты 100%; новых console errors нет |
| G2 Journey | home → выбор → заявка → success/failure; autosave, Back/Forward, Enter, upload, single/double submit |
| G3 Auth | Telegram/email/VK ID; exact callback allowlist; busy/success/conflict; возврат в исходный контекст |
| G4 Cabinet | обзор, дело, сообщения, документы, деньги, настройки, клуб; mobile More; длинные данные; focus |
| G5 Visual | 360, 390, 768, 1024, 1280/1440; light/dark; overflow, overlap и clipping отсутствуют |
| G6 Accessibility | keyboard, видимый focus, доступные имена, ошибки, 44 px, contrast, reduced motion |
| G7 Reliability | success только после 2xx + валидный ID; стабильные request/file IDs; защита от дублей |
| G8 Isolation | production без demo-fixtures; demo noindex и без реальных мутаций |
| G9 Evidence | screenshot/log содержит commit, route, viewport, theme, browser, data state и expected/actual |
| G10 Release | P0=0, P1=0; P2 имеет владельца/срок; production smoke и rollback проверены |

## Приоритет доказательств

1. Реальное поведение и безопасность.
2. Успешность пользовательской задачи.
3. Accessibility и mobile usability.
4. Консистентность бренда.
5. Предпочтение модели.

Результат модели без evidence ID — мнение. Два review-цикла без нового прототипа,
diff или данных прекращаются.
