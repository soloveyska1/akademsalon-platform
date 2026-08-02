# Академический Салон

Перед работой прочитайте `AGENTS.md` и выполните:

```bash
./bin/brain context --task "краткая цель"
./bin/council --doctor --providers kimi,sonnet,glm,opus,fable --allow-fable
```

Project brain находится в `docs/brain/`. Он является долговечной памятью проекта;
чат и сырые модельные отчёты не заменяют решения, evidence, UX debt и handoff.
Не запускайте локальные LLM, watchers или постоянные фоновые сервисы.
