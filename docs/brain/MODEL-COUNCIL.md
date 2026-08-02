# Модельный совет

Модель выбирается по роли и результату собственной калибровки проекта, а не по
названию или публичному рейтингу.

| Участник | Роль | Когда использовать | Бюджет |
|---|---|---|---|
| Codex | Оркестратор, write-owner, браузерная проверка, код и релиз | постоянно | основной |
| Sonnet | Повседневный UX/UI review и человеческий текст | каждая значимая итерация | умеренный |
| Kimi | Дивергентные варианты и long-context поиск несогласованностей | discovery и широкий аудит | умеренный |
| GLM | Слепой challenger/red-team, mobile и edge cases | до реализации и перед gate | умеренный |
| Opus | Design director для сложной композиции и итогового критического review | ключевая развилка и релиз | до 20% совета |
| Fable | Редкий системный планировщик или арбитр дорогого тупика | изменение всей IA или deadlock | до 5% совета |
| Узкие агенты | accessibility, auth/security, performance, content, browser QA | соответствующий gate | по необходимости |

## Протокол

1. Зафиксировать HEAD, brief, аудиторию, ограничения и evidence pack.
2. Дать двум-трём участникам одинаковый brief без ответов друг друга.
3. Требовать `verdict`, severity, evidence, user impact, proposal и validation test.
4. Обезличить выводы A/B/C и превратить разногласия в эксперимент.
5. Security, privacy, accessibility и отсутствие ложного success имеют право veto.
6. Остановить совет, когда hard-gates зелёные и две независимые проверки сходятся.

Дорогую модель нельзя вызывать повторно без нового diff, прототипа или данных.
Никакая модель не запускается локально и не остаётся фоновым процессом.

## Портативный запуск из любого worktree

Секреты не хранятся в Git: Kimi и GLM читают их из macOS Keychain, Claude — из
глобальной subscription-сессии Claude Code. Все провайдеры запускаются
последовательно, результаты сохраняются только в игнорируемой `.brain/council/`.

```bash
# Проверка конфигурации без расхода inference
./bin/council --doctor --providers kimi,sonnet,glm,opus,fable --allow-fable

# Короткая реальная проверка всех маршрутов
./bin/council --probe --providers kimi,sonnet,glm,opus,fable --allow-fable

# Ежедневный совет
./bin/council --providers kimi,sonnet,glm --focus "активное дело: mobile/dark и следующий шаг"

# Важная арт-дирекция
./bin/council --providers kimi,sonnet,opus --image /absolute/path/screen.png --focus "композиция и путь"

# Fable — только системная развилка
./bin/council --providers fable --allow-fable --focus "неразрешённый архитектурный конфликт"
```

Если `--doctor` зелёный, но `--probe` падает, это временная ошибка провайдера, а
не отсутствие интеграции. Отчёт не подменяется выводом другого участника.
