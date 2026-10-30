# Магазин готовых работ: один экземпляр — один покупатель

30.10.2026, решение владельца: «надо по одной копии продавать». Каждую работу продаём одному
покупателю: после оплаты она снимается с продажи. Лицензия юридически остаётся простой —
исключительной её не называть. Цены не менялись.

## Что было

`GET /api/store/catalogue` отдавал у всех десяти работ `licences: 5, available: 5`. Лимит —
это строки таблицы `licences` в `/var/lib/academic-material-store/store.sqlite3`, по одной
на экземпляр, и поле `licences` в неизменяемой версии (`versions.payload`) и в манифесте
`/var/lib/academic-material-store/catalogue.json`. Манифест читается только при старте
`salon-bot-v2`; если он расходится с сохранённой версией, сервис не стартует
(`immutable_version_changed`). Тексты магазина обещали «один файл могут купить несколько
человек», «лицензия неэксклюзивная», «тираж»; так же писало письмо после оплаты, и те же
фразы цитировал Листик из своего индекса.

## Что сделано

- `backend/salon_bot/material_store/core.py`: работа без поля `licences` получает один
  экземпляр (`DEFAULT_LICENCES = 1`). Опубликованная версия теперь может только потерять
  непроданные экземпляры: `sync_catalog` удаляет свободные строки выше нового числа, отказывает
  `licence_in_use`, если там бронь или продажа, и по-прежнему отказывает
  `immutable_version_changed` на любое другое изменение, включая «довоз» экземпляров. Каждое
  снятие пишет в `audit` событие `licences_withdrawn`. `TERMS_VERSION` → `2026-10-30.v1`:
  текст условий изменился, а версия сохраняется с каждой покупкой.
- `http.py`: письмо после оплаты вместо «Лицензия неэксклюзивная» говорит, что работа продаётся
  одному покупателю и снята с продажи.
- `shop.html`, `shop-terms.html`, `assets/js/material-store.js` — `apply_static.py`. Карточка:
  «В продаже / Сейчас оформляют / Продано» и «Один экземпляр: после оплаты работа снимается
  с продажи»; витрина наверху показывает у проданной работы статус вместо цены и по умолчанию
  выбирает доступную. Условия прямо говорят, что это правило продаж магазина, а правообладатель
  сохраняет право выдачи лицензий другим лицам, поэтому лицензия простая (подп. 1 п. 1
  ст. 1236 ГК РФ); карточка «Продано» и выбранные страницы предпросмотра остаются на сайте.
  Ссылка на скрипт получила новый `?v=20261030-one-copy&r=…`, иначе сервис-воркер отдал бы
  старый файл из кэша.
- Индекс Листика (`app/services/assistant_knowledge.json`) — `refresh_listik.py`: заменены только
  изменившиеся фрагменты двух страниц магазина (4 + 5); девять фрагментов с карточками работ,
  которые релиз 11 сентября дописал к `/shop.html`, и остальные 75 страниц не тронуты.
- `backend/salon_bot/install_shop_one_copy.py` — установка и откат (ниже).

Не менялись: цены, форма ответа API, бронь 15 минут, `assets/store/catalogue-public.json`
(ни одна страница его не подключает, в логах nginx обращений нет).

## Установка (как выполнено)

```bash
# статика: новый релиз рядом с текущим, current пока не трогаем
cp -a /var/www/academic_saloon/releases/release243-ds-shell-3adcc8f9 /var/www/academic_saloon/releases/release244-shop-one-copy-9bcaaecd
python3 scripts/shop-one-copy-20261030/apply_static.py /var/www/academic_saloon/releases/release244-shop-one-copy-9bcaaecd
# индекс Листика: только изменившиеся фрагменты
cp /root/salon_bot/app/services/assistant_knowledge.json knowledge.new.json
python3 scripts/shop-one-copy-20261030/refresh_listik.py knowledge.new.json <release243> <release244>
# бэкенд: preflight, затем --apply (копия базы и файлов, снятие экземпляров, новые файлы)
/root/salon_bot/venv/bin/python backend/salon_bot/install_shop_one_copy.py --app /root/salon_bot/app \
  --store /var/lib/academic-material-store --source backend/salon_bot/material_store --knowledge knowledge.new.json --apply
systemctl restart salon-bot-v2
# статика: атомарная смена указателя, только если current всё ещё release243
ln -sfn /var/www/academic_saloon/releases/release244-shop-one-copy-9bcaaecd /var/www/academic_saloon/.cur && mv -T /var/www/academic_saloon/.cur /var/www/academic_saloon/current
```

Установщик сверяет точные хэши живых `core.py`, `http.py`, `catalogue.json` и индекса Листика,
снимает копию базы через backup API SQLite, сначала прогоняет снятие на этой копии и только
потом — одной транзакцией на живой базе. Новые файлы заранее записываются рядом с живыми; после
коммита остаются только атомарные переименования, первым — `catalogue.json`. Любое промежуточное
состояние запускается и старым, и новым `core.py`; если переименование всё же сорвётся,
установщик печатает точную команду отката.

## Откат

```bash
systemctl stop salon-bot-v2
/root/salon_bot/venv/bin/python backend/salon_bot/install_shop_one_copy.py --app /root/salon_bot/app \
  --store /var/lib/academic-material-store --rollback /root/salon_bot/backups/shop-one-copy-<метка>
systemctl start salon-bot-v2
ln -sfn /var/www/academic_saloon/releases/release243-ds-shell-3adcc8f9 /var/www/academic_saloon/.cur && mv -T /var/www/academic_saloon/.cur /var/www/academic_saloon/current
```

Сервис на время отката остановлен: иначе новый код до перезапуска продолжил бы продавать
«в одном экземпляре» работы, которым база уже вернула пять. Откат отказывается работать, если
после установки кто-то поменял любой из четырёх файлов. Работы, которые к этому моменту
забронировали, купили или оплачивали по условиям `2026-10-30.v1`, остаются в одном экземпляре
(и в базе, и в восстановленном `catalogue.json`): покупателю обещали, что работа снята
с продажи. Остальным база возвращает пять экземпляров прямой правкой (`audit` получает
`licences_restored`), четыре файла берутся из копии. Файл базы из копии не восстанавливать:
поверх него потеряются покупки, сделанные после установки.
