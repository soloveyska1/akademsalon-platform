"""Слой данных: SQLite (aiosqlite), без внешних сервисов.

Одно соединение на процесс, WAL, простые функции вместо ORM.
Времена храним в UTC ISO, показываем в МСК (config.MSK).
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

import aiosqlite

from . import config, migrations

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  username TEXT, first_name TEXT, last_name TEXT,
  phone TEXT, source TEXT,
  created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'new',
  work_type TEXT, work_label TEXT,
  discipline TEXT, term TEXT, tier TEXT,
  topic TEXT, details TEXT,
  deadline_text TEXT, deadline_date TEXT,
  quote_low INTEGER, quote_high INTEGER,
  price INTEGER, prepay INTEGER,
  source TEXT DEFAULT 'bot',
  admin_note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  position INTEGER NOT NULL,
  client_id TEXT,
  parent_client_id TEXT,
  kind TEXT NOT NULL,
  catalog_id TEXT NOT NULL,
  label TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  config_json TEXT,
  answers_json TEXT,
  topic TEXT,
  deadline_text TEXT,
  requirements TEXT,
  note TEXT,
  quote_low INTEGER,
  quote_high INTEGER,
  final_price INTEGER,
  request_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(order_id, position)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id, position);
CREATE TABLE IF NOT EXISTS order_files(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  direction TEXT NOT NULL,
  file_id TEXT NOT NULL, file_unique_id TEXT,
  file_name TEXT, file_size INTEGER, kind TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS delivery_artifacts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  version INTEGER NOT NULL,
  source_file_id TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_file_size INTEGER,
  source_sha256 TEXT NOT NULL,
  preview_file_id TEXT,
  mode TEXT NOT NULL DEFAULT 'protected', -- protected | clean_revision
  phase TEXT NOT NULL DEFAULT 'master_review',
  created_at TEXT NOT NULL,
  published_at TEXT,
  accepted_at TEXT,
  release_started_at TEXT,
  released_at TEXT,
  UNIQUE(order_id, version)
);
CREATE TABLE IF NOT EXISTS delivery_artifact_files(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_id INTEGER NOT NULL REFERENCES delivery_artifacts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source_file_id TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_file_size INTEGER,
  source_sha256 TEXT NOT NULL,
  preview_file_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(artifact_id, position)
);
CREATE TABLE IF NOT EXISTS handoff_deliveries(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_id INTEGER NOT NULL REFERENCES delivery_artifacts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,                    -- preview | source
  channel TEXT NOT NULL,                 -- cabinet | telegram
  status TEXT NOT NULL DEFAULT 'pending',-- pending | sending | sent
  attempts INTEGER NOT NULL DEFAULT 0,
  telegram_message_id INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  UNIQUE(artifact_id, position, kind, channel)
);
CREATE TABLE IF NOT EXISTS order_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id),
  kind TEXT NOT NULL, data TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_specifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  revision INTEGER NOT NULL,
  schema_version TEXT NOT NULL,
  specification_json TEXT NOT NULL,
  specification_hash TEXT NOT NULL,
  pdf_bytes BLOB NOT NULL,
  pdf_hash TEXT NOT NULL,
  pdf_size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'offered', -- offered | accepted | superseded | canceled
  source TEXT NOT NULL,                   -- price | offer
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  accepted_payment_id INTEGER REFERENCES payments(id),
  UNIQUE(order_id, revision)
);
CREATE INDEX IF NOT EXISTS idx_order_specifications_order
  ON order_specifications(order_id, revision);
CREATE TABLE IF NOT EXISTS promos(
  code TEXT PRIMARY KEY,           -- всегда ВЕРХНИМ регистром
  pct INTEGER,                     -- скидка в % (одно из двух: pct ИЛИ amount)
  amount INTEGER,                  -- фиксированная скидка, ₽
  cap INTEGER,                     -- потолок скидки для pct, ₽
  min_price INTEGER DEFAULT 0,     -- минимальная цена заказа
  uses_left INTEGER,               -- сколько применений осталось (NULL = безлимит)
  expires_at TEXT,                 -- YYYY-MM-DD включительно (NULL = бессрочно)
  active INTEGER DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quote_drafts(
  token TEXT PRIMARY KEY,          -- ссылка-возврат из письма «смета на почту»
  email TEXT NOT NULL,
  payload TEXT NOT NULL,           -- JSON состояния конфигуратора
  created_at TEXT NOT NULL,
  resumed_at TEXT                  -- когда вернулись по ссылке
);
CREATE TABLE IF NOT EXISTS promo_grants(
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- журнал автовыдач промокодов (family='exit')
  ip TEXT NOT NULL,                      -- кому выдали: лимиты на IP и на день
  code TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS visits(
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- «Глаз бога»: сессия посетителя сайта
  vid TEXT NOT NULL,                     -- анонимный id браузера (localStorage)
  user_id INTEGER,                       -- вошёл — знаем кто
  ip TEXT, ua TEXT,
  ref TEXT,                              -- источник: реферер + utm
  entry TEXT,                            -- первая страница сессии
  page TEXT,                             -- последняя страница
  step TEXT,                             -- где остановился (шаг конфигуратора и т.п.)
  order_id INTEGER,                      -- дошёл до заявки
  contact TEXT,                          -- контакт, если оставил
  pages INTEGER DEFAULT 1,
  bot INTEGER DEFAULT 0,                 -- краулер по user-agent
  started_at TEXT NOT NULL,
  last_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visits_vid ON visits(vid, id);
CREATE INDEX IF NOT EXISTS idx_visits_last ON visits(last_at);
CREATE TABLE IF NOT EXISTS geo_cache(
  ip TEXT PRIMARY KEY,                   -- город/страна по IP, разово и навсегда
  label TEXT, org TEXT, at TEXT
);
CREATE TABLE IF NOT EXISTS msg_map(
  chat_id INTEGER NOT NULL, message_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL, order_id INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY(chat_id, message_id)
);
CREATE TABLE IF NOT EXISTS leads(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, contact TEXT, message TEXT, calc TEXT, page TEXT,
  status TEXT DEFAULT 'new',
  linked_user_id INTEGER, order_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL, last_used_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_codes(
  code TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending|done|used
  user_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  sender TEXT NOT NULL,                     -- client|master
  text TEXT, kind TEXT DEFAULT 'text',      -- text|document|photo|voice|...
  file_name TEXT, tg_file_id TEXT, file_ref INTEGER,
  seen_client INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bonus_ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  delta INTEGER NOT NULL,                   -- >0 начисление, <0 списание
  kind TEXT NOT NULL,                       -- welcome|cashback|ref_reward|ref_gift|admin|spend|restore|revoke
  note TEXT,
  order_id INTEGER,
  expires_at TEXT,                          -- только у начислений
  consumed INTEGER DEFAULT 0,               -- сколько из начисления уже потрачено (FIFO)
  warned INTEGER DEFAULT 0,                 -- предупреждение о сгорании отправлено
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS welcome_tokens(
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  used_by INTEGER, used_at TEXT
);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL,                       -- prepay|rest
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'manual',    -- manual|yookassa
  status TEXT NOT NULL DEFAULT 'pending',   -- pending|claimed|paid|canceled
  external_id TEXT,
  created_at TEXT NOT NULL, paid_at TEXT
);
CREATE TABLE IF NOT EXISTS tips(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  method TEXT NOT NULL DEFAULT 'robokassa',
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS email_codes(
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  user_id INTEGER,
  rating INTEGER NOT NULL,
  text TEXT,
  author TEXT,                              -- подпись на сайте (имя или «Клиент»)
  status TEXT NOT NULL DEFAULT 'pending',   -- pending|approved|rejected
  created_at TEXT NOT NULL,
  moderated_at TEXT
);
CREATE TABLE IF NOT EXISTS subscriptions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan TEXT NOT NULL,                       -- plus|pro|session|custom
  features TEXT,                            -- JSON-список id фич
  price INTEGER NOT NULL,
  period_days INTEGER NOT NULL,
  discount_pct INTEGER DEFAULT 0,           -- скидка на заказы
  discount_cap INTEGER DEFAULT 0,           -- потолок скидки, ₽ на заказ
  status TEXT NOT NULL DEFAULT 'pending',   -- pending|active|expired|canceled
  order_id INTEGER,                         -- заказ-носитель оплаты
  started_at TEXT, expires_at TEXT,
  express_used INTEGER DEFAULT 0,           -- использовано экспресс-разборов
  trainer_used INTEGER DEFAULT 0,           -- использовано тренажёров защиты
  warned INTEGER DEFAULT 0,                 -- предупреждение об истечении
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS milestones(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,                   -- ISO-дата сдачи/экзамена
  notified INTEGER DEFAULT 0,               -- битовая маска напоминаний (7/3/1)
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gifts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,     -- подарочный сертификат (аванс, оферта р. 14)
  code TEXT UNIQUE NOT NULL,                -- AS-XXXX-XXXX-XXXX, показывается после оплаты
  amount INTEGER NOT NULL,                  -- номинал, ₽
  status TEXT NOT NULL DEFAULT 'pending',   -- pending|active|expired|blocked|canceled
  buyer_user_id INTEGER,                    -- покупатель, если вошёл (tg>0 / почта<0)
  buyer_name TEXT, buyer_contact TEXT,      -- контакт покупателя (почта — для писем)
  recip_name TEXT, recip_contact TEXT,      -- получатель: имя на сертификате + почта (опц.)
  congrats TEXT,                            -- поздравление, печатается на сертификате
  deliver_at TEXT,                          -- ISO-дата отправки получателю (NULL = сразу)
  delivered_at TEXT,                        -- письмо получателю ушло
  via TEXT,                                 -- сайт | мастер
  buy_token TEXT,                           -- секрет покупателя: управление оформлением
  claimed_at TEXT,                          -- «я оплатил» (ручной путь)
  paid_at TEXT, pay_method TEXT,
  activated_at TEXT, expires_at TEXT,       -- срок действия (12 мес с активации)
  blocked_at TEXT, block_note TEXT,
  canceled_at TEXT,
  note TEXT,                                -- заметка мастера
  warned INTEGER DEFAULT 0,                 -- предупреждение о сгорании отправлено
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gift_ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT,     -- журнал операций сертификата
  gift_id INTEGER NOT NULL REFERENCES gifts(id),
  delta INTEGER NOT NULL,                   -- +номинал/возврат, − списание
  kind TEXT NOT NULL,                       -- issue|hold|release|adjust|expire
  order_id INTEGER,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gift_ledger ON gift_ledger(gift_id, id);
CREATE TABLE IF NOT EXISTS deposits(
  id INTEGER PRIMARY KEY AUTOINCREMENT,     -- пополнение депозита (аванс, правила р. 7а)
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,                  -- внесено, ₽
  bonus_pct INTEGER NOT NULL,               -- ставка бонуса на момент пополнения
  bonus_amount INTEGER NOT NULL,            -- начислено бонусами при активации
  status TEXT NOT NULL DEFAULT 'pending',   -- pending|active|refunded|canceled
  via TEXT,                                 -- кабинет | бот | мастер
  paid_at TEXT, pay_method TEXT,
  refunded_at TEXT, refund_note TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deposit_ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT,     -- журнал кошелька: живой баланс = SUM(delta)
  user_id INTEGER NOT NULL,
  delta INTEGER NOT NULL,                   -- + пополнение, − оплата этапа/возврат
  kind TEXT NOT NULL,                       -- topup|pay|refund|adjust
  deposit_id INTEGER, order_id INTEGER,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dep_ledger ON deposit_ledger(user_id, id);
CREATE TABLE IF NOT EXISTS qa(
  id INTEGER PRIMARY KEY AUTOINCREMENT,     -- «Открытая приёмная»: вопрос → ответ мастера
  question TEXT NOT NULL,                   -- публикуемая формулировка (после редактуры)
  question_raw TEXT NOT NULL,               -- исходный текст гостя (виден только мастеру)
  pseudonym TEXT DEFAULT '',                -- подпись автора («Студентка, 4 курс»)
  email TEXT DEFAULT '',                    -- для письма с ответом; НЕ публикуется никогда
  quiet INTEGER DEFAULT 0,                  -- «тихий вопрос»: ответ письмом, без публикации
  status TEXT DEFAULT 'pending',            -- pending|published|answered(тихо)|rejected
  answer TEXT DEFAULT '',
  tag TEXT DEFAULT '',                      -- рубрика (см. qa.TAGS)
  pinned INTEGER DEFAULT 0,
  same_count INTEGER DEFAULT 0,             -- «у меня такой же вопрос»
  source TEXT DEFAULT 'site',               -- site|archive (засев из переписок мастерской)
  vid TEXT DEFAULT '', ip TEXT DEFAULT '',  -- для лимитов и бана
  user_id INTEGER,
  created_at TEXT NOT NULL,
  answered_at TEXT, published_at TEXT
);
CREATE TABLE IF NOT EXISTS qa_votes(
  qa_id INTEGER NOT NULL, vid TEXT NOT NULL,
  created_at TEXT, PRIMARY KEY(qa_id, vid)
);
CREATE TABLE IF NOT EXISTS qa_bans(
  key TEXT PRIMARY KEY,                     -- 'vid:…' | 'ip:…'
  note TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS channel_posts(
  msg_id INTEGER PRIMARY KEY,               -- витрина TG-канала на главной
  date TEXT, text TEXT, views TEXT,
  img TEXT,                                 -- имя файла в data_channel/ ('' = без картинки)
  fetched_at TEXT
);
CREATE TABLE IF NOT EXISTS oauth_ids(
  provider TEXT NOT NULL,                   -- 'vk' | 'mailru'
  ext_id TEXT NOT NULL,                     -- id пользователя у провайдера
  user_id INTEGER NOT NULL,                 -- наш аккаунт (tg>0 / почтовый<0)
  email TEXT, name TEXT,
  created_at TEXT,
  PRIMARY KEY(provider, ext_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_status ON qa(status, pinned, id);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_milestones_user ON milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_files_order ON order_files(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_artifacts_order
  ON delivery_artifacts(order_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_artifact_files_artifact
  ON delivery_artifact_files(artifact_id, position);
CREATE INDEX IF NOT EXISTS idx_handoff_deliveries_pending
  ON handoff_deliveries(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_messages_order ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_bonus_user ON bonus_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_tips_order ON tips(order_id, status);

CREATE TABLE IF NOT EXISTS offers(
  id INTEGER PRIMARY KEY AUTOINCREMENT,     -- собранная мастером заявка под ссылку
  code TEXT UNIQUE NOT NULL,                -- secrets.token_urlsafe(18) — то, что в ссылке
  order_id INTEGER NOT NULL REFERENCES orders(id),
  version INTEGER DEFAULT 1,                -- редакция: пересборка = новый код
  greet_name TEXT,                          -- ТОЛЬКО имя, без фамилии (Политика п. 4.4)
  intro TEXT,                               -- письмо мастера, 2–3 предложения
  volume TEXT, reqs_short TEXT, reqs_full TEXT,
  tier_label TEXT, tier_full TEXT,
  need_files INTEGER DEFAULT 0,             -- ждём материалы от клиента (меняет текст срока)
  incl_json TEXT,                           -- [{"t":"…","in":1}] — включено/отдельно
  ledger_json TEXT,                         -- [{"t":"…","a":38000}]
  rail_json TEXT,                           -- календарь работы, см. ниже
  pay_url TEXT, pay_kind TEXT, pay_amount INTEGER,
  pay_inv INTEGER DEFAULT 0,                -- InvId (=payments.id) кэшированной ссылки
  pay_at TEXT,
  pay_nonce TEXT,                           -- одноразовый ключ предъявителя платежа
  notify_to TEXT,                   -- почта для ОДНОГО письма об оплате.
                                    -- В orders.guest_contact НЕ льётся автоматически:
                                    -- mailer подставляет туда ссылку с access_token,
                                    -- и подменённый адрес получил бы ключ от дела.
  expires_at TEXT,                          -- created + ttl (по умолчанию 14 дней)
  opens INTEGER DEFAULT 0, opened_at TEXT,
  paid_at TEXT,
  accept_json TEXT,                         -- фиксация акцепта (Политика п. 2.5)
  specification_json TEXT,                  -- канонический JSON показанной редакции
  specification_hash TEXT,                  -- SHA-256 канонического JSON
  specification_pdf BLOB,                   -- точные байты показанного PDF
  specification_pdf_hash TEXT,              -- SHA-256 точных байтов PDF
  specification_pdf_size INTEGER,
  specification_revision INTEGER,
  specification_schema TEXT,
  specification_created_at TEXT,
  specification_snapshot_id INTEGER,
  status TEXT NOT NULL DEFAULT 'live',      -- live | paid | replaced | canceled
  replaced_by INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_offers_order ON offers(order_id);
"""

# добавочные колонки для заказов с сайта (идемпотентно, на живой базе)
MIGRATE_COLUMNS = {
    # CREATE TABLE IF NOT EXISTS новые колонки в существующую таблицу
    # не добавляет — только этот список это и делает.
    "offers": [
        ("notify_to", "TEXT"),    # почта для ОДНОГО письма об оплате
        ("paid_nonce", "TEXT"),   # снимок nonce НА МОМЕНТ подтверждения оплаты
        ("page_ver", "TEXT"),     # версия статики листа при нажатии «Оплатить»
        # Договорный снимок: эти поля после первой записи защищены триггером.
        ("specification_json", "TEXT"),
        ("specification_hash", "TEXT"),
        ("specification_pdf", "BLOB"),
        ("specification_pdf_hash", "TEXT"),
        ("specification_pdf_size", "INTEGER"),
        ("specification_revision", "INTEGER"),
        ("specification_schema", "TEXT"),
        ("specification_created_at", "TEXT"),
        ("specification_snapshot_id", "INTEGER"),
    ],
    "payments": [
        ("nonce", "TEXT"),   # ключ предъявителя, привязанный к ЭТОМУ InvId
    ],
    "order_items": [
        # Локальные идентификаторы строк сметы связывают допуслугу с работой.
        # Это не FK: ключ живёт только внутри одного снимка клиентской корзины.
        ("client_id", "TEXT"),
        ("parent_client_id", "TEXT"),
        # Нормализованный полный payload строки request schema v2.
        # Legacy-колонки остаются для поиска/отчётов, договорные поля не теряются.
        ("request_json", "TEXT"),
    ],
    "orders": [
        ("access_token", "TEXT"),      # гостевой доступ к заказу из кабинета сайта
        ("guest_name", "TEXT"),
        ("guest_contact", "TEXT"),
        ("cancel_reason", "TEXT"),     # причина отказа (клиент указывает по желанию)
        ("bonus_spent", "INTEGER"),    # сколько бонусов клиент применил к заказу
        ("consent_at", "TEXT"),        # когда клиент отметил согласие в форме сайта
        ("consent_doc", "TEXT"),       # версии документов на момент согласия
        ("page", "TEXT"),              # страница, с которой пришла заявка
        ("client_request_id", "TEXT"), # идемпотентность повторной отправки с сайта
        ("request_fingerprint", "TEXT"), # существенный payload для безопасного retry
        ("topic_id", "INTEGER"),       # форум-топик заказа в рабочей группе
        ("ref_hint", "INTEGER"),       # ?ref= у гостевой заявки — станет referrer_id после привязки
        # поэтапная сдача: план 2 части (50/50) или 3 части (30/40/30);
        # NULL — старый заказ без этапов (одна выдача, предоплата+остаток)
        ("stages_total", "INTEGER"),
        ("stage", "INTEGER DEFAULT 1"),          # какая часть сейчас в работе/на проверке
        ("parts_done", "INTEGER DEFAULT 0"),     # сколько частей клиент уже принял
        # мягкий архив с восстановлением: заказ никуда не исчезает
        ("archived_client", "INTEGER DEFAULT 0"),
        ("archived_admin", "INTEGER DEFAULT 0"),
        # пауза: дело придержано (клиентом или мастером), напоминания молчат
        ("paused", "INTEGER DEFAULT 0"),
        ("paused_by", "TEXT"),                   # client|admin — кто поставил
        ("paused_at", "TEXT"),
        # закрепление в кабинете: закреплённые дела показываются первыми
        ("pinned_client", "INTEGER DEFAULT 0"),
        # финал готов, но придержан до полной оплаты (мастер объявил остаток)
        ("final_ready", "INTEGER DEFAULT 0"),
        ("final_ready_at", "TEXT"),
        # промежуточная часть готова и придержана до оплаты этапа
        # (номер части; 0 — ничего не объявлено). «Сначала оплата — потом файл».
        ("part_ready", "INTEGER DEFAULT 0"),
        # до какого момента клиент видел файлы дела (метки «новый» в кабинете)
        ("files_seen_at", "TEXT"),
        # автоскидка активной подписки «Салон+» (₽, фиксируется при цене)
        ("sub_discount", "INTEGER DEFAULT 0"),
        # промокод рекламной кампании: код с заявки и применённая скидка (₽).
        # С подпиской не суммируется — при цене действует бо́льшая из двух.
        ("promo_code", "TEXT"),
        ("promo_discount", "INTEGER DEFAULT 0"),
        # рабочий стол мастера («Глаз бога»): закрепление, цветная метка,
        # корзина (deleted=1 — скрыт отовсюду у мастера, данные не стираются)
        ("pinned_admin", "INTEGER DEFAULT 0"),
        ("color", "TEXT"),
        ("deleted", "INTEGER DEFAULT 0"),
        # подарочный сертификат: код с заявки/кабинета и зачтённая сумма (₽).
        # Сертификат — средство платежа, НЕ скидка: вычитается после скидок
        # и бонусов, кэшбэк идёт только с денежной доплаты.
        ("gift_code", "TEXT"),
        ("gift_amount", "INTEGER DEFAULT 0"),
        # Зеркало текущей фазы безопасной выдачи для быстрых карточек.
        # Приватный file_id оригинала хранится ТОЛЬКО в delivery_artifacts.
        ("handoff_artifact_id", "INTEGER"),
        ("handoff_phase", "TEXT"),
        ("handoff_version", "INTEGER DEFAULT 0"),
    ],
    # семейство кода: одноимённые автокоды («exit» — код возврата к заявке)
    # применяются не больше одного раза на клиента, см. promo.apply()
    "promos": [
        ("family", "TEXT"),
    ],
    # «тихая» сессия мастера в кабинете клиента (imp=1): маячок визитов,
    # снятие меток «новый файл/непрочитанное» и прочий шум отключаются
    "sessions": [
        ("imp", "INTEGER DEFAULT 0"),
    ],
    "users": [
        ("banned", "INTEGER DEFAULT 0"),
        ("referrer_id", "INTEGER"),    # кто пригласил (ref_<id> deep-link или ?ref= сайта)
        ("welcome_at", "TEXT"),        # когда получен приветственный бонус
        ("email", "TEXT"),             # почтовый аккаунт сайта (id < 0 — не Telegram)
        # Реклама — только по ПРЕДВАРИТЕЛЬНОМУ согласию (ч. 1 ст. 18 ФЗ «О рекламе»),
        # и бремя доказывания на нас. Поэтому умолчание 0, а дата согласия пишется
        # отдельно: без неё согласие недоказуемо. Сервисные уведомления по заказу
        # рекламой не являются и этим флагом НЕ управляются.
        ("subscribed", "INTEGER DEFAULT 0"),   # согласие на новости/акции (/startnews)
        ("subscribed_at", "TEXT"),             # когда согласие дано — доказательство
    ],
    "order_files": [
        ("part", "INTEGER"),           # к какой части сдачи относится файл мастера
        ("label", "TEXT"),             # пометка: чек, отзыв, правки…
    ],
    # собственный платёжный контур подписки (подписка — НЕ заказ):
    # pending → (claimed_at) → active | canceled. Легаси-строки с order_id
    # (заказ-носитель) дорабатывают по-старому и постепенно уходят.
    "subscriptions": [
        ("via", "TEXT"),               # бот | сайт — где оформлена
        ("claimed_at", "TEXT"),        # клиент отметил «я оплатил подписку»
        ("paid_at", "TEXT"),           # оплата подтверждена (мастер/провайдер)
        ("pay_method", "TEXT"),        # manual | robokassa | yookassa
        ("canceled_at", "TEXT"),
        # автопродление БЕЗ автосписания: при истечении сами собираем новый
        # счёт на тот же план и присылаем — деньги списываются только руками
        ("auto_renew", "INTEGER DEFAULT 0"),
    ],
}

_conn: aiosqlite.Connection | None = None
_db_path: str | None = None

# --------------------------------------------------------------- шина изменений
# Кабинет и админка слушают GET /api/events (long-poll): любое движение по
# делам мгновенно будит ожидающие запросы — сайт обновляется без задержек
# поллинга. Версия монотонная, данных не несёт (их забирают обычными ручками).
_bus_version = 0
_bus_waiters: list = []


def bus_version() -> int:
    return _bus_version


def bus_bump() -> None:
    global _bus_version
    _bus_version += 1
    for fut in _bus_waiters[:]:
        if not fut.done():
            fut.set_result(_bus_version)
    _bus_waiters.clear()


async def bus_wait(since: int, timeout: float = 25.0) -> int:
    """Дождаться версии новее since (или таймаута) — long-poll для сайта."""
    import asyncio
    if _bus_version > since:
        return _bus_version
    fut = asyncio.get_running_loop().create_future()
    _bus_waiters.append(fut)
    try:
        await asyncio.wait_for(fut, timeout)
    except asyncio.TimeoutError:
        pass
    finally:
        try:
            _bus_waiters.remove(fut)
        except ValueError:
            pass
    return _bus_version


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


_SESSION_HASH_PREFIX = "s1$"


def _session_token_key(token: str) -> str:
    return _SESSION_HASH_PREFIX + hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _harden_session_tokens() -> None:
    """Односторонне захешировать legacy session tokens без разлогинивания.

    Клиент продолжает предъявлять прежний raw token, а lookup хеширует его
    перед запросом. Поэтому утечка SQLite больше не даёт готовую сессию.
    """
    cur = await conn().execute(
        "SELECT token FROM sessions WHERE token_hash_version=0"
    )
    for row in await cur.fetchall():
        old = row["token"]
        key = old if old.startswith(_SESSION_HASH_PREFIX) else _session_token_key(old)
        await conn().execute(
            "UPDATE sessions SET token=?,token_hash_version=1 "
            "WHERE token=? AND token_hash_version=0",
            (key, old),
        )
    await conn().commit()


def to_msk(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        dt = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        return dt.astimezone(config.MSK).strftime("%d.%m %H:%M")
    except ValueError:
        return iso


async def init(path: str) -> None:
    global _conn, _db_path
    _db_path = path
    _conn = await aiosqlite.connect(path)
    _conn.row_factory = aiosqlite.Row
    await _conn.execute("PRAGMA journal_mode=WAL")
    await _conn.execute("PRAGMA foreign_keys=ON")
    await _conn.execute("PRAGMA busy_timeout=5000")
    await _conn.executescript(SCHEMA)
    for table, cols in MIGRATE_COLUMNS.items():
        cur = await _conn.execute(f"PRAGMA table_info({table})")
        existing = {r["name"] for r in await cur.fetchall()}
        for name, decl in cols:
            if name not in existing:
                await _conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
    await migrations.apply_pending(_conn)
    await _harden_session_tokens()
    # Показанная клиенту редакция является доказательным снимком. Обычные поля
    # offers (status, opens, payment nonce) меняются, договорные байты и хэши —
    # никогда. Новая редакция всегда создаётся новой строкой offers.
    await _conn.executescript("""
        CREATE TRIGGER IF NOT EXISTS trg_offers_specification_immutable
        BEFORE UPDATE OF
          specification_json, specification_hash, specification_pdf,
          specification_pdf_hash, specification_pdf_size,
          specification_revision, specification_schema,
          specification_created_at
        ON offers
        WHEN OLD.specification_json IS NOT NULL
        BEGIN
          SELECT RAISE(ABORT, 'immutable specification snapshot');
        END;
        CREATE TRIGGER IF NOT EXISTS trg_order_specifications_immutable
        BEFORE UPDATE OF
          order_id, revision, schema_version, specification_json,
          specification_hash, pdf_bytes, pdf_hash, pdf_size, source, created_at
        ON order_specifications
        BEGIN
          SELECT RAISE(ABORT, 'immutable order specification snapshot');
        END;
    """)
    # человекочитаемые номера заказов начинаются со 101
    await _conn.execute(
        "INSERT INTO sqlite_sequence(name, seq) SELECT 'orders', 100 "
        "WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='orders')"
    )
    # индекс на почту — после миграции колонок (в SCHEMA колонки ещё нет)
    await _conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL"
    )
    await _conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_request "
        "ON orders(client_request_id) WHERE client_request_id IS NOT NULL"
    )
    await _conn.execute("CREATE INDEX IF NOT EXISTS idx_email_codes ON email_codes(email)")
    # Старые завершённые выдачи появились до журнала handoff_deliveries.
    # Помечаем их доставленными один раз при миграции, иначе первая синхронизация
    # после обновления повторно отправит клиенту уже полученный пакет файлов.
    cur = await _conn.execute(
        "SELECT id,order_id,phase,published_at,released_at,created_at "
        "FROM delivery_artifacts WHERE phase IN ('preview_published','accepted_wait_pay','released')"
    )
    for artifact in await cur.fetchall():
        files_cur = await _conn.execute(
            "SELECT position FROM delivery_artifact_files WHERE artifact_id=? ORDER BY position",
            (artifact["id"],),
        )
        positions = [int(row["position"]) for row in await files_cur.fetchall()] or [0]
        kind = "source" if artifact["phase"] == "released" else "preview"
        delivered_at = (
            artifact["released_at"] if kind == "source" else artifact["published_at"]
        ) or artifact["created_at"] or now_iso()
        order_cur = await _conn.execute("SELECT user_id FROM orders WHERE id=?", (artifact["order_id"],))
        order = await order_cur.fetchone()
        channels = ("cabinet", "telegram") if order and order["user_id"] else ("cabinet",)
        for position in positions:
            for channel in channels:
                await _conn.execute(
                    "INSERT OR IGNORE INTO handoff_deliveries("
                    "artifact_id,position,kind,channel,status,attempts,sent_at,created_at,updated_at"
                    ") VALUES(?,?,?,?, 'sent',1,?,?,?)",
                    (artifact["id"], position, kind, channel,
                     delivered_at, delivered_at, delivered_at),
                )
    analytics_cutoff = (
        datetime.now(timezone.utc)
        - timedelta(days=config.ANALYTICS_RETENTION_DAYS)
    ).strftime("%Y-%m-%dT%H:%M:%S")
    await _conn.execute("DELETE FROM visits WHERE last_at < ?", (analytics_cutoff,))
    # First-party analytics остаётся агрегатной и не связывается с кабинетом,
    # заказом или контактом (Политика 2.3.2). Legacy-связки обезличиваем.
    await _conn.execute(
        "UPDATE visits SET user_id=NULL,order_id=NULL,contact=NULL "
        "WHERE user_id IS NOT NULL OR order_id IS NOT NULL OR contact IS NOT NULL"
    )
    await _conn.execute(
        "DELETE FROM geo_cache WHERE at IS NOT NULL AND at < ?",
        (analytics_cutoff,),
    )
    await _conn.commit()


async def close() -> None:
    if _conn:
        await _conn.close()


def conn() -> aiosqlite.Connection:
    assert _conn is not None, "db.init() не вызван"
    return _conn


async def _exec(sql: str, args: Iterable[Any] = ()) -> aiosqlite.Cursor:
    cur = await conn().execute(sql, tuple(args))
    await conn().commit()
    return cur

# ------------------------------------------------------------------- users

async def upsert_user(tg_user, source: str | None = None) -> None:
    ts = now_iso()
    await _exec(
        """INSERT INTO users(id, username, first_name, last_name, source, created_at, last_seen_at)
           VALUES(?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             username=excluded.username, first_name=excluded.first_name,
             last_name=excluded.last_name, last_seen_at=excluded.last_seen_at""",
        (tg_user.id, tg_user.username, tg_user.first_name, tg_user.last_name, source, ts, ts),
    )


async def get_user(user_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM users WHERE id=?", (user_id,))
    return await cur.fetchone()


async def is_new_user(user_id: int) -> bool:
    return await get_user(user_id) is None

# ------------------------------------------------------------------ orders

async def create_order(**f) -> int:
    ts = now_iso()
    keys = list(f.keys()) + ["created_at", "updated_at"]
    vals = list(f.values()) + [ts, ts]
    sql = f"INSERT INTO orders({','.join(keys)}) VALUES({','.join('?' * len(vals))})"
    cur = await _exec(sql, vals)
    order_id = cur.lastrowid
    await add_event(order_id, "created", f.get("source") or "bot")
    return order_id


async def create_order_bundle(items: list[dict], **f) -> int:
    """Создать заказ, состав и created-event одной изолированной транзакцией.

    Основной connection общий для asyncio-задач. Держать на нём BEGIN между
    await нельзя: чужой ``_exec`` способен закоммитить нашу транзакцию. Поэтому
    комплексная заявка использует отдельное соединение и атомарно появляется
    целиком либо не появляется вовсе.
    """
    if not _db_path:
        raise RuntimeError("db.init() не вызван")
    ts = now_iso()
    keys = list(f.keys()) + ["created_at", "updated_at"]
    vals = list(f.values()) + [ts, ts]
    c = await aiosqlite.connect(_db_path)
    try:
        c.row_factory = aiosqlite.Row
        await c.execute("PRAGMA foreign_keys=ON")
        await c.execute("PRAGMA busy_timeout=5000")
        await c.execute("PRAGMA journal_mode=WAL")
        await c.execute("BEGIN IMMEDIATE")
        sql = f"INSERT INTO orders({','.join(keys)}) VALUES({','.join('?' * len(vals))})"
        cur = await c.execute(sql, vals)
        order_id = int(cur.lastrowid)
        for pos, item in enumerate(items, 1):
            await c.execute(
                "INSERT INTO order_items(order_id,position,client_id,parent_client_id,"
                "kind,catalog_id,label,qty,"
                "config_json,answers_json,topic,deadline_text,requirements,note,"
                "quote_low,quote_high,request_json,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    order_id, pos, item.get("client_id"), item.get("parent_client_id"),
                    item["kind"], item["catalog_id"], item["label"], item["qty"],
                    json.dumps(item.get("config") or {}, ensure_ascii=False),
                    json.dumps(item.get("answers") or {}, ensure_ascii=False),
                    item.get("topic"), item.get("deadline"), item.get("requirements"),
                    item.get("note"), item.get("quote_low"), item.get("quote_high"),
                    json.dumps(item.get("request") or {}, ensure_ascii=False,
                               sort_keys=True, separators=(",", ":")),
                    ts,
                ),
            )
        await c.execute(
            "INSERT INTO order_events(order_id,kind,data,created_at) VALUES(?,?,?,?)",
            (order_id, "created", f.get("source") or "bot", ts),
        )
        await c.commit()
    except Exception:
        await c.rollback()
        raise
    finally:
        await c.close()
    bus_bump()
    return order_id


async def order_by_client_request(request_id: str) -> aiosqlite.Row | None:
    cur = await conn().execute(
        "SELECT * FROM orders WHERE client_request_id=? LIMIT 1", (request_id,))
    return await cur.fetchone()


async def items_for_order(order_id: int) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT * FROM order_items WHERE order_id=? ORDER BY position", (order_id,))
    return await cur.fetchall()


async def get_order(order_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM orders WHERE id=?", (order_id,))
    return await cur.fetchone()


async def update_order(order_id: int, **f) -> None:
    f["updated_at"] = now_iso()
    sets = ",".join(f"{k}=?" for k in f)
    await _exec(f"UPDATE orders SET {sets} WHERE id=?", list(f.values()) + [order_id])


async def purge_order(order_id: int) -> None:
    """Стереть дело НАВСЕГДА — вместе с хроникой, файлами, перепиской.

    Только для мусора из корзины (тестовые заявки): вызывающий обязан
    проверить deleted=1 и отсутствие реальных оплат. Возвраты бонусов и
    зачёта сертификата — тоже на вызывающем, ДО стирания."""
    c = conn()
    for sql in (
        "DELETE FROM handoff_deliveries WHERE artifact_id IN "
        "(SELECT id FROM delivery_artifacts WHERE order_id=?)",
        "DELETE FROM delivery_artifact_files WHERE artifact_id IN "
        "(SELECT id FROM delivery_artifacts WHERE order_id=?)",
        "DELETE FROM delivery_artifacts WHERE order_id=?",
        "DELETE FROM order_events WHERE order_id=?",
        "DELETE FROM order_files WHERE order_id=?",
        "DELETE FROM messages WHERE order_id=?",
        "DELETE FROM payments WHERE order_id=?",
        "DELETE FROM msg_map WHERE order_id=?",
        "DELETE FROM reviews WHERE order_id=?",
        "DELETE FROM order_items WHERE order_id=?",
        "DELETE FROM orders WHERE id=?",
    ):
        await c.execute(sql, (order_id,))
    await c.commit()
    bus_bump()


# ---------------------------------------------------- «смета на почту»

async def quote_draft_add(token: str, email: str, payload: dict) -> None:
    await _exec("INSERT INTO quote_drafts(token, email, payload, created_at) "
                "VALUES(?,?,?,?)",
                (token, email, json.dumps(payload, ensure_ascii=False), now_iso()))


async def quote_draft_get(token: str) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM quote_drafts WHERE token=?", (token,))
    return await cur.fetchone()


async def quote_draft_touch(token: str) -> None:
    await _exec("UPDATE quote_drafts SET resumed_at=? WHERE token=? AND resumed_at IS NULL",
                (now_iso(), token))


# ------------------------------------------------------------------ промокоды

async def promo_get(code: str) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM promos WHERE code=?",
                               ((code or "").strip().upper(),))
    return await cur.fetchone()


async def promo_add(code: str, *, pct: int | None = None, amount: int | None = None,
                    cap: int | None = None, min_price: int = 0,
                    uses_left: int | None = None, expires_at: str | None = None,
                    note: str | None = None, family: str | None = None) -> None:
    """Создать/перезаписать код (перезапись — сознательное решение владельца)."""
    await _exec(
        "INSERT INTO promos(code, pct, amount, cap, min_price, uses_left, expires_at,"
        " active, note, family, created_at) VALUES(?,?,?,?,?,?,?,1,?,?,?) "
        "ON CONFLICT(code) DO UPDATE SET pct=excluded.pct, amount=excluded.amount,"
        " cap=excluded.cap, min_price=excluded.min_price, uses_left=excluded.uses_left,"
        " expires_at=excluded.expires_at, active=1, note=excluded.note,"
        " family=excluded.family",
        (code.strip().upper(), pct, amount, cap, min_price, uses_left, expires_at,
         note, family, now_iso()))


async def promo_set_active(code: str, active: bool) -> bool:
    cur = await _exec("UPDATE promos SET active=? WHERE code=?",
                      (1 if active else 0, code.strip().upper()))
    return cur.rowcount > 0


async def promo_list() -> list[aiosqlite.Row]:
    cur = await conn().execute("SELECT * FROM promos ORDER BY created_at DESC LIMIT 50")
    return list(await cur.fetchall())


async def promo_dec_uses(code: str) -> None:
    """Списать одно применение (только для кодов с лимитом)."""
    await _exec("UPDATE promos SET uses_left = uses_left - 1 "
                "WHERE code=? AND uses_left IS NOT NULL AND uses_left > 0",
                (code.strip().upper(),))


async def promo_family_used(family: str, user_id: int | None,
                            contact: str | None,
                            exclude_order: int | None = None) -> bool:
    """Применял ли клиент уже код этого семейства (по tg-аккаунту или контакту).

    Семейные автокоды («exit») — один раз на клиента: смотрим заказы с
    зафиксированной скидкой такого кода. Гость без совпадений — не находим,
    это осознанный компромисс (контакт — единственная его примета).
    """
    conds, args = [], []
    if user_id:
        conds.append("o.user_id=?")
        args.append(user_id)
    if contact:
        conds.append("LOWER(TRIM(o.guest_contact))=LOWER(TRIM(?))")
        args.append(contact)
    if not conds:
        return False
    sql = ("SELECT COUNT(*) AS n FROM orders o JOIN promos p ON p.code=o.promo_code "
           "WHERE p.family=? AND o.promo_discount>0 AND (" + " OR ".join(conds) + ")")
    args = [family] + args
    if exclude_order:
        sql += " AND o.id<>?"
        args.append(exclude_order)
    cur = await conn().execute(sql, tuple(args))
    row = await cur.fetchone()
    return bool(row and row["n"])


async def promo_grant_add(ip: str, code: str) -> None:
    await _exec("INSERT INTO promo_grants(ip, code, created_at) VALUES(?,?,?)",
                (ip, code, now_iso()))


async def promo_grants_recent(ip: str, hours: int = 24) -> int:
    """Сколько автокодов выдано этому IP за последние N часов."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)) \
        .strftime("%Y-%m-%dT%H:%M:%S")
    cur = await conn().execute(
        "SELECT COUNT(*) AS n FROM promo_grants WHERE ip=? AND created_at>=?",
        (ip, since))
    row = await cur.fetchone()
    return int(row["n"]) if row else 0


async def promo_grants_today() -> int:
    """Сколько автокодов выдано всем за текущие сутки (UTC) — стоп-кран."""
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cur = await conn().execute(
        "SELECT COUNT(*) AS n FROM promo_grants WHERE created_at>=?", (day,))
    row = await cur.fetchone()
    return int(row["n"]) if row else 0


async def promo_exit_stats() -> dict:
    """Сводка по автокодам возврата — для /promo в боте."""
    cur = await conn().execute("SELECT COUNT(*) AS n FROM promo_grants")
    issued = int((await cur.fetchone())["n"])
    cur = await conn().execute(
        "SELECT COUNT(*) AS n, COALESCE(SUM(o.promo_discount),0) AS s "
        "FROM orders o JOIN promos p ON p.code=o.promo_code "
        "WHERE p.family='exit' AND o.promo_discount>0")
    row = await cur.fetchone()
    return {"issued": issued, "redeemed": int(row["n"]), "sum": int(row["s"])}


# ------------------------------------------------ визиты («Глаз бога»)

VISIT_SESSION_MIN = 30  # пауза дольше — считаем новой сессией


async def visit_touch(vid: str, *, ip: str, ua: str, page: str,
                      ref: str | None = None, step: str | None = None,
                      is_view: bool = True, bot: bool = False) -> int:
    """Маячок сайта: обновить открытую сессию посетителя или начать новую."""
    now = datetime.now(timezone.utc)
    cur = await conn().execute(
        "SELECT * FROM visits WHERE vid=? ORDER BY id DESC LIMIT 1", (vid,))
    row = await cur.fetchone()
    fresh = None
    if row:
        try:
            last = datetime.strptime(row["last_at"], "%Y-%m-%dT%H:%M:%S") \
                .replace(tzinfo=timezone.utc)
            fresh = (now - last).total_seconds() < VISIT_SESSION_MIN * 60
        except ValueError:
            fresh = False
    if row and fresh:
        await _exec(
            "UPDATE visits SET page=?, last_at=?, pages=pages+?, "
            "step=COALESCE(?, step), bot=MAX(bot,?) WHERE id=?",
            (page or row["page"], now.strftime("%Y-%m-%dT%H:%M:%S"),
             1 if is_view else 0, step, 1 if bot else 0, row["id"]))
        return int(row["id"])
    cur = await _exec(
        "INSERT INTO visits(vid,ip,ua,ref,entry,page,step,pages,bot,started_at,last_at) "
        "VALUES(?,?,?,?,?,?,?,1,?,?,?)",
        (vid, ip, ua[:300], (ref or "")[:400] or None,
         page, page, step, 1 if bot else 0,
         now.strftime("%Y-%m-%dT%H:%M:%S"), now.strftime("%Y-%m-%dT%H:%M:%S")))
    return int(cur.lastrowid)


async def visits_list(hours: int = 24, limit: int = 200,
                      hide_bots: bool = True,
                      hide_users: tuple[int, ...] = ()) -> list[aiosqlite.Row]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)) \
        .strftime("%Y-%m-%dT%H:%M:%S")
    sql = "SELECT * FROM visits WHERE last_at>=?"
    args: list = [since]
    if hide_bots:
        sql += " AND coalesce(bot,0)=0"
    if hide_users:
        sql += f" AND (user_id IS NULL OR user_id NOT IN ({','.join('?' * len(hide_users))}))"
        args.extend(hide_users)
    sql += " ORDER BY last_at DESC LIMIT ?"
    args.append(limit)
    cur = await conn().execute(sql, tuple(args))
    return list(await cur.fetchall())


async def visits_stats(hide_users: tuple[int, ...] = ()) -> dict:
    """Плитки «Глаза бога»: сегодня (МСК-сутки грубо: 24ч), онлайн, конверсия."""
    now = datetime.now(timezone.utc)
    day_ago = (now - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S")
    online_t = (now - timedelta(minutes=3)).strftime("%Y-%m-%dT%H:%M:%S")
    extra, args = "", []
    if hide_users:
        extra = f" AND (user_id IS NULL OR user_id NOT IN ({','.join('?' * len(hide_users))}))"
        args = list(hide_users)
    cur = await conn().execute(
        "SELECT COUNT(*) n, COUNT(DISTINCT vid) u, "
        "SUM(CASE WHEN order_id IS NOT NULL THEN 1 ELSE 0 END) w "
        "FROM visits WHERE last_at>=? AND coalesce(bot,0)=0" + extra,
        tuple([day_ago] + args))
    d = await cur.fetchone()
    cur = await conn().execute(
        "SELECT COUNT(DISTINCT vid) n FROM visits "
        "WHERE last_at>=? AND coalesce(bot,0)=0" + extra,
        tuple([online_t] + args))
    onl = await cur.fetchone()
    return {"visits": int(d["n"] or 0), "uniq": int(d["u"] or 0),
            "with_order": int(d["w"] or 0), "online": int(onl["n"] or 0)}


async def geo_get(ip: str) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM geo_cache WHERE ip=?", (ip,))
    return await cur.fetchone()


async def geo_put(ip: str, label: str, org: str | None = None) -> None:
    await _exec(
        "INSERT INTO geo_cache(ip, label, org, at) VALUES(?,?,?,?) "
        "ON CONFLICT(ip) DO UPDATE SET label=excluded.label, org=excluded.org",
        (ip, label[:120], (org or "")[:120] or None, now_iso()))


async def geo_labels(ips: list[str]) -> dict[str, dict]:
    """Метки для пачки IP одним запросом (для ленты визитов)."""
    ips = [i for i in set(ips) if i]
    if not ips:
        return {}
    qmarks = ",".join("?" * len(ips))
    cur = await conn().execute(
        f"SELECT ip, label, org FROM geo_cache WHERE ip IN ({qmarks})", ips)
    return {r["ip"]: {"label": r["label"], "org": r["org"]}
            for r in await cur.fetchall()}


async def set_status(order_id: int, status: str, note: str = "") -> None:
    old = await get_order(order_id)
    f: dict = {"status": status}
    if status in ("done", "cancel"):  # закрытое дело не бывает «на паузе»
        f.update(paused=0, paused_by=None)
    await update_order(order_id, **f)
    await add_event(order_id, "status", f"{old['status'] if old else '?'}→{status}" + (f" · {note}" if note else ""))


async def orders_by_user(user_id: int, limit: int = 10) -> list[aiosqlite.Row]:
    # Корзина обязана прятать дело и от клиента: раньше фильтра deleted тут
    # не было, и \"🗑 В корзину\" убирала заказ только из админки — в кабинете
    # и в боте он продолжал висеть у клиента (инцидент 21.07.2026, дело 187).
    cur = await conn().execute(
        "SELECT * FROM orders WHERE user_id=? AND coalesce(deleted,0)=0 "
        "ORDER BY id DESC LIMIT ?", (user_id, limit)
    )
    return list(await cur.fetchall())


async def active_orders_by_user(user_id: int) -> list[aiosqlite.Row]:
    q = ",".join("?" * len(config.ACTIVE_STATUSES))
    cur = await conn().execute(
        f"SELECT * FROM orders WHERE user_id=? AND status IN ({q}) ORDER BY id DESC",
        (user_id, *config.ACTIVE_STATUSES),
    )
    return list(await cur.fetchall())


async def active_orders(limit: int = 30) -> list[aiosqlite.Row]:
    # мастерские списки и здоровье: корзина (deleted=1) не считается
    q = ",".join("?" * len(config.ACTIVE_STATUSES))
    cur = await conn().execute(
        f"SELECT * FROM orders WHERE status IN ({q}) AND coalesce(deleted,0)=0 "
        f"ORDER BY id DESC LIMIT ?",
        (*config.ACTIVE_STATUSES, limit),
    )
    return list(await cur.fetchall())


async def files_new_for_orders(rows: Iterable[tuple[int, str | None]]) -> dict[int, int]:
    """Сколько файлов мастера клиент ещё не видел: {order_id: n}."""
    out: dict[int, int] = {}
    for oid, seen in rows:
        cur = await conn().execute(
            "SELECT count(*) n FROM order_files WHERE order_id=? AND direction='admin'"
            + (" AND created_at > ?" if seen else ""),
            (oid, seen) if seen else (oid,))
        out[oid] = (await cur.fetchone())["n"]
    return out


async def orders_where(sql_tail: str, args: Iterable[Any] = ()) -> list[aiosqlite.Row]:
    cur = await conn().execute(f"SELECT * FROM orders {sql_tail}", tuple(args))
    return list(await cur.fetchall())


async def search_orders(text: str, limit: int = 15) -> list[aiosqlite.Row]:
    like = f"%{text}%"
    args: list[Any] = [like, like, like]
    id_clause = ""
    digits = "".join(ch for ch in text if ch.isdigit())
    if digits:
        id_clause = "OR o.id=? "
        args.append(int(digits))
    cur = await conn().execute(
        "SELECT o.* FROM orders o LEFT JOIN users u ON u.id=o.user_id "
        "WHERE o.topic LIKE ? OR o.work_label LIKE ? OR u.username LIKE ? "
        + id_clause + "ORDER BY o.id DESC LIMIT ?",
        (*args, limit),
    )
    return list(await cur.fetchall())


async def stats(days: int) -> dict:
    # корзина (deleted=1) во всех цифрах пульса не участвует
    cur = await conn().execute(
        "SELECT "
        " sum(CASE WHEN created_at >= datetime('now', ?) THEN 1 ELSE 0 END) AS new_n,"
        " sum(CASE WHEN status='done' AND updated_at >= datetime('now', ?) THEN 1 ELSE 0 END) AS done_n,"
        " sum(CASE WHEN status='done' AND updated_at >= datetime('now', ?) THEN coalesce(price,0) ELSE 0 END) AS done_sum "
        "FROM orders WHERE coalesce(deleted,0)=0",
        (f"-{days} days",) * 3,
    )
    row = dict(await cur.fetchone())
    # by_status — «что сейчас на столе»: архив мастера сюда не входит,
    # иначе убранные в архив тест-заявки вечно светятся бейджем «новые»
    cur = await conn().execute(
        "SELECT status, count(*) n FROM orders "
        "WHERE coalesce(deleted,0)=0 AND coalesce(archived_admin,0)=0 "
        "GROUP BY status")
    row["by_status"] = {r["status"]: r["n"] for r in await cur.fetchall()}
    cur = await conn().execute("SELECT count(*) n FROM users")
    row["users"] = (await cur.fetchone())["n"]
    cur = await conn().execute("SELECT count(*) n FROM leads")
    row["leads"] = (await cur.fetchone())["n"]
    return row

# ------------------------------------------------------------ files/events

async def add_file(order_id: int, direction: str, file_id: str, file_unique_id: str | None,
                   file_name: str | None, file_size: int | None, kind: str,
                   part: int | None = None, label: str | None = None) -> int:
    cur = await _exec(
        "INSERT INTO order_files(order_id, direction, file_id, file_unique_id, file_name,"
        " file_size, kind, part, label, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        (order_id, direction, file_id, file_unique_id, file_name, file_size, kind,
         part, label, now_iso()),
    )
    bus_bump()
    return cur.lastrowid


async def files_for_order(order_id: int) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT * FROM order_files WHERE order_id=? ORDER BY id", (order_id,)
    )
    return list(await cur.fetchall())


async def add_event(order_id: int | None, kind: str, data: str = "") -> None:
    await _exec(
        "INSERT INTO order_events(order_id, kind, data, created_at) VALUES(?,?,?,?)",
        (order_id, kind, data[:500], now_iso()),
    )
    bus_bump()


async def events_recent(limit: int = 15) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT e.*, o.work_label FROM order_events e "
        "LEFT JOIN orders o ON o.id = e.order_id ORDER BY e.id DESC LIMIT ?", (limit,))
    return list(await cur.fetchall())


async def leads_recent(limit: int = 30) -> list[aiosqlite.Row]:
    cur = await conn().execute("SELECT * FROM leads ORDER BY id DESC LIMIT ?", (limit,))
    return list(await cur.fetchall())


async def events_for_order(order_id: int, limit: int = 6) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT * FROM order_events WHERE order_id=? ORDER BY id DESC LIMIT ?", (order_id, limit)
    )
    return list(await cur.fetchall())


async def has_event(order_id: int, kind: str) -> bool:
    cur = await conn().execute(
        "SELECT 1 FROM order_events WHERE order_id=? AND kind=? LIMIT 1", (order_id, kind)
    )
    return await cur.fetchone() is not None

# ---------------------------------------------------------------- msg_map

async def map_put(chat_id: int, message_id: int, client_id: int, order_id: int | None) -> None:
    await _exec(
        "INSERT OR REPLACE INTO msg_map(chat_id, message_id, client_id, order_id, created_at)"
        " VALUES(?,?,?,?,?)",
        (chat_id, message_id, client_id, order_id, now_iso()),
    )


async def map_get(chat_id: int, message_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute(
        "SELECT * FROM msg_map WHERE chat_id=? AND message_id=?", (chat_id, message_id)
    )
    return await cur.fetchone()

# ------------------------------------------------------------------- leads

async def lead_create(name: str, contact: str, message: str, calc: dict | None, page: str) -> int:
    cur = await _exec(
        "INSERT INTO leads(name, contact, message, calc, page, created_at) VALUES(?,?,?,?,?,?)",
        (name, contact, message, json.dumps(calc, ensure_ascii=False) if calc else None, page, now_iso()),
    )
    return cur.lastrowid


async def lead_get(lead_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM leads WHERE id=?", (lead_id,))
    return await cur.fetchone()


async def lead_link(lead_id: int, user_id: int) -> None:
    await _exec("UPDATE leads SET status='linked', linked_user_id=? WHERE id=?", (user_id, lead_id))

# ---------------------------------------------------------------- settings

async def setting_get(key: str, default: str | None = None) -> str | None:
    cur = await conn().execute("SELECT value FROM settings WHERE key=?", (key,))
    row = await cur.fetchone()
    return row["value"] if row else default


async def setting_set(key: str, value: str) -> None:
    await _exec(
        "INSERT INTO settings(key, value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )

# ------------------------------------------------- сессии сайта и tg-вход

async def session_create(user_id: int, imp: int = 0) -> str:
    """imp=1 — «тихий» вход мастера в кабинет клиента (см. MIGRATE sessions)."""
    import secrets
    token = secrets.token_urlsafe(32)
    token_key = _session_token_key(token)
    now = datetime.now(timezone.utc)
    ts = now.strftime("%Y-%m-%dT%H:%M:%S")
    absolute_ttl = (
        config.IMPERSONATION_ABSOLUTE_TTL_SECONDS
        if imp
        else config.SESSION_ABSOLUTE_TTL_SECONDS
    )
    expires_at = (now + timedelta(seconds=absolute_ttl)).strftime("%Y-%m-%dT%H:%M:%S")
    await _exec(
        "INSERT INTO sessions("
        "token, user_id, created_at, last_used_at, imp, expires_at,"
        " token_hash_version, revoked_at"
        ") VALUES(?,?,?,?,?,?,1,NULL)",
        (token_key, user_id, ts, ts, 1 if imp else 0, expires_at),
    )
    return token


async def session_user(token: str) -> aiosqlite.Row | None:
    if not token:
        return None
    token_key = _session_token_key(token)
    cur = await conn().execute(
        "SELECT u.*, s.token, s.imp AS session_imp,"
        " s.created_at AS session_created_at,"
        " s.last_used_at AS session_last_used_at,"
        " s.expires_at AS session_expires_at,"
        " s.revoked_at AS session_revoked_at FROM sessions s "
        "JOIN users u ON u.id = s.user_id "
        "WHERE (s.token=? AND s.token_hash_version=1) "
        "OR (s.token=? AND s.token_hash_version=0)",
        (token_key, token))
    row = await cur.fetchone()
    if row:
        idle_ttl = (
            config.IMPERSONATION_IDLE_TTL_SECONDS
            if row["session_imp"]
            else config.SESSION_IDLE_TTL_SECONDS
        )
        expired = bool(row["session_revoked_at"])
        expires_at = row["session_expires_at"]
        if expires_at:
            try:
                expires = datetime.strptime(expires_at, "%Y-%m-%dT%H:%M:%S").replace(
                    tzinfo=timezone.utc
                )
                expired = expired or datetime.now(timezone.utc) >= expires
            except ValueError:
                expired = True
        else:
            absolute_ttl = (
                config.IMPERSONATION_ABSOLUTE_TTL_SECONDS
                if row["session_imp"]
                else config.SESSION_ABSOLUTE_TTL_SECONDS
            )
            expired = expired or _age_seconds(row["session_created_at"]) > absolute_ttl
        expired = expired or _age_seconds(row["session_last_used_at"]) > idle_ttl
        if expired:
            await _exec("DELETE FROM sessions WHERE token=?", (row["token"],))
            return None
    # Забаненный не проходит ни в один хендлер, даже по живой сессии:
    # раньше бан лишь мешал новому входу, а уже вошедший продолжал
    # писать в дело и грузить файлы.
    if row and (row["banned"] or 0):
        return None
    if row:
        await _exec(
            "UPDATE sessions SET last_used_at=? WHERE token=?",
            (now_iso(), row["token"]),
        )
    return row


async def session_revoke(token: str) -> bool:
    token_key = _session_token_key(token)
    cur = await _exec(
        "UPDATE sessions SET revoked_at=? "
        "WHERE ((token=? AND token_hash_version=1) "
        "OR (token=? AND token_hash_version=0)) AND revoked_at IS NULL",
        (now_iso(), token_key, token),
    )
    return cur.rowcount > 0


async def auth_code_create() -> str:
    import secrets
    code = secrets.token_urlsafe(9).replace("-", "x").replace("_", "y")
    await _exec("INSERT INTO auth_codes(code, status, created_at) VALUES(?, 'pending', ?)",
                (code, now_iso()))
    return code


async def auth_code_complete(code: str, user_id: int) -> bool:
    cur = await _exec(
        "UPDATE auth_codes SET status='done', user_id=? "
        "WHERE code=? AND status='pending' AND created_at > datetime('now', '-15 minutes')",
        (user_id, code))
    return cur.rowcount > 0


async def auth_code_take(code: str) -> int | None:
    """Если код подтверждён в боте — одноразово выдать user_id."""
    cur = await conn().execute(
        "SELECT user_id FROM auth_codes WHERE code=? AND status='done'", (code,))
    row = await cur.fetchone()
    if not row:
        return None
    await _exec("UPDATE auth_codes SET status='used' WHERE code=?", (code,))
    return row["user_id"]

# ------------------------------------------------- вход по почте (сайт)
# Аккаунты сайта живут в той же таблице users с ОТРИЦАТЕЛЬНЫМИ id:
# Telegram-id всегда положительные, поэтому пространства не пересекаются.

def _age_seconds(iso: str | None) -> float:
    """Возраст метки now_iso() в секундах; сравнение — в Python, потому что
    SQLite datetime('now') отдаёт время через пробел и лексикографическое
    сравнение с нашим T-форматом врёт."""
    if not iso:
        return 1e9
    try:
        dt = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return 1e9
    return (datetime.now(timezone.utc) - dt).total_seconds()


async def user_by_email(email: str) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM users WHERE email=?", (email,))
    return await cur.fetchone()


async def create_email_user(email: str) -> aiosqlite.Row:
    """Аккаунт по почте: id — следующий свободный отрицательный."""
    cur = await conn().execute("SELECT COALESCE(MIN(id), 0) AS m FROM users")
    row = await cur.fetchone()
    new_id = min(row["m"], 0) - 1
    ts = now_iso()
    name = email.split("@", 1)[0][:60]
    await _exec(
        "INSERT INTO users(id, username, first_name, email, source, created_at, last_seen_at)"
        " VALUES(?,?,?,?,?,?,?)",
        (new_id, None, name, email, "site-email", ts, ts))
    return await get_user(new_id)


async def create_oauth_user(name: str, source: str) -> aiosqlite.Row:
    """Аккаунт из OAuth-провайдера без почты: тот же отрицательный ряд id."""
    cur = await conn().execute("SELECT COALESCE(MIN(id), 0) AS m FROM users")
    row = await cur.fetchone()
    new_id = min(row["m"], 0) - 1
    ts = now_iso()
    await _exec(
        "INSERT INTO users(id, username, first_name, email, source, created_at, last_seen_at)"
        " VALUES(?,?,?,?,?,?,?)",
        (new_id, None, (name or "Гость")[:60], None, source, ts, ts))
    return await get_user(new_id)


async def oauth_find(provider: str, ext_id: str) -> aiosqlite.Row | None:
    cur = await conn().execute(
        "SELECT * FROM oauth_ids WHERE provider=? AND ext_id=?", (provider, ext_id))
    return await cur.fetchone()


async def oauth_link(provider: str, ext_id: str, user_id: int,
                     email: str | None, name: str | None) -> None:
    """Привязка идентичности провайдера к аккаунту (идемпотентно)."""
    await conn().execute(
        "INSERT INTO oauth_ids(provider, ext_id, user_id, email, name, created_at) "
        "VALUES(?,?,?,?,?,?) ON CONFLICT(provider, ext_id) DO UPDATE SET "
        "user_id=excluded.user_id, email=excluded.email, name=excluded.name",
        (provider, ext_id, user_id, email, name, now_iso()))
    await conn().commit()


async def oauth_links_for_user(user_id: int) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT provider, email, name, created_at FROM oauth_ids WHERE user_id=?",
        (user_id,))
    return list(await cur.fetchall())


EMAIL_CODE_TTL_S = 10 * 60
EMAIL_CODE_RESEND_S = 60
EMAIL_CODE_MAX_ATTEMPTS = 5


async def email_code_start(email: str) -> str | None:
    """Выдать свежий 6-значный код; None — не прошло 60 с с прошлой отправки."""
    import secrets
    cur = await conn().execute(
        "SELECT created_at FROM email_codes WHERE email=? ORDER BY rowid DESC LIMIT 1", (email,))
    row = await cur.fetchone()
    if row and _age_seconds(row["created_at"]) < EMAIL_CODE_RESEND_S:
        return None
    code = f"{secrets.randbelow(1_000_000):06d}"
    await _exec("DELETE FROM email_codes WHERE email=?", (email,))
    await _exec("INSERT INTO email_codes(email, code, attempts, created_at) VALUES(?,?,0,?)",
                (email, code, now_iso()))
    return code


async def email_code_check(email: str, code: str) -> str:
    """'ok' | 'wrong' | 'expired' | 'locked'. Код одноразовый, ≤5 попыток."""
    import secrets
    cur = await conn().execute(
        "SELECT rowid, * FROM email_codes WHERE email=? ORDER BY rowid DESC LIMIT 1", (email,))
    row = await cur.fetchone()
    if not row or _age_seconds(row["created_at"]) > EMAIL_CODE_TTL_S:
        return "expired"
    if row["attempts"] >= EMAIL_CODE_MAX_ATTEMPTS:
        return "locked"
    if not secrets.compare_digest(str(row["code"]), str(code)):
        await _exec("UPDATE email_codes SET attempts=attempts+1 WHERE rowid=?", (row["rowid"],))
        return "wrong"
    await _exec("DELETE FROM email_codes WHERE email=?", (email,))
    return "ok"


async def adopt_ref_hint(user_id: int) -> None:
    """Гость пришёл по ?ref= и позже привязал заказы к аккаунту —
    переносим приглашение на пользователя (однократно, не сам себя)."""
    u = await get_user(user_id)
    if not u or u["referrer_id"]:
        return
    cur = await conn().execute(
        "SELECT ref_hint FROM orders WHERE user_id=? AND ref_hint IS NOT NULL ORDER BY id LIMIT 1",
        (user_id,))
    row = await cur.fetchone()
    ref = row["ref_hint"] if row else None
    if not ref or ref == user_id or not await get_user(ref):
        return
    await _exec("UPDATE users SET referrer_id=? WHERE id=? AND referrer_id IS NULL",
                (ref, user_id))

# ------------------------------------------------------- переписка (чат)

async def msg_add(order_id: int, sender: str, text: str | None, kind: str = "text",
                  file_name: str | None = None, tg_file_id: str | None = None) -> int:
    cur = await _exec(
        "INSERT INTO messages(order_id, sender, text, kind, file_name, tg_file_id, seen_client, created_at)"
        " VALUES(?,?,?,?,?,?,?,?)",
        (order_id, sender, (text or "")[:3000] or None, kind, file_name, tg_file_id,
         1 if sender == "client" else 0, now_iso()))
    bus_bump()
    return cur.lastrowid


async def msgs_for_order(order_id: int, limit: int = 100) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT * FROM messages WHERE order_id=? ORDER BY id LIMIT ?", (order_id, limit))
    return list(await cur.fetchall())


async def msg_by_id(msg_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM messages WHERE id=?", (msg_id,))
    return await cur.fetchone()


async def msgs_mark_seen(order_id: int) -> None:
    await _exec("UPDATE messages SET seen_client=1 WHERE order_id=? AND seen_client=0", (order_id,))


async def unread_for_orders(order_ids: list[int]) -> dict[int, int]:
    if not order_ids:
        return {}
    q = ",".join("?" * len(order_ids))
    cur = await conn().execute(
        f"SELECT order_id, count(*) n FROM messages "
        f"WHERE order_id IN ({q}) AND sender='master' AND seen_client=0 GROUP BY order_id",
        order_ids)
    return {r["order_id"]: r["n"] for r in await cur.fetchall()}

# ------------------------------------------------- заказы: гостевой доступ

async def order_by_access_token(token: str) -> aiosqlite.Row | None:
    if not token:
        return None
    cur = await conn().execute("SELECT * FROM orders WHERE access_token=?", (token,))
    return await cur.fetchone()


async def order_by_token(order_id: int, token: str) -> aiosqlite.Row | None:
    if not token:
        return None
    cur = await conn().execute(
        "SELECT * FROM orders WHERE id=? AND access_token=?", (order_id, token))
    return await cur.fetchone()


async def orders_by_tokens(tokens: list[str]) -> list[aiosqlite.Row]:
    # Корзина прячет дело и от ГОСТЯ тоже. В orders_by_user фильтр поставили
    # после инцидента 21.07, а здесь он остался забытым: удалённое мастером
    # дело продолжало открываться по гостевому токену.
    tokens = [t for t in tokens if t][:30]
    if not tokens:
        return []
    q = ",".join("?" * len(tokens))
    cur = await conn().execute(
        f"SELECT * FROM orders WHERE access_token IN ({q}) "
        "AND coalesce(deleted,0)=0 ORDER BY id DESC", tokens)
    return list(await cur.fetchall())


async def ensure_access_token(order_id: int) -> str | None:
    """Токен гостевого доступа к делу; заказам из бота выдаётся лениво.

    Нужен кнопкам «Открыть в кабинете» в уведомлениях: ссылка
    dashboard.html#claim=<token> открывает дело сразу, без входа."""
    o = await get_order(order_id)
    if not o:
        return None
    if o["access_token"]:
        return o["access_token"]
    import secrets as _secrets
    token = _secrets.token_urlsafe(24)
    await _exec("UPDATE orders SET access_token=? WHERE id=? AND access_token IS NULL",
                (token, order_id))
    o2 = await get_order(order_id)
    return o2["access_token"] if o2 else token


async def claim_order_to_user(order_id: int, claim_token: str, user_id: int) -> bool:
    """Одноразово привязывает гостевое дело и отзывает предъявленный ключ.

    Новый кабинетный token увидит только уже связанный клиент в сообщении бота;
    старая ссылка, которую могли переслать до привязки, сразу перестаёт работать.
    """
    import secrets as _secrets
    new_token = _secrets.token_urlsafe(24)
    cur = await conn().execute(
        "UPDATE orders SET user_id=?,access_token=?,updated_at=? "
        "WHERE id=? AND access_token=? AND user_id IS NULL",
        (user_id, new_token, now_iso(), order_id, claim_token))
    await conn().commit()
    return cur.rowcount == 1


async def rotate_access_token(order_id: int) -> str:
    """Отзывает прежнюю гостевую ссылку и возвращает новый ключ кабинета."""
    import secrets as _secrets
    token = _secrets.token_urlsafe(24)
    await _exec("UPDATE orders SET access_token=?,updated_at=? WHERE id=?",
                (token, now_iso(), order_id))
    return token


async def promo_unused_for_user(user_id: int) -> aiosqlite.Row | None:
    """Живой промокод клиента, который он вводил, но так и не потратил.

    Код считается потраченным, когда где-то зафиксирована скидка
    (orders.promo_discount > 0). Возвращает строку promo или None."""
    if not user_id:
        return None
    cur = await conn().execute(
        "SELECT DISTINCT promo_code FROM orders "
        "WHERE user_id=? AND promo_code IS NOT NULL AND promo_code != '' "
        "ORDER BY id DESC LIMIT 10", (user_id,))
    codes = [r["promo_code"] for r in await cur.fetchall()]
    for code in codes:
        cur = await conn().execute(
            "SELECT 1 FROM orders WHERE promo_code=? AND coalesce(promo_discount,0)>0 "
            "AND user_id=? LIMIT 1", (code, user_id))
        if await cur.fetchone():
            continue  # уже отработал на другом заказе
        p = await promo_get(code)
        if p is None:
            continue
        from .services import promo as _promo  # локальный импорт против циклов
        if _promo.why_invalid(p) is not None:
            continue
        if p["family"] and await promo_family_used(p["family"], user_id, None):
            continue
        return p
    return None


async def claim_orders(tokens: list[str], user_id: int) -> int:
    tokens = [t for t in tokens if t][:30]
    if not tokens:
        return 0
    q = ",".join("?" * len(tokens))
    cur = await _exec(
        f"UPDATE orders SET user_id=? WHERE access_token IN ({q}) AND user_id IS NULL",
        [user_id, *tokens])
    return cur.rowcount


async def file_by_id(file_row_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM order_files WHERE id=?", (file_row_id,))
    return await cur.fetchone()


async def forget_user(user_id: int) -> None:
    """152-ФЗ: удаление профиля и обезличивание заказов по запросу субъекта."""
    await _exec("UPDATE orders SET user_id=NULL, guest_name='(данные удалены)', "
                "guest_contact=NULL, access_token=NULL WHERE user_id=?", (user_id,))
    await _exec("DELETE FROM sessions WHERE user_id=?", (user_id,))
    await _exec("DELETE FROM msg_map WHERE client_id=?", (user_id,))
    await _exec("DELETE FROM bonus_ledger WHERE user_id=?", (user_id,))
    await _exec("DELETE FROM users WHERE id=?", (user_id,))

# ------------------------------------------------------------ бонусный счёт

async def bonus_rows(user_id: int, limit: int = 60) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT * FROM bonus_ledger WHERE user_id=? ORDER BY id DESC LIMIT ?",
        (user_id, limit))
    return list(await cur.fetchall())


async def bonus_active_accruals(user_id: int) -> list[aiosqlite.Row]:
    """Начисления с остатком, не сгоревшие; порядок — ближайшее сгорание первым."""
    cur = await conn().execute(
        "SELECT * FROM bonus_ledger WHERE user_id=? AND delta>0 AND consumed<delta "
        "AND (expires_at IS NULL OR expires_at > ?) "
        "ORDER BY (expires_at IS NULL), expires_at, id",
        (user_id, now_iso()))
    return list(await cur.fetchall())


async def bonus_balance(user_id: int) -> int:
    rows = await bonus_active_accruals(user_id)
    return sum(r["delta"] - r["consumed"] for r in rows)


async def bonus_add(user_id: int, delta: int, kind: str, note: str = "",
                    order_id: int | None = None, ttl_days: int | None = None) -> int:
    expires = None
    if delta > 0 and ttl_days:
        expires = (datetime.now(timezone.utc) + timedelta(days=ttl_days)) \
            .strftime("%Y-%m-%dT%H:%M:%S")
    cur = await _exec(
        "INSERT INTO bonus_ledger(user_id, delta, kind, note, order_id, expires_at, created_at)"
        " VALUES(?,?,?,?,?,?,?)",
        (user_id, delta, kind, note[:300] or None, order_id, expires, now_iso()))
    return cur.lastrowid


async def bonus_has(user_id: int, kind: str) -> bool:
    cur = await conn().execute(
        "SELECT 1 FROM bonus_ledger WHERE user_id=? AND kind=? LIMIT 1", (user_id, kind))
    return await cur.fetchone() is not None


async def bonus_has_order(order_id: int, kind: str) -> bool:
    """Было ли начисление такого рода по заказу (идемпотентность кэшбэка/рефералки)."""
    cur = await conn().execute(
        "SELECT 1 FROM bonus_ledger WHERE order_id=? AND kind=? LIMIT 1", (order_id, kind))
    return await cur.fetchone() is not None


async def bonus_consume(user_id: int, amount: int, note: str,
                        order_id: int | None) -> int:
    """FIFO-списание (сначала ближайшие к сгоранию). Возвращает сколько списали."""
    left = amount
    for r in await bonus_active_accruals(user_id):
        if left <= 0:
            break
        avail = r["delta"] - r["consumed"]
        take = min(avail, left)
        await _exec("UPDATE bonus_ledger SET consumed=consumed+? WHERE id=?", (take, r["id"]))
        left -= take
    spent = amount - left
    if spent > 0:
        await bonus_add(user_id, -spent, "spend", note, order_id)
    return spent

# ------------------------------------------------------- welcome-токены сайта

async def welcome_token_create() -> str:
    import secrets
    token = secrets.token_urlsafe(12).replace("-", "x").replace("_", "y")
    await _exec("INSERT INTO welcome_tokens(token, created_at) VALUES(?,?)",
                (token, now_iso()))
    return token


async def welcome_token_use(token: str, user_id: int) -> bool:
    """Одноразовый токен: true, если токен существовал и ещё не был использован."""
    cur = await _exec(
        "UPDATE welcome_tokens SET used_by=?, used_at=? "
        "WHERE token=? AND used_by IS NULL AND created_at > datetime('now','-7 days')",
        (user_id, now_iso(), token))
    return cur.rowcount > 0

# ---------------------------------------------------------------- платежи

async def payment_create(order_id: int, kind: str, amount: int, method: str = "manual",
                         external_id: str | None = None) -> int:
    cur = await _exec(
        "INSERT INTO payments(order_id, kind, amount, method, status, external_id, created_at)"
        " VALUES(?,?,?,?, 'pending', ?, ?)",
        (order_id, kind, amount, method, external_id, now_iso()))
    return cur.lastrowid


async def payment_get(payment_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM payments WHERE id=?", (payment_id,))
    return await cur.fetchone()


async def payment_claim_paid_exact(payment_id: int, order_id: int, kind: str,
                                   amount: int, method: str,
                                   external_id: str | None = None) -> str:
    """Атомарно занять точный счёт для проведения его побочных эффектов.

    Возвращает ``claimed`` ровно одному конкурентному обработчику. Повтор того
    же callback получает ``already_paid``; иной InvId уже оплаченного этапа —
    ``duplicate_kind``. Неверная сумма/заказ/вид и отменённый счёт никогда не
    проводятся.
    """
    ts = now_iso()
    cur = await conn().execute(
        "UPDATE payments SET status='paid',paid_at=?,method=?,"
        "external_id=COALESCE(?,external_id) "
        "WHERE id=? AND order_id=? AND kind=? AND amount=? "
        "AND status IN ('pending','claimed') "
        "AND NOT EXISTS("
        " SELECT 1 FROM payments p2 WHERE p2.order_id=? AND p2.kind=? "
        " AND p2.status='paid' AND p2.id!=?)",
        (ts, method, external_id, payment_id, order_id, kind, amount,
         order_id, kind, payment_id),
    )
    await conn().commit()
    if cur.rowcount == 1:
        bus_bump()
        return "claimed"

    row = await payment_get(payment_id)
    if not row or row["order_id"] != order_id or row["kind"] != kind \
            or int(row["amount"] or 0) != int(amount):
        return "invalid"
    if row["status"] == "canceled":
        return "canceled"
    if row["status"] == "paid":
        return "already_paid"
    cur = await conn().execute(
        "SELECT 1 FROM payments WHERE order_id=? AND kind=? AND status='paid' "
        "AND id!=? LIMIT 1", (order_id, kind, payment_id))
    if await cur.fetchone():
        return "duplicate_kind"
    return "not_claimable"


async def payment_record_duplicate(payment_id: int, method: str,
                                   external_id: str | None = None) -> bool:
    """Зафиксировать реально пришедший второй платёж без повторных эффектов."""
    cur = await conn().execute(
        "UPDATE payments SET status='paid',paid_at=?,method=?,"
        "external_id=COALESCE(?,external_id) "
        "WHERE id=? AND status IN ('pending','claimed')",
        (now_iso(), method, external_id, payment_id),
    )
    await conn().commit()
    if cur.rowcount:
        bus_bump()
    return cur.rowcount == 1


async def payment_by_external(external_id: str) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM payments WHERE external_id=?", (external_id,))
    return await cur.fetchone()


async def payments_for_order(order_id: int) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT * FROM payments WHERE order_id=? ORDER BY id", (order_id,))
    return list(await cur.fetchall())


async def payment_bind_nonce(payment_id: int, nonce: str) -> None:
    """Привязывает ключ предъявителя к строке платежа. Первый нажавший
    по ссылке владеет InvId; повторные нажатия переиспользуют тот же
    счёт и НЕ перезаписывают nonce — иначе ключ снова уходил бы последнему."""
    if not nonce:
        return
    await _exec("UPDATE payments SET nonce=? WHERE id=? "
                "AND (nonce IS NULL OR nonce='')", (nonce, payment_id))


async def payments_pending_older_than(iso: str, method: str = "robokassa"):
    """Pending-счета старше срока — кандидаты на потерянный вебхук."""
    cur = await conn().execute(
        "SELECT * FROM payments WHERE status='pending' AND method=? "
        "AND created_at < ? ORDER BY id", (method, iso))
    return list(await cur.fetchall())


async def payments_claimed_older_than(iso: str):
    """Отметки «я оплатил» без сверки мастером дольше срока: клиент висит
    на «ждём подтверждения», платить дальше не может."""
    cur = await conn().execute(
        "SELECT * FROM payments WHERE status='claimed' AND created_at < ? "
        "ORDER BY id", (iso,))
    return list(await cur.fetchall())


async def offers_expired_with_pending():
    """Истёкшие live-заявки, у чьих заказов остались незакрытые счета:
    оплату по мёртвым условиям гасит суточная сверка."""
    cur = await conn().execute(
        "SELECT o.* FROM offers o WHERE o.status='live' "
        "AND o.expires_at IS NOT NULL AND o.expires_at < ? AND EXISTS("
        "SELECT 1 FROM payments p WHERE p.order_id=o.order_id "
        "AND p.status='pending')", (now_iso(),))
    return list(await cur.fetchall())


async def offers_live_with_paid_payment():
    """Заявка ещё live, но платёж по её заказу уже paid — потерянный
    или частично применённый хук: заявку надо доснять."""
    cur = await conn().execute(
        "SELECT o.* FROM offers o WHERE o.status='live' AND EXISTS("
        "  SELECT 1 FROM payments p WHERE p.order_id=o.order_id "
        "  AND p.status='paid')")
    return list(await cur.fetchall())


async def payments_cancel_pending(order_id: int) -> int:
    """Гасит все pending-счета заказа — при пересборке/переоценке заявки,
    чтобы устаревшую цену нельзя было оплатить старой ссылкой."""
    cur = await _exec("UPDATE payments SET status='canceled' "
                      "WHERE order_id=? AND status='pending'", (order_id,))
    bus_bump()
    return cur.rowcount


async def payments_cancel_pending_kind(order_id: int, kind: str,
                                       keep_id: int | None = None) -> int:
    """Гасит pending-близнецы одного этапа (две вкладки, старое сообщение
    бота) — после подтверждения оплаты этапа их счета мертвы, иначе второй
    платёж прошёл бы молча как «ещё одна оплата того же»."""
    cur = await _exec(
        "UPDATE payments SET status='canceled' "
        "WHERE order_id=? AND kind=? AND status='pending' AND id != ?",
        (order_id, kind, keep_id or 0))
    bus_bump()
    return cur.rowcount


async def payment_set_status(payment_id: int, status: str) -> None:
    paid_at = now_iso() if status == "paid" else None
    if paid_at:
        await _exec("UPDATE payments SET status=?, paid_at=? WHERE id=?",
                    (status, paid_at, payment_id))
    else:
        await _exec("UPDATE payments SET status=? WHERE id=?", (status, payment_id))
    bus_bump()


# ------------------------------------------------ добровольная благодарность

async def tip_create(order_id: int, amount: int, method: str = "robokassa") -> int:
    cur = await _exec(
        "INSERT INTO tips(order_id, amount, status, method, created_at) "
        "VALUES(?,?, 'pending', ?, ?)",
        (order_id, amount, method, now_iso()))
    return cur.lastrowid


async def tip_get(tip_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM tips WHERE id=?", (tip_id,))
    return await cur.fetchone()


async def tip_mark_paid(tip_id: int) -> bool:
    """Провести благодарность ровно один раз; False — повтор вебхука."""
    cur = await _exec(
        "UPDATE tips SET status='paid', paid_at=? WHERE id=? "
        "AND status IN ('pending','claimed')",
        (now_iso(), tip_id))
    if cur.rowcount:
        bus_bump()
    return cur.rowcount > 0


async def tip_claim(tip_id: int) -> bool:
    cur = await _exec(
        "UPDATE tips SET status='claimed' WHERE id=? AND status='pending'", (tip_id,))
    if cur.rowcount:
        bus_bump()
    return cur.rowcount > 0


async def tip_cancel(tip_id: int) -> bool:
    cur = await _exec(
        "UPDATE tips SET status='canceled' WHERE id=? "
        "AND status IN ('pending','claimed')", (tip_id,))
    if cur.rowcount:
        bus_bump()
    return cur.rowcount > 0


async def tips_summary(order_id: int) -> dict:
    cur = await conn().execute(
        "SELECT count(*) AS n, coalesce(sum(amount),0) AS total "
        "FROM tips WHERE order_id=? AND status='paid'", (order_id,))
    row = await cur.fetchone()
    return {"count": int(row["n"] or 0), "total": int(row["total"] or 0)}

# ------------------------------------------------------- подписка «Салон+»

async def sub_active(user_id: int) -> aiosqlite.Row | None:
    """Действующая подписка пользователя (активна и не истекла)."""
    cur = await conn().execute(
        "SELECT * FROM subscriptions WHERE user_id=? AND status='active' "
        "AND expires_at > ? ORDER BY id DESC LIMIT 1", (user_id, now_iso()))
    return await cur.fetchone()


async def sub_pending_for_order(order_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute(
        "SELECT * FROM subscriptions WHERE order_id=? AND status='pending' LIMIT 1",
        (order_id,))
    return await cur.fetchone()


async def sub_create(user_id: int, plan: str, features: list[str], price: int,
                     period_days: int, discount_pct: int, discount_cap: int,
                     order_id: int | None = None, via: str | None = None) -> int:
    cur = await _exec(
        "INSERT INTO subscriptions(user_id, plan, features, price, period_days,"
        " discount_pct, discount_cap, status, order_id, via, created_at)"
        " VALUES(?,?,?,?,?,?,?, 'pending', ?, ?, ?)",
        (user_id, plan, json.dumps(features, ensure_ascii=False), price,
         period_days, discount_pct, discount_cap, order_id, via, now_iso()))
    bus_bump()
    return cur.lastrowid


async def sub_get(sub_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM subscriptions WHERE id=?", (sub_id,))
    return await cur.fetchone()


async def sub_pending_for_user(user_id: int) -> aiosqlite.Row | None:
    """Неоплаченное оформление подписки (свой контур, без заказа-носителя)."""
    cur = await conn().execute(
        "SELECT * FROM subscriptions WHERE user_id=? AND status='pending' "
        "AND order_id IS NULL ORDER BY id DESC LIMIT 1", (user_id,))
    return await cur.fetchone()


async def subs_pending() -> list[aiosqlite.Row]:
    """Оформления, ждущие оплату/сверку, — отмеченные «я оплатил» первыми."""
    cur = await conn().execute(
        "SELECT * FROM subscriptions WHERE status='pending' AND order_id IS NULL "
        "ORDER BY (claimed_at IS NULL), id DESC LIMIT 100")
    return list(await cur.fetchall())


async def subs_active_list() -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT * FROM subscriptions WHERE status='active' AND expires_at > ? "
        "ORDER BY expires_at LIMIT 200", (now_iso(),))
    return list(await cur.fetchall())


async def sub_activate(sub_id: int) -> aiosqlite.Row | None:
    """Оплата подтверждена: включить подписку на её период с этого момента."""
    cur = await conn().execute("SELECT * FROM subscriptions WHERE id=?", (sub_id,))
    s = await cur.fetchone()
    if not s:
        return None
    start = datetime.now(timezone.utc)
    expires = (start + timedelta(days=s["period_days"])).strftime("%Y-%m-%dT%H:%M:%S")
    await _exec("UPDATE subscriptions SET status='active', started_at=?, expires_at=? "
                "WHERE id=?", (start.strftime("%Y-%m-%dT%H:%M:%S"), expires, sub_id))
    bus_bump()
    cur = await conn().execute("SELECT * FROM subscriptions WHERE id=?", (sub_id,))
    return await cur.fetchone()


async def sub_features(s) -> list[str]:
    try:
        v = json.loads(s["features"] or "[]")
        return [str(x) for x in v] if isinstance(v, list) else []
    except (ValueError, TypeError):
        return []


async def subs_expiring(edge_iso: str) -> list[aiosqlite.Row]:
    """Активные подписки, истекающие до edge (для предупреждений/закрытия)."""
    cur = await conn().execute(
        "SELECT * FROM subscriptions WHERE status='active' AND expires_at <= ?",
        (edge_iso,))
    return list(await cur.fetchall())


async def sub_mark(sub_id: int, **fields) -> None:
    sets = ",".join(f"{k}=?" for k in fields)
    await _exec(f"UPDATE subscriptions SET {sets} WHERE id=?",
                list(fields.values()) + [sub_id])
    bus_bump()

# ------------------------------------------------------- куратор сессии

async def milestone_add(user_id: int, title: str, due_date: str) -> int:
    cur = await _exec(
        "INSERT INTO milestones(user_id, title, due_date, created_at) VALUES(?,?,?,?)",
        (user_id, title[:120], due_date, now_iso()))
    bus_bump()
    return cur.lastrowid


async def milestones_for(user_id: int) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT * FROM milestones WHERE user_id=? ORDER BY due_date", (user_id,))
    return list(await cur.fetchall())


async def milestone_del(user_id: int, mid: int) -> bool:
    cur = await _exec("DELETE FROM milestones WHERE id=? AND user_id=?", (mid, user_id))
    bus_bump()
    return cur.rowcount > 0


async def milestones_due(edge_days: int) -> list[aiosqlite.Row]:
    """Вехи в ближайшие edge_days дней (для напоминаний куратора)."""
    edge = (datetime.now(timezone.utc) + timedelta(days=edge_days)).strftime("%Y-%m-%d")
    cur = await conn().execute(
        "SELECT * FROM milestones WHERE due_date <= ? AND due_date >= ?",
        (edge, datetime.now(timezone.utc).strftime("%Y-%m-%d")))
    return list(await cur.fetchall())

# ------------------------------------------------- подарочные сертификаты

async def gift_create(**f) -> int:
    f.setdefault("created_at", now_iso())
    keys = list(f.keys())
    cur = await _exec(
        f"INSERT INTO gifts({','.join(keys)}) VALUES({','.join('?' * len(keys))})",
        list(f.values()))
    bus_bump()
    return cur.lastrowid


async def gift_get(gift_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM gifts WHERE id=?", (gift_id,))
    return await cur.fetchone()


async def gift_by_code(code: str) -> aiosqlite.Row | None:
    code = (code or "").strip().upper()
    if not code:
        return None
    cur = await conn().execute("SELECT * FROM gifts WHERE code=?", (code,))
    return await cur.fetchone()


async def gift_mark(gift_id: int, **fields) -> None:
    sets = ",".join(f"{k}=?" for k in fields)
    await _exec(f"UPDATE gifts SET {sets} WHERE id=?",
                list(fields.values()) + [gift_id])
    bus_bump()


async def gift_ledger_add(gift_id: int, delta: int, kind: str,
                          order_id: int | None = None, note: str = "") -> int:
    cur = await _exec(
        "INSERT INTO gift_ledger(gift_id, delta, kind, order_id, note, created_at)"
        " VALUES(?,?,?,?,?,?)",
        (gift_id, delta, kind, order_id, note[:300] or None, now_iso()))
    bus_bump()
    return cur.lastrowid


async def gift_balance(gift_id: int) -> int:
    cur = await conn().execute(
        "SELECT COALESCE(SUM(delta),0) AS b FROM gift_ledger WHERE gift_id=?",
        (gift_id,))
    row = await cur.fetchone()
    return int(row["b"] or 0)


async def gift_hold_for_order(gift_id: int, order_id: int) -> int:
    """Сколько сейчас удержано с сертификата под конкретный заказ (≥0)."""
    cur = await conn().execute(
        "SELECT COALESCE(SUM(delta),0) AS b FROM gift_ledger "
        "WHERE gift_id=? AND order_id=? AND kind IN ('hold','release')",
        (gift_id, order_id))
    row = await cur.fetchone()
    return -int(row["b"] or 0)


async def gift_rows(gift_id: int, limit: int = 60) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT * FROM gift_ledger WHERE gift_id=? ORDER BY id DESC LIMIT ?",
        (gift_id, limit))
    return list(await cur.fetchall())


async def gifts_list(limit: int = 200) -> list[aiosqlite.Row]:
    """Список для админки: живые дела первыми (сверка → активные → остальное)."""
    cur = await conn().execute(
        "SELECT * FROM gifts ORDER BY "
        "(status='pending' AND claimed_at IS NOT NULL) DESC, "
        "(status='pending') DESC, (status='active') DESC, id DESC LIMIT ?",
        (limit,))
    return list(await cur.fetchall())


async def gift_pending_for_buyer(user_id: int) -> aiosqlite.Row | None:
    """Неоплаченное оформление вошедшего покупателя (последнее)."""
    cur = await conn().execute(
        "SELECT * FROM gifts WHERE buyer_user_id=? AND status='pending' "
        "ORDER BY id DESC LIMIT 1", (user_id,))
    return await cur.fetchone()


async def gift_orders(gift_id: int) -> list[aiosqlite.Row]:
    """Заказы, к которым сертификат применялся (по журналу удержаний)."""
    cur = await conn().execute(
        "SELECT DISTINCT order_id FROM gift_ledger "
        "WHERE gift_id=? AND order_id IS NOT NULL ORDER BY order_id DESC", (gift_id,))
    ids = [r["order_id"] for r in await cur.fetchall()]
    out = []
    for oid in ids[:20]:
        o = await get_order(oid)
        if o:
            out.append(o)
    return out


# --------------------------------------------------- витрина TG-канала

async def channel_upsert(msg_id: int, **f) -> None:
    await conn().execute(
        "INSERT INTO channel_posts(msg_id, date, text, views, img, fetched_at) "
        "VALUES(?,?,?,?,?,?) ON CONFLICT(msg_id) DO UPDATE SET "
        "date=excluded.date, text=excluded.text, views=excluded.views, "
        "img=CASE WHEN excluded.img!='' THEN excluded.img ELSE channel_posts.img END, "
        "fetched_at=excluded.fetched_at",
        (msg_id, f.get("date", ""), f.get("text", ""), f.get("views", ""),
         f.get("img", ""), now_iso()))
    await conn().commit()


async def channel_recent(limit: int = 6) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT * FROM channel_posts ORDER BY msg_id DESC LIMIT ?", (limit,))
    return list(await cur.fetchall())


async def channel_trim(keep: int) -> list[int]:
    """Удалить хвост старше keep свежих; вернуть msg_id на чистку файлов."""
    cur = await conn().execute(
        "SELECT msg_id FROM channel_posts ORDER BY msg_id DESC LIMIT -1 OFFSET ?",
        (keep,))
    ids = [r["msg_id"] for r in await cur.fetchall()]
    if ids:
        marks = ",".join("?" * len(ids))
        await conn().execute(f"DELETE FROM channel_posts WHERE msg_id IN ({marks})", ids)
        await conn().commit()
    return ids


# --------------------------------------------------- «Открытая приёмная»

async def qa_add(**f) -> int:
    cols = ", ".join(f)
    marks = ", ".join("?" * len(f))
    cur = await conn().execute(
        f"INSERT INTO qa({cols}) VALUES({marks})", tuple(f.values()))
    await conn().commit()
    bus_bump()
    return cur.lastrowid


async def qa_get(qa_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM qa WHERE id=?", (qa_id,))
    return await cur.fetchone()


async def qa_mark(qa_id: int, **fields) -> None:
    sets = ", ".join(f"{k}=?" for k in fields)
    await conn().execute(f"UPDATE qa SET {sets} WHERE id=?",
                         (*fields.values(), qa_id))
    await conn().commit()
    bus_bump()


async def qa_delete(qa_id: int) -> None:
    await conn().execute("DELETE FROM qa_votes WHERE qa_id=?", (qa_id,))
    await conn().execute("DELETE FROM qa WHERE id=?", (qa_id,))
    await conn().commit()
    bus_bump()


async def qa_public(limit: int = 300) -> list[aiosqlite.Row]:
    """Опубликованные пары: закреплённые первыми, дальше свежие сверху."""
    cur = await conn().execute(
        "SELECT * FROM qa WHERE status='published' "
        "ORDER BY pinned DESC, coalesce(published_at, created_at) DESC, id DESC "
        "LIMIT ?", (limit,))
    return list(await cur.fetchall())


async def qa_list(status: str | None = None, limit: int = 400) -> list[aiosqlite.Row]:
    """Для админки: pending первыми, затем остальное по свежести."""
    if status:
        cur = await conn().execute(
            "SELECT * FROM qa WHERE status=? ORDER BY id DESC LIMIT ?",
            (status, limit))
    else:
        cur = await conn().execute(
            "SELECT * FROM qa ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, "
            "id DESC LIMIT ?", (limit,))
    return list(await cur.fetchall())


async def qa_counts() -> dict:
    cur = await conn().execute(
        "SELECT status, count(*) n FROM qa GROUP BY status")
    out = {r["status"]: r["n"] for r in await cur.fetchall()}
    return {"pending": out.get("pending", 0), "published": out.get("published", 0),
            "answered": out.get("answered", 0), "rejected": out.get("rejected", 0)}


async def qa_vote(qa_id: int, vid: str) -> int | None:
    """«У меня такой же вопрос»: один голос на браузер; None — уже голосовал."""
    cur = await conn().execute(
        "INSERT OR IGNORE INTO qa_votes(qa_id, vid, created_at) VALUES(?,?,?)",
        (qa_id, vid, now_iso()))
    if not cur.rowcount:
        await conn().commit()
        return None
    await conn().execute(
        "UPDATE qa SET same_count = same_count + 1 WHERE id=?", (qa_id,))
    await conn().commit()
    bus_bump()
    cur = await conn().execute("SELECT same_count FROM qa WHERE id=?", (qa_id,))
    row = await cur.fetchone()
    return int(row["same_count"]) if row else None


async def qa_ban(vid: str, ip: str, note: str = "") -> None:
    for key in (f"vid:{vid}" if vid else "", f"ip:{ip}" if ip else ""):
        if key:
            await conn().execute(
                "INSERT OR REPLACE INTO qa_bans(key, note, created_at) VALUES(?,?,?)",
                (key, note, now_iso()))
    await conn().commit()


async def qa_banned(vid: str, ip: str) -> bool:
    cur = await conn().execute(
        "SELECT 1 FROM qa_bans WHERE key IN (?,?) LIMIT 1",
        (f"vid:{vid}", f"ip:{ip}"))
    return bool(await cur.fetchone())


async def qa_recent_from(vid: str, ip: str, hours: int = 24) -> dict:
    """{vid_n, ip_n} — вопросов с этого браузера и адреса за сутки (анти-флуд)."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%S")
    cur = await conn().execute(
        "SELECT coalesce(sum(vid=?),0) vn, coalesce(sum(ip=?),0) pn "
        "FROM qa WHERE created_at >= ?",
        (vid or "-", ip or "-", since))
    row = await cur.fetchone()
    return {"vid_n": int(row["vn"] or 0), "ip_n": int(row["pn"] or 0)}


# ------------------------------------------------------------------ клиенты

async def clients_recent(limit: int = 100) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT u.*, "
        " (SELECT count(*) FROM orders o WHERE o.user_id=u.id) AS orders_n, "
        " (SELECT coalesce(sum(price),0) FROM orders o WHERE o.user_id=u.id AND o.status='done') AS paid_sum "
        "FROM users u ORDER BY u.last_seen_at DESC LIMIT ?", (limit,))
    return list(await cur.fetchall())


async def referrals_of(user_id: int) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT id, username, first_name, created_at FROM users WHERE referrer_id=?",
        (user_id,))
    return list(await cur.fetchall())


async def order_by_topic(topic_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute(
        "SELECT * FROM orders WHERE topic_id=? ORDER BY id DESC LIMIT 1", (topic_id,))
    return await cur.fetchone()

# ------------------------------------------------------------------- отзывы

async def review_for_order(order_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM reviews WHERE order_id=?", (order_id,))
    return await cur.fetchone()


async def review_get(review_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM reviews WHERE id=?", (review_id,))
    return await cur.fetchone()


async def review_upsert(
    order_id: int,
    user_id: int | None,
    rating: int,
    text: str | None,
    author: str | None,
    *,
    publication_consent: bool = False,
    publication_categories: dict[str, bool] | None = None,
    publication_consent_doc: str | None = None,
) -> int:
    """Один отзыв на заказ; повторная отправка обновляет и возвращает на модерацию."""
    rating = max(1, min(int(rating), 5))
    categories = publication_categories or {}
    valid_consent = bool(
        publication_consent
        and categories.get("rating_text") is True
        and publication_consent_doc
        and publication_consent_doc == config.PUBLICATION_CONSENT_DOC
    )
    normalized_categories = {
        "rating_text": valid_consent,
        "author": valid_consent and bool(categories.get("author")),
        "screenshot": valid_consent and bool(categories.get("screenshot")),
    }
    consent_at = now_iso() if valid_consent else None
    consent_doc = config.PUBLICATION_CONSENT_DOC if valid_consent else None
    cur = await _exec(
        "INSERT INTO reviews("
        "order_id,user_id,rating,text,author,status,created_at,"
        "publication_consent,publication_consent_at,publication_consent_doc,"
        "publication_categories,publication_author,publication_screenshot"
        ") VALUES(?,?,?,?,?,'pending',?,?,?,?,?,?,?)"
        " ON CONFLICT(order_id) DO UPDATE SET rating=excluded.rating, text=excluded.text,"
        "  author=excluded.author, status='pending', created_at=excluded.created_at,"
        "  moderated_at=NULL, publication_consent=excluded.publication_consent,"
        "  publication_consent_at=excluded.publication_consent_at,"
        "  publication_consent_doc=excluded.publication_consent_doc,"
        "  publication_categories=excluded.publication_categories,"
        "  publication_author=excluded.publication_author,"
        "  publication_screenshot=excluded.publication_screenshot",
        (order_id, user_id, rating, (text or "")[:2000] or None,
         (author or "")[:80] or None, now_iso(), 1 if valid_consent else 0,
         consent_at, consent_doc,
         json.dumps(normalized_categories, ensure_ascii=False, sort_keys=True),
         1 if normalized_categories["author"] else 0,
         1 if normalized_categories["screenshot"] else 0))
    row = await review_for_order(order_id)
    return row["id"] if row else cur.lastrowid


async def review_moderate(review_id: int, status: str) -> str:
    if status not in ("approved", "rejected"):
        return "bad_status"
    row = await review_get(review_id)
    if not row:
        return "not_found"
    if status == "approved" and not (
        row["publication_consent"]
        and row["publication_consent_at"]
        and row["publication_consent_doc"] == config.PUBLICATION_CONSENT_DOC
    ):
        return "consent_required"
    await _exec(
        "UPDATE reviews SET status=?, moderated_at=? WHERE id=?",
        (status, now_iso(), review_id),
    )
    return status


async def reviews_public(limit: int = 30) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT r.id,r.order_id,r.user_id,r.rating,r.text,"
        " CASE WHEN r.publication_author=1 THEN r.author ELSE NULL END AS author,"
        " r.status,r.created_at,r.moderated_at,r.publication_consent,"
        " r.publication_consent_at,r.publication_consent_doc,"
        " r.publication_categories,r.publication_author,r.publication_screenshot,"
        " o.work_label FROM reviews r JOIN orders o ON o.id=r.order_id "
        "WHERE r.status='approved' AND r.publication_consent=1 "
        "AND r.publication_consent_at IS NOT NULL "
        "AND r.publication_consent_doc=? "
        "ORDER BY r.id DESC LIMIT ?",
        (config.PUBLICATION_CONSENT_DOC, limit),
    )
    return list(await cur.fetchall())


async def reviews_all(limit: int = 100) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT r.*, o.work_label FROM reviews r JOIN orders o ON o.id=r.order_id "
        "ORDER BY (r.status='pending') DESC, r.id DESC LIMIT ?", (limit,))
    return list(await cur.fetchall())


# ------------------------------------- неизменяемые спецификации заказа

async def specification_next_revision(order_id: int) -> int:
    cur = await conn().execute(
        "SELECT coalesce(max(revision),0)+1 AS revision "
        "FROM order_specifications WHERE order_id=?",
        (order_id,),
    )
    row = await cur.fetchone()
    return int(row["revision"] or 1)


async def specification_create(
    order_id: int,
    specification_json: str,
    pdf_bytes: bytes,
    *,
    source: str,
    revision: int | None = None,
    schema_version: str = "2.0",
    specification_hash: str | None = None,
    pdf_hash: str | None = None,
    created_at: str | None = None,
) -> int:
    """Заморозить одну редакцию JSON+PDF и погасить прежнюю предложенную.

    Хэши считаются повторно здесь, на границе хранения: вызывающий не может
    случайно записать байты и хэш от разных редакций. Договорные поля строки
    затем защищены SQLite-триггером; менять можно только жизненный статус.
    """
    if source not in ("price", "offer"):
        raise ValueError("bad_specification_source")
    try:
        parsed = json.loads(specification_json)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("bad_specification_json") from exc
    canonical = json.dumps(
        parsed, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    )
    data_digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    payload = bytes(pdf_bytes or b"")
    if not payload:
        raise ValueError("empty_specification_pdf")
    pdf_digest = hashlib.sha256(payload).hexdigest()
    if specification_hash and specification_hash != data_digest:
        raise ValueError("specification_hash_mismatch")
    if pdf_hash and pdf_hash != pdf_digest:
        raise ValueError("specification_pdf_hash_mismatch")

    c = conn()
    try:
        await c.execute("BEGIN IMMEDIATE")
        if revision is None:
            cur = await c.execute(
                "SELECT coalesce(max(revision),0)+1 AS revision "
                "FROM order_specifications WHERE order_id=?",
                (order_id,),
            )
            revision = int((await cur.fetchone())["revision"] or 1)
        await c.execute(
            "UPDATE order_specifications SET status='superseded' "
            "WHERE order_id=? AND status='offered'",
            (order_id,),
        )
        cur = await c.execute(
            "INSERT INTO order_specifications("
            "order_id,revision,schema_version,specification_json,"
            "specification_hash,pdf_bytes,pdf_hash,pdf_size,status,source,created_at"
            ") VALUES(?,?,?,?,?,?,?,?, 'offered',?,?)",
            (
                order_id, int(revision), schema_version, canonical, data_digest,
                payload, pdf_digest, len(payload), source, created_at or now_iso(),
            ),
        )
        await c.commit()
    except Exception:
        await c.rollback()
        raise
    bus_bump()
    return int(cur.lastrowid)


async def specification_get(snapshot_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute(
        "SELECT * FROM order_specifications WHERE id=?", (snapshot_id,),
    )
    return await cur.fetchone()


async def specification_latest(order_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute(
        "SELECT * FROM order_specifications "
        "WHERE order_id=? AND status IN ('offered','accepted') "
        "ORDER BY revision DESC LIMIT 1",
        (order_id,),
    )
    return await cur.fetchone()


async def specification_accept(order_id: int, payment_id: int) -> bool:
    """Зафиксировать акцепт действовавшей редакции ровно первым платежом."""
    ts = now_iso()
    cur = await _exec(
        "UPDATE order_specifications "
        "SET status='accepted',accepted_at=?,accepted_payment_id=? "
        "WHERE id=("
        " SELECT id FROM order_specifications "
        " WHERE order_id=? AND status='offered' ORDER BY revision DESC LIMIT 1"
        ")",
        (ts, payment_id, order_id),
    )
    if cur.rowcount:
        bus_bump()
    return bool(cur.rowcount)


# ------------------------------------- собранная заявка (ссылка мастера)

async def offer_create(**f) -> int:
    ts = now_iso()
    f.setdefault("created_at", ts)
    f["updated_at"] = ts
    keys = list(f.keys())
    sql = f"INSERT INTO offers({','.join(keys)}) VALUES({','.join('?' * len(keys))})"
    cur = await _exec(sql, list(f.values()))
    bus_bump()
    return cur.lastrowid


async def offer_get(offer_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM offers WHERE id=?", (offer_id,))
    return await cur.fetchone()


async def offer_by_code(code: str) -> aiosqlite.Row | None:
    if not code:
        return None
    cur = await conn().execute("SELECT * FROM offers WHERE code=?", (code,))
    return await cur.fetchone()


async def offer_by_order(order_id: int) -> aiosqlite.Row | None:
    """Действующая (последняя) редакция заявки по заказу."""
    cur = await conn().execute(
        "SELECT * FROM offers WHERE order_id=? ORDER BY id DESC LIMIT 1", (order_id,))
    return await cur.fetchone()


async def offers_for_orders(order_ids: list[int]) -> dict[int, aiosqlite.Row]:
    """Свежая заявка по каждому заказу — для списка в админке (один запрос)."""
    ids = [i for i in order_ids if i][:200]
    if not ids:
        return {}
    q = ",".join("?" * len(ids))
    cur = await conn().execute(
        f"SELECT * FROM offers WHERE order_id IN ({q}) ORDER BY id", ids)
    out: dict[int, aiosqlite.Row] = {}
    for r in await cur.fetchall():
        out[r["order_id"]] = r        # ORDER BY id → останется последняя редакция
    return out


async def offer_update(offer_id: int, **f) -> None:
    f["updated_at"] = now_iso()
    sets = ",".join(f"{k}=?" for k in f)
    await _exec(f"UPDATE offers SET {sets} WHERE id=?", list(f.values()) + [offer_id])
    bus_bump()


async def offer_touch(offer_id: int, gap_seconds: int = 60) -> None:
    """Счётчик открытий. Перезагрузка в пределах минуты не накручивает, а
    поллинг состояния сюда не заходит вовсе — иначе «открыл 3 раза» (сигнал
    мастеру «пора написать») превратилось бы в «открыл 300 раз»."""
    edge = (datetime.now(timezone.utc)
            - timedelta(seconds=gap_seconds)).strftime("%Y-%m-%dT%H:%M:%S")
    await _exec(
        "UPDATE offers SET opens=coalesce(opens,0)+1, opened_at=? "
        "WHERE id=? AND (opened_at IS NULL OR opened_at < ?)",
        (now_iso(), offer_id, edge))


async def offer_mark_paid(order_id: int, method: str = "manual",
                          external_id: str = "",
                          doc_editions: str = "", nonce: str = "",
                          inv_id: int = 0) -> aiosqlite.Row | None:
    """Хук из payments.confirm: закрыть собранную заявку и зафиксировать акцепт.

    Живёт здесь, а не в вебхуке Robokassa: подтверждение приходит четырьмя
    путями (Robokassa, ЮKassa, кнопка мастера в админке, кнопка мастера в
    боте) — все они сходятся в payments.confirm, и только там хук сработает
    во всех случаях. Идемпотентен: повтор вебхука ничего не портит.

    Пишем не только редакции документов, но и сами условия (цена, план,
    смета, календарь) — через полгода в споре важно, ЧТО человек принял,
    а не только под какой шапкой это лежало (Политика п. 2.5).
    """
    # Снимок nonce НА МОМЕНТ ОПЛАТЫ. До этого ключ от дела проверялся против
    # текущего pay_nonce, а тот не ротировался: кто угодно, нажавший «Оплатить»
    # по пересланной ссылке, удерживал валидный nonce и мог забрать ключ от
    # дела, оплаченного ДРУГИМ человеком. Теперь ключ отдаётся только тому
    # nonce, который был активен, когда деньги подтвердились.
    # Заявку определяем по ОПЛАЧЕННОМУ InvId, а не «последняя редакция»:
    # иначе пересборка во время оплаты пометила бы новую редакцию,
    # а плательщик старой терял ключ и получал чужой accept_json.
    off = None
    if inv_id:
        cur = await conn().execute(
            "SELECT * FROM offers WHERE pay_inv=? ORDER BY id DESC LIMIT 1", (inv_id,))
        off = await cur.fetchone()
    if not off:
        off = await offer_by_order(order_id)
    if not off or off["status"] == "paid":
        return None
    o = await get_order(order_id)
    try:
        accepted_specification = json.loads(off["specification_json"] or "null")
    except (TypeError, json.JSONDecodeError):
        accepted_specification = None
    accept = {
        "at": now_iso(), "method": method, "external_id": external_id,
        "offer_version": off["version"], "code_tail": (off["code"] or "")[-6:],
        "doc_editions": doc_editions,
        "price": o["price"] if o else None,
        "prepay": o["prepay"] if o else None,
        "stages_total": o["stages_total"] if o else None,
        "ledger": off["ledger_json"], "rail": off["rail_json"],
        "incl": off["incl_json"], "built_at": off["created_at"],
        # предмет и срок — из orders, где их может править мастер ПОСЛЕ
        # акцепта: без снимка спор «я платил за дедлайн 10 августа»
        # остался бы без доказательств. Акцепт — самодостаточный документ.
        "topic": (o["topic"] if o else None),
        "work_label": (o["work_label"] if o else None),
        "deadline_date": (o["deadline_date"] if o else None),
        "deadline_text": (o["deadline_text"] if o else None),
        "volume": off["volume"], "tier_label": off["tier_label"],
        "reqs_short": off["reqs_short"], "need_files": off["need_files"],
        "expires_at": off["expires_at"],
        "specification_snapshot_id": off["specification_snapshot_id"],
        "specification_revision": off["specification_revision"],
        "specification_schema": off["specification_schema"],
        "specification_data_sha256": off["specification_hash"],
        "specification_pdf_sha256": off["specification_pdf_hash"],
        "specification_pdf_size": off["specification_pdf_size"],
        "specification": accepted_specification,
        # версия статики листа (?v=…): юр-тексты страницы меняются только
        # с бампом версии, значит page_ver ↔ git-коммит восстанавливает,
        # что именно видел плательщик
        "page_ver": off["page_ver"] or "",
    }
    accepted_payment_id = int(inv_id or off["pay_inv"] or 0)
    if accepted_payment_id and await specification_accept(order_id, accepted_payment_id):
        frozen = await specification_latest(order_id)
        await add_event(
            order_id, "specification_accepted",
            f"ред. {frozen['revision']} · платёж {accepted_payment_id}" if frozen
            else f"платёж {accepted_payment_id}",
        )
    await offer_update(off["id"], status="paid", paid_at=now_iso(),
                       # снимок nonce с ПЛАТЕЖА (привязан к InvId), а не
                       # текущий pay_nonce заявки — тот у последнего нажавшего
                       paid_nonce=(nonce or off["pay_nonce"] or ""),
                       accept_json=json.dumps(accept, ensure_ascii=False))
    await add_event(order_id, "offer_accepted",
                    f"акцепт по собранной заявке ред. {off['version']} · {method}")
    return await offer_get(off["id"])
