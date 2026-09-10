"""Grounded Salon assistant. Facts, actions and handoff, no invented promises.

No third-party model receives a customer's files or conversation. The service
answers supported intents using authoritative order facts and reviewed rules;
an unfamiliar question produces an editable handoff, not a made-up answer.
"""
import re

VERSION = "listik-concierge-2026-09-11.1"
KNOWLEDGE = [
    ("timing", r"сроч|экспресс|сутк|24\s*час|сегодня|завтра|быстр", "Экспресс за 24 часа стоит ×2 к плановой цене основной работы. Дополнения считаются отдельно. Для срока меньше суток, кандидатской и сложного состава нужна проверка возможности выполнения. Срок закрепляется после проверки задания, материалов и загрузки.", [("Выбрать работу и срок", "/configurator.html"), ("Как проходит заказ", "/prolog.html")]),
    ("norm", r"нормоконтрол|нормконтрол|методич|оформлен|гост", "Оформление по предоставленной методичке входит в согласованную работу. Несоответствия согласованному заданию исправляются без доплаты. Если появилась новая методичка или изменились требования, сначала согласуем дополнительный объём, цену и срок. Приложи сами замечания.", [("Работы и дополнения", "/services.html"), ("О нормоконтроле", "/normokontrol-vkr.html")]),
    ("samples", r"пример|образец|посмотр.*работ|готов.*документ", "В разделе примеров можно открыть настоящие обезличенные документы и посмотреть структуру, содержание и оформление. Пример помогает выбрать формат; состав твоего заказа определяется твоим заданием.", [("Открыть примеры", "/samples.html")]),
    ("bonus", r"бонус|скидк|промокод|кешб|кэшб|перв.*заказ", "Доступные скидки проверяются по аккаунту и заказу. Промокод и скидка подписки не складываются: применяется более выгодная. Бонусами можно покрыть до 20% цены; вместе со скидкой общий предел — 25%. Итоговая доступная сумма появится в смете до оплаты.", [("Мои выгоды", "/dashboard.html#benefits"), ("Правила бонусов", "/loyalty.html")]),
    ("community", r"кладов|подпис.*канал|подар|телеграм.*подар", "За подписки на каналы Салона и Кладовой есть отдельные цифровые подарки. Покупка не нужна. В разделе «Подарки своих» открой канал, подпишись и нажми «Проверить». Проверка доступна для аккаунта, вошедшего через Telegram.", [("Подарки своих", "/dashboard.html#community"), ("Кладовая ГИПСР", "https://studkladovaya.ru/")]),
    ("deposit", r"депозит|пополн|баланс.*деньг|деньг.*баланс", "Депозит — твои деньги для будущих согласованных заказов. Он учитывается отдельно от бонусов. Сумма пополнения и условия бонусного начисления показываются до оплаты; баланс обновляется только после подтверждения платежа.", [("Мой депозит", "/dashboard.html#deposit"), ("Условия депозита", "/deposit.html")]),
    ("subscription", r"подписк|салон\+|абонемент|продлен", "В Салон+ можно выбрать набор привилегий на нужный период. Активная подписка, срок действия и ожидающий счёт видны в кабинете. Настройка продления выставляет следующий счёт, а не списывает деньги с карты автоматически.", [("Моя подписка", "/dashboard.html#plus"), ("Состав планов", "/plus.html")]),
    ("files", r"файл|прикреп|загруз|методическ|вложен|материал", "Открой свой заказ → «Файлы» и прикрепи задание, методичку или исходный текст. Один файл — до 20 МБ. Подтверждение появится, когда файл сохранится. Если связь прервалась, сначала проверь список файлов заказа.", [("Мои файлы", "/dashboard.html#documents")]),
    ("payment", r"оплат|плат[её]ж|\bчек\b|карт|сбп|счет", "Оплата доступна в заказе, когда закреплена смета и есть сумма к оплате. Открой «Смета и оплата», проверь состав и срок, затем перейди на страницу платёжного сервиса. Возврат на сайт сам по себе не подтверждает платёж: ждём ответ сервиса.", [("Мои заказы", "/dashboard.html#orders")]),
    ("referral", r"\bдруг(?:а|у|ом)?\b|приглас|реферал|рекоменд", "Поделись личной ссылкой из кабинета. Бонусы зависят от подходящего оплаченного заказа друга, а не от числа переходов. Условия действующей программы и ограничения собраны на отдельной странице.", [("Моя ссылка", "/dashboard.html#referral"), ("Условия приглашений", "/referral-rules.html")]),
    ("scope", r"цен|стоим|сколько|рассчит|объем|объ[её]м|глав|часть", "Стоимость зависит от конкретного результата, объёма, исследования, исходников, сроков и дополнений. Можно заказать отдельную часть. Сначала выбираешь состав и передаёшь задание; закреплённая смета показывает, что входит и сколько стоит. Неизвестные условия требуют уточнения.", [("Собрать свою задачу", "/configurator.html"), ("Работы и цены", "/services.html")]),
    ("fixes", r"правк|замечан|исправ|не подход|плохо|отмен|возврат", "Открой обсуждение заказа и перечисли замечания. Для готовой версии используй «Есть замечания»: они будут привязаны к результату. Объём исправлений определяется согласованным заданием; новый состав или возврат нужно согласовать отдельно.", [("Мои заказы", "/dashboard.html#orders"), ("Условия возврата", "/refunds.html")]),
]



SUGGESTIONS = {
    "scope": ["Что входит в работу?", "Можно за 24 часа?", "Покажи примеры"],
    "timing": ["А быстрее суток?", "Что влияет на цену?"],
    "community": ["У меня вход по почте", "Как работают бонусы?"],
    "bonus": ["Как получить подарки?", "Как пригласить друга?"],
    "payment": ["Деньги списались, но статус не изменился", "Где мои файлы?"],
    "payment_issue": ["Позови мастера"],
    "subscription": ["Как работают бонусы?", "Чем отличается депозит?"],
    "files": ["Не получается прикрепить файл", "Позови мастера"],
    "order": ["Где мои файлы?", "Есть замечания к работе", "Позови мастера"],
}
WORKS = [("магистер", "Магистерская"), ("кандидат", "Кандидатская"), ("диплом|вкр", "Дипломная / ВКР"), ("курсов", "Курсовая"), ("практик", "Практика"), ("эссе", "Эссе"), ("реферат", "Реферат"), ("стать", "Статья"), ("самостоятельн|контрольн", "Самостоятельная / контрольная")]
TOPICS = {x[0] for x in KNOWLEDGE} | {"payment_issue", "order", "hello", "checklist", "file_issue"}


def _legacy_answer(question, order=None, context=None):
    if not isinstance(question, str) or not question.strip() or len(question) > 2000:
        raise ValueError("question_required")
    question = question.strip()
    q = question.lower().replace("ё", "е")
    order = order if isinstance(order, dict) else None
    # Context is only a navigation hint. It never contains trusted order facts.
    ctx = context if isinstance(context, dict) else {}
    previous = ctx.get("topic") if isinstance(ctx.get("topic"), str) and ctx.get("topic") in TOPICS else None
    allowed_products = {"essay", "referat", "self", "course", "course_emp", "diplom", "master", "kandidat", "practice", "rinc", "custom"}
    selected_product = ctx.get("product") if isinstance(ctx.get("product"), str) and ctx.get("product") in allowed_products else None
    source, body, links, suggestions, card, handoff = "handoff", "", [], [], None, False
    order_url = f"/dashboard.html#order-{int(order['id'])}" if order else "/dashboard.html#orders"
    human = bool(re.search(r"позови|позвать|связаться|свяжи|оператор|живой человек|хочу.*мастер|нужен.*мастер|переда[йт].*мастер", q))
    payment_issue = bool(re.search(r"деньги.*списа|списа.*деньг|уже.*оплати|оплатил|оплатила|платеж.*(?:не|завис)|оплата.*(?:не прош|не появ|не подтв)|статус.*не.*(?:измен|обнов)|повторн.*оплат|дважды.*оплат", q))
    if human:
        body = "Давай передадим вопрос мастеру. Я соберу контекст в один черновик: проверь его и отправь, когда будешь готов."
        handoff = True
    elif re.search(r"возврат|вернуть.*деньг|отмен.*заказ", q):
        source = "fixes"
        body = "Вопрос об отмене или возврате нужно передать мастеру: условия зависят от согласованного задания и выполненных этапов. Подготовлю обращение; решение и сумму бот не назначает."
        handoff = True
        links = [("Условия возврата", "/refunds.html")]
        suggestions = ["Позови мастера"]
    elif re.search(r"сертификат", q):
        source = "bonus"
        body = "Подарочный сертификат и подарок за подписку — разные вещи. Код сертификата можно применить в смете заказа, в блоке «Бонусы и сертификат». Доступная сумма подтверждается сервером до оплаты."
        links = [("Открыть заказ", order_url + "-money" if order else order_url), ("О сертификатах", "/gift.html")]
        suggestions = ["Позови мастера"]
    elif payment_issue:
        source = "payment_issue"
        body = "Если деньги уже списались, не оплачивай повторно. Возврат с платёжной страницы ещё не означает, что подтверждение дошло до Салона. Обнови заказ; если статус не изменился, передай мастеру время и сумму платежа. Номер карты и коды не нужны."
        if order:
            body += "\n\nСейчас в Салоне: «" + str(order.get("status_label") or order.get("status") or "уточняется") + "»."
        links = [("Проверить заказ", order_url + ("-money" if order else ""))]
        suggestions = ["Позови мастера"]
    elif re.search(r"(?:не.*(?:прикреп|загруз)|ошибк.*файл|файл.*не)", q):
        source = "file_issue"
        body = "Открой файлы нужного заказа и проверь, появился ли документ в списке. Если его нет, повтори загрузку оттуда. Размер одного файла — до 20 МБ. Для большого архива можно передать ссылку мастеру в обсуждении заказа."
        links = [("Открыть файлы", order_url + "-files" if order else "/dashboard.html#documents")]
        suggestions = ["Позови мастера"]
    elif re.fullmatch(r"(?:привет|здравствуй(?:те)?|добрый (?:день|вечер)|доброе утро|начнем|помоги)[!.? ]*", q):
        source = "hello"
        body = "Привет! Я Листик, бот-помощник Салона. Помогу разобраться с задачей, сроками и выгодами. С чего начнём?"
        suggestions = ["Хочу заказать работу", "Как получить подарки?", "Вопрос по оплате"]
    elif re.fullmatch(r"(?:спасибо|благодарю|понятно|ок|хорошо|круто)[!.? ]*", q):
        source = previous or "hello"
        body = "Пожалуйста! Можем продолжить с твоей задачей или посмотреть, что ещё пригодится."
        suggestions = ["Хочу заказать работу", "Как получить подарки?"]
    elif re.search(r"почт|email", q) and (previous == "community" or re.search(r"подар|телеграм|подпис", q)):
        source = "community"
        body = "Подарки за каналы проверяются через Telegram. Если сейчас ты вошёл по почте, вход через Telegram может открыть отдельный профиль: заказы автоматически между ними не объединяются. Если нужна помощь со связкой, передай вопрос мастеру."
        links = [("Подарки и проверка подписок", "/dashboard.html#community")]
        suggestions = ["Позови мастера"]
    elif re.search(r"чек[- ]?лист|что.*(?:прислать|подготовить)|какие.*(?:материалы|файлы|нужны)", q):
        source = "checklist"
        body = "Для начала хватит задания и даты сдачи. Если есть — добавь методичку, тему, нужный объём и замечания преподавателя. Всё, что ещё не определено, можно так и отметить: не нужно заполнять наугад."
        links = [("Передать задачу и файлы", "/configurator.html")]
        suggestions = ["Что входит в работу?", "Можно за 24 часа?"]
    elif order and re.search(r"срок.*заказ|дедлайн|статус|что дальше|когда.*готов|моя.*работ|мой.*заказ|готов.*заказ|оплат|платеж", q):
        source = "order"
        status = str(order.get("status_label") or order.get("status") or "статус уточняется")
        body = "Вот текущие данные твоего заказа. Чтобы увидеть изменения, открой его ещё раз."
        rows = [{"label":"Статус", "value":status}, {"label":"Срок", "value":str(order.get("deadline_text") or order.get("deadline_date") or "Уточняется")}]
        price = order.get("price")
        amount = order.get("due_now", {}).get("amount") if isinstance(order.get("due_now"), dict) else None
        if type(price) is int and price > 0: rows.append({"label":"По смете", "value":f"{price:,} ₽".replace(",", " ")})
        if type(amount) is int and amount > 0:
            rows.append({"label":"К оплате", "value":f"{amount:,} ₽".replace(",", " ")})
            body += f" В заказе № {order['id']} к оплате {amount:,} ₽.".replace(",", " ")
        card = {"title":f"Заказ № {order['id']}", "rows":rows}
        links = [("Открыть заказ", order_url)]
    else:
        hits = [x for x in KNOWLEDGE if re.search(x[1], q)]
        if re.search(r"приглас|друг|реферал", q):hits.sort(key=lambda x:x[0]!="referral")
        work_labels = [label for pattern,label in WORKS if re.search(pattern,q)]
        work = work_labels[0] if len(work_labels) == 1 else None
        if not hits and (work or re.search(r"заказать|нужна работ|хочу.*работ|что вход",q)):
            hits = [next(x for x in KNOWLEDGE if x[0]==("norm" if "что вход" in q else "scope"))]
        if not hits and previous and re.fullmatch(r"(?:а )?(?:подробнее|расскажи|как это|что это|а дальше)[?.! ]*",q):
            hits = [x for x in KNOWLEDGE if x[0]==previous]
        if hits:
            source = hits[0][0];body = hits[0][2];links = list(hits[0][3])
            if source == "timing" and re.search(r"быстрее суток|меньше суток|несколько часов",q):
                body = "Срок меньше суток рассчитывается по заданию. Передай работу и точное время сдачи: мастер проверит, можно ли успеть, и закрепит цену до оплаты. Экспресс за 24 часа — ×2 к обычной цене основной работы."
            if work and source in ('scope','timing','norm'):
                rows=[{"label":"Работа", "value":work}]
                if re.search(r"статист|эмпир|исследован|spss|расчет",q):rows.append({"label":"Состав", "value":"Исследование / расчёты: нужно уточнить"})
                if re.search(r"завтра|сегодня|сроч|сутк|24.*час",q):rows.append({"label":"Срок", "value":"Срочно: проверим по заданию"})
                card={"title":"Из твоего сообщения", "rows":rows}
                body += "\n\nОриентир не заменяет смету: точный объём и возможность срока проверяются по заданию."
                product = {"Магистерская":"master","Кандидатская":"kandidat","Дипломная / ВКР":"diplom","Курсовая":"course","Практика":"practice","Эссе":"essay","Реферат":"referat","Статья":"rinc","Самостоятельная / контрольная":"self"}.get(work,"custom")
                if product == "course" and re.search(r"статист|эмпир|исследован",q):product="course_emp"
                selected_product = product
                links=[("Собрать этот заказ", "/configurator.html?product="+product), ("Посмотреть примеры", "/samples.html")]
            if len(hits)>1 and source not in ("scope","timing"):
                suggestions = SUGGESTIONS.get(source, [])[:1] + ["Что влияет на цену?"]
        else:
            body = "Не хочу гадать. Уточни, речь о новой работе, текущем заказе или выгодах? Если вопрос нестандартный, можно сразу передать его мастеру."
            suggestions = ["Хочу заказать работу", "Вопрос по оплате", "Позови мастера"]
            handoff = True
    if not human and 'work_labels' in locals() and len(work_labels)>1:
        source = "scope";card = None;selected_product = None
        body = "В сообщении несколько форматов. С какой работой сейчас помочь? Выбери один формат или уточни, какую часть нужно сделать."
        links=[];suggestions=work_labels[:3];handoff=False
    if not human and re.search(r"хочу заказать работу|подобрать формат", q):
        body = "Какой формат тебе нужен? Можно заказать работу целиком, отдельную главу или доработку. Если название не подходит, просто опиши задачу своими словами."
        suggestions = ["Курсовая работа", "Дипломная работа", "Отчёт по практике"]
    if not suggestions:suggestions = SUGGESTIONS.get(source, ["Что нужно для заказа?", "Как получить подарки?"])
    if source == "files" and order:links = [("Файлы этого заказа", order_url + "-files")]
    if selected_product:links = [(label, url+"?product="+selected_product if url == "/configurator.html" else url) for label,url in links]
    handoff_text = "Вопрос к мастеру: " + question
    if order:handoff_text += f"\nЗаказ № {order['id']}. " + str(order.get("work_label") or "")
    return {"ok":True,"version":VERSION,"answer":body,"source":source,
            "links":[{"label":label,"url":url} for label,url in links], "suggestions":suggestions[:3],
            "card":card,"handoff":handoff,"handoff_requested":human,"handoff_text":handoff_text,
            "context":{"topic":source if source in TOPICS else "hello", "product":selected_product},
            "order_id":order["id"] if order else None}

# Public knowledge and conversational hints are separate from authorized order facts.
import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    _CORPUS = json.loads(Path(__file__).with_name('assistant_knowledge.json').read_text())
    _PAGES = _CORPUS['pages']
    _CAMPAIGNS = _CORPUS.get('campaigns',[])
except (OSError, ValueError, KeyError):
    _CAMPAIGNS = []
    _PAGES = []  # Curated answers and explicit escalation remain available.
_STOP = set('а и или в во на к по с со у о об от до за из для не но это как что чем где когда какой какая какие сколько можно нужно мне мой моя мои мы ты вы ваш наша пожалуйста расскажи покажи хочу узнать ли есть про работы работу работа салон академический'.split())
def _norm(v):return str(v).lower().replace('ё','е')
def _tokens(v):
    words = re.findall(r'[а-яa-z0-9]+', _norm(v))
    return {w[:6] if len(w)>6 else w for w in words if len(w)>2 and w not in _STOP}
_INDEX=[]
for _p in _PAGES:
    for _c in _p['chunks']:
        _INDEX.append((_p,_c,_tokens(_p['title']),_tokens(_c['heading']),_tokens(_c['text'])))
_FREQ={}
for _,_,a,b,c in _INDEX:
    for t in a|b|c:_FREQ[t]=_FREQ.get(t,0)+1

def _search(question, page_url=None):
    words=_tokens(question)
    if not words:return None
    # These are navigation aliases, never answer text or prices.
    aliases=[(r'объект|предмет|цель.*задач','guide-obekt-предмет'),]
    preferred=None
    for pattern,path in [
        (r'объект|предмет|цель.*задач','guide-obekt-predmet-cel-zadachi.html'),
        (r'список литератур|списка литератур|библиограф|оформ.*источник','guide-spisok-literatury.html'),
        (r'заключени.*курсов','guide-zaklyuchenie-kursovoy.html'),
        (r'заключени.*(?:вкр|диплом)','guide-zaklyuchenie-vkr.html'),
        (r'дневник.*практик','guide-dnevnik-praktiki.html'),
        (r'реч[ьи].*(?:защит|диплом)|доклад.*защит','guide-rech-na-zashchitu.html'),
        (r'презентаци.*защит','guide-prezentaciya-k-zashchite.html'),
        (r'титульн','guide-titulnyj-list.html'),
        (r'введени.*курсов','guide-vvedenie-kursovoy.html'),
        (r'характеристик.*практик','guide-harakteristika-s-praktiki.html'),
        (r'приложени.*(?:гост|оформ)|оформ.*приложени','guide-prilozheniya-po-gost.html')]:
        if re.search(pattern,_norm(question)):preferred='/'+path;break
    ranked=[]
    for p,c,title,heading,body in _INDEX:
        if preferred and p['url']!=preferred:continue
        if page_url and not preferred and p['url']!=page_url:continue
        hits=words&(title|heading|body)
        score=sum(math.log(1+len(_INDEX)/(_FREQ.get(w,0)+1))*(4*(w in title)+5*(w in heading)+1*(w in body)) for w in hits)
        coverage=len(hits)/len(words)
        if not preferred and (len(hits)<min(2,len(words)) or coverage<.7):continue
        if len(c['text'])<65:score*=.65
        if p['url'].startswith('/guide-'):score*=1.2
        ranked.append((score,p,c))
    if not ranked:return None
    ranked.sort(key=lambda x:x[0],reverse=True)
    score,p,c=ranked[0]
    if score<8 and not preferred:return None
    chosen=[c]
    # Keep the most relevant passage first; a nearby paragraph provides useful detail.
    for _,p2,c2 in ranked[1:]:
        if p2['url']==p['url'] and c2['heading']==c['heading'] and c2!=c and len(c['text'])<450:
            chosen.append(c2);break
    text='\n\n'.join(x['text'] for x in chosen)
    if len(text)>1500:
        sentences=re.split(r'(?<=[.!?])\s+',text);out=''
        for sentence in sentences:
            if len(out)+len(sentence)>1500:break
            out+=(" " if out else "")+sentence
        text=out or text[:1450]+'…'
    url=p['url']+('#'+c['anchor'] if re.fullmatch(r'[a-zA-Z][\w-]*',c['anchor'] or '') else '')
    return {'answer':text,'title':p['title'],'heading':c['heading'],'url':url,'page':p['url']}

_PUBLIC_SOURCES={
    'scope':('Работы и цены','/services.html'),'timing':('Срочные задачи','/priyomnaya.html'),
    'norm':('Условия и доработки','/guarantees.html'),'samples':('Примеры документов','/samples.html'),
    'bonus':('Правила выгод','/loyalty.html'),'community':('Подарки своих','/benefits.html'),
    'deposit':('Депозит','/deposit.html'),'subscription':('Салон+','/plus.html'),
    'files':('Файлы заказа','/dashboard.html#documents'),'payment':('Оплата и этапы','/oplata.html'),
    'referral':('Действующие правила приглашений','/loyalty.html'),'fixes':('Проверка и возврат','/refunds.html'),
    'about':('О Салоне','/about.html'),'creator':('О Салоне','/about.html'),
    'trust':('Условия и гарантии','/guarantees.html'),'budget':('Работы и цены','/services.html'),
    'privacy':('Конфиденциальность','/privacy.html'),'auth':('Личный кабинет','/dashboard.html'),
    'receipt':('Оплата и чек','/oplata.html'),'requirements':('Состав и изменения','/guarantees.html'),
    'review_period':('Проверка результата','/refunds.html'),'independent':('Бесплатные инструменты','/tools.html'),
}
_PRODUCTS={'essay':'Эссе','referat':'Реферат','self':'Самостоятельная / контрольная','course':'Курсовая работа','course_emp':'Курсовая с исследованием','diplom':'Дипломная / ВКР','master':'Магистерская','kandidat':'Кандидатская','practice':'Отчёт по практике','chapter':'Отдельная глава','rinc':'Научная статья','vak':'Статья ВАК','scopus':'Статья Scopus','editing':'Доработка текста','custom':'Индивидуальная задача'}
def _brief(value):
    if not isinstance(value,dict):return {}
    out={}
    for k,limit in [('topic',500),('volume',100),('notes',5000)]:
        if isinstance(value.get(k),str):out[k]=value[k][:limit]
    for k,allowed in [('product',_PRODUCTS),('scope',('whole','part','editing')),('discipline',('hum','law','tech','med','psychology','pedagogy','jurisprudence'))]:
        if isinstance(value.get(k),str) and value[k] in allowed:out[k]=value[k]
    date=value.get('deadline')
    if isinstance(date,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',date):
        try:datetime.strptime(date,'%Y-%m-%d');out['deadline']=date
        except ValueError:pass
    if value.get('active') is True:out['active']=True
    return out

def _draft_update(question, prior):
    b=_brief(prior);q=_norm(question);changed=False
    wants=bool(re.search(r'(?:хочу|нужно|нужна|нужен|можно|давай).*заказ|заказать|оформим|собрать.*заказ',q))
    matches=[]
    for pattern,p in [(r'магистер','master'),(r'кандидат','kandidat'),(r'диплом|вкр','diplom'),(r'курсов','course'),(r'практик','practice'),(r'\bэссе\b','essay'),(r'реферат','referat'),(r'\bвак\b','vak'),(r'scopus','scopus'),(r'стать[юяи]|ринц','rinc'),(r'контрольн','self')]:
        if re.search(pattern,q):matches.append(p)
    # Avoid treating a price/research question or a negative mention as a selection.
    selection=len(matches)==1 and not re.search(r'чек.?лист|не нуж|не хочу|сколько|стоит|как |что |почему|можно ли|оформить список|писать|написать самостоятельно',q)
    if wants or selection and (b.get('active') or re.search(r'нуж|хочу',q) or len(q)<40):
        b['active']=True
        if len(matches)==1:b['product']=matches[0];changed=True
        elif wants and not b.get('product'):changed=True
    if re.fullmatch(r'изменить (?:тему|срок|формат)',q):
        b.pop({'изменить тему':'topic','изменить срок':'deadline','изменить формат':'product'}[q],None);b['active']=True;return b,True
    if not b.get('active'):return b,False
    if len(matches)==1 and selection:b['product']=matches[0];changed=True
    if b.get('product')=='course' and re.search(r'со статистик|с исследован|с эмпир',q):b['product']='course_emp'
    for pattern,p in [(r'психолог','psychology'),(r'педагог','pedagogy'),(r'юриспруд|\bправо\b','jurisprudence'),(r'информат|программир','tech'),(r'медицин','med')]:
        if re.search(pattern,q) and '?' not in q:b['discipline']=p
    if re.search(r'только.*глав|отдельн.*глав|только.*част|лишь.*част',q):b['scope']='part';b['volume']=question[:100];changed=True
    elif re.search(r'доработ|исправить.*текст',q) and '?' not in q:b['scope']='editing';changed=True
    elif re.search(r'целиком|полностью|всю работу',q):b['scope']='whole';changed=True
    topic=re.search(r'(?:\bна тему\s+|\bтема\s*[:—\-]\s*)[«"]?(.+?)(?=,?\s+(?:к \d|срок[: ]|объем[: ]|\d+ страниц)|$)',question,re.I)
    if topic and not re.search(r'не (?:определена|известна)|пока нет|не знаю',topic[1],re.I):b['topic']=topic[1].strip(' «»."')[:500];changed=True
    volume=re.search(r'(\d{1,4})\s*(?:страниц|стр\b)',q)
    if volume:b['volume']=volume[0];changed=True
    date=re.search(r'\b(\d{4}-\d{2}-\d{2})\b',q)
    parsed=None;now=datetime.now(ZoneInfo('Europe/Moscow'))
    if date:
        try:parsed=datetime.strptime(date[1],'%Y-%m-%d')
        except ValueError:pass
    else:
        months='январ феврал март апрел ма май июн июл август сентябр октябр ноябр декабр'.split()
        # Separate month stems avoid interpreting arbitrary numbers as deadlines.
        mo=re.search(r'\b(\d{1,2})\s+(январ\w*|феврал\w*|марта|апрел\w*|мая|июн\w*|июл\w*|август\w*|сентябр\w*|октябр\w*|ноябр\w*|декабр\w*)(?:\s+(20\d{2}))?',q)
        if mo:
            m=next((i for i,stem in enumerate(['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'],1) if mo[2].startswith(stem)),None)
            try:parsed=datetime(int(mo[3] or now.year),m,int(mo[1]))
            except (ValueError,TypeError):pass
        elif q=='завтра' or re.search(r'\b(?:срок|дедлайн|нужно|сдать|к|до)\b.*\bзавтра\b',q):parsed=now+timedelta(days=1)
        elif re.search(r'\b(?:срок|дедлайн|нужно|сдать|к|до)\b.*\bсегодня\b',q):parsed=now
    if parsed:b['deadline']=parsed.strftime('%Y-%m-%d');changed=True
    if changed and len(question)>35:
        note=b.get('notes','');addition=('\n' if note else '')+question
        if len(note+addition)<=5000:b['notes']=note+addition
    return b,changed


def answer(question, order=None, context=None):
    if not isinstance(question,str) or not question.strip() or len(question)>2000:raise ValueError('question_required')
    question=question.strip();q=_norm(question);ctx=context if isinstance(context,dict) else {}
    if not isinstance(order,dict) or type(order.get('id')) is not int or order['id']<=0:order=None
    b=_brief(ctx.get('brief'));actions=[]
    def result(topic,text,links=(),suggestions=(),handoff=False):
        src=_PUBLIC_SOURCES.get(topic)
        return {'ok':True,'version':VERSION,'answer':text,'source':topic,'links':[{'label':a,'url':u} for a,u in links], 'suggestions':list(suggestions)[:3], 'sources':[{'title':src[0],'url':src[1]}] if src else [],'card':None,'handoff':handoff,'handoff_requested':False,'handoff_text':'Вопрос к мастеру: '+question,'context':{'topic':topic,'product':b.get('product') or (ctx.get('product') if isinstance(ctx.get('product'),str) and ctx.get('product') in _PRODUCTS else None)},'order_id':order.get('id') if isinstance(order,dict) else None}
    def finish(r):
        if not isinstance(r.get('context'),dict):r['context']={}
        if b:r['context']['brief']=b
        if b.get('active'):
            r['actions']=[{'id':'review_order','label':'Проверить и оформить заказ'}]
            r['draft']={**b,'product_label':_PRODUCTS.get(b.get('product'),'Выбрать формат')}
            if r.get('source')=='intake' and b.get('product'):
                rows=[{'label':'Работа','value':_PRODUCTS[b['product']]}]
                if re.search(r'статист|эмпир|исследован|spss|расчет',q):rows.append({'label':'Состав','value':'Исследование / расчёты: нужно уточнить'})
                if re.search(r'завтра|сегодня|сроч|сутк|24.*час',q):rows.append({'label':'Срок','value':'Срочно: проверим по заданию'})
                r['card']={'title':'Из твоего сообщения','rows':rows}
                r['answer']+=' Возможность срока и состав проверяются по заданию.'
        else:r.setdefault('actions',[])
        if not r.get('sources'):
            src=_PUBLIC_SOURCES.get(r.get('source'))
            r['sources']=[{'title':src[0],'url':src[1]}] if src else []
        if r.get('source') in ('bonus','budget') and not re.search(r'сертификат|уже.*код|не.*код',q):
            today=datetime.now(ZoneInfo('Europe/Moscow')).strftime('%Y-%m-%d')
            campaign=next((c for c in _CAMPAIGNS if c['start']<=today<=c['end']),None)
            if campaign:
                r['answer']+='\n\nДля нового пользователя и первого подходящего заказа можно проверить ПЕРВЫЙЛИСТ: 12% при сумме от 2 500 ₽, максимум 5 000 ₽. Заказ должен быть создан до 21 сентября 2026 включительно. Право на скидку и итог подтвердит сервер.'
                r['promo']={'code':campaign['code']}
                r['sources'].append({'title':'Условия первого заказа','url':campaign['url']})
        return r
    # Safety/support intentions have precedence over commercial keywords.
    human=bool(re.search(r'позови|позвать|связаться|свяжи|оператор|живой человек|хочу.*мастер|нужен.*мастер|переда[йт].*мастер',q))
    if human:return finish(_legacy_answer(question,order,context))
    failure=bool(re.search(r'платеж.*(?:не|завис)|оплата.*(?:не прош|не появ|не подтв)|статус.*не.*(?:измен|обнов)|повторн.*оплат|дважды.*оплат',q))
    if failure or not re.search(r'возврат|вернуть.*деньг|отмен|налогов.*чек|где.*чек',q) and re.search(r'деньги.*списа|списа.*деньг|уже.*оплати|оплатил|оплатила',q):
        return finish(_legacy_answer('Деньги списались, но статус не изменился',order,context))
    if re.search(r'возврат|вернуть.*деньг|отмен',q):
        return finish(result('fixes','Можно обсудить отмену всего заказа или отдельной позиции. Напиши, какую часть отменяешь и что уже выполнено. Мастер проверит этапы и расчёт по условиям заказа; я подготовлю обращение, а сумму возврата согласуют отдельно.', [('Условия возврата','/refunds.html')],['Позови мастера'],True))
    if re.search(r'удал.*данн|данн.*удал|не хочу.*реклам|отпис.*рассыл|отозвать.*согласи|мои.*данн',q):
        return finish(result('privacy','Для отзыва необязательных согласий открой настройки в кабинете; аналитика отдельно отключается в настройках cookie. Для удаления данных подготовлю запрос мастеру. Отзыв рекламного согласия сам по себе не отменяет заказ. Часть документов может храниться в пределах обязательных сроков, поэтому удаление подтверждается после рассмотрения запроса.', [('Настройки','/dashboard.html#settings'),('О данных','/privacy.html')],['Позови мастера']))
    if re.search(r'не.*найти.*заказ|не.*войти|не.*вход|заказ.*пропал|пропал.*заказ|без телеграм|без telegram|вход.*почт|почт.*вход',q) and ctx.get('topic')!='community':
        return finish(result('auth','Можно пользоваться сайтом и кабинетом без Telegram: выбери доступный способ входа на странице кабинета. Если заказ пропал после другого входа, вернись к тому способу, которым его оформлял. Вход по почте и через Telegram может открыть разные профили; автоматического объединения обещать нельзя. Мастеру можно передать номер заказа и описание ситуации, без паролей и кодов.', [('Открыть кабинет','/dashboard.html')],['Позови мастера']))
    if re.search(r'нов[а-я]*.*методич|поменял.*тем|измен.*требован|нов[а-я]* требован',q):
        return finish(result('requirements','Сохрани согласованную версию и пришли новые требования одним списком. Сначала сравним их с заданием: ошибки в согласованном объёме исправляются без доплаты, а новый объём, цена и срок обсуждаются до выполнения. Уже принятые части лучше явно отметить.', [('Мои заказы','/dashboard.html#orders')],['Позови мастера']))
    if re.search(r'налогов.*чек|чек.*налог|чек.*не.*приш|где.*чек',q):
        return finish(result('payment','Подтверждение платёжного сервиса и налоговый чек — разные документы. Посмотри оплату и документы в своём заказе. Если нужного чека нет, напиши мастеру номер заказа, дату и сумму. Полный номер карты и коды не нужны.', [('Мои заказы','/dashboard.html#orders')],['Позови мастера']))
    if re.search(r'не успе.*провер|(?:сколько|какой).*срок.*проверк|семь дней|7 дней.*проверк',q):
        return finish(result('review_period','На первичную проверку результата предусмотрено семь календарных дней. Если не успеваешь, лучше заранее написать в обсуждение заказа. Окончание этого срока само по себе не отменяет права сообщить о выявленных позже недостатках; порядок разбора указан в условиях.', [('Проверка результата','/refunds.html')],['Позови мастера']))
    if re.search(r'гарант.*(?:пятерк|оценк|защит|примут|приним)|преподавател.*не.*прим|гарант.*100|точный процент.*оригинальност',q):
        return finish(result('trust','Мы фиксируем состав, цену и срок до оплаты, а результат проверяем по заданию. Несоответствия согласованным требованиям исправляются без доплаты. Оценку, допуск, решение комиссии и конкретный результат внешней проверки обещать нельзя. Чтобы снизить риск, покажи методичку и критерии преподавателя до начала.', [('Условия и гарантии','/guarantees.html'),('Посмотреть примеры','/samples.html')],['Что входит в работу?','Хочу заказать работу']))
    if re.search(r'(?:сколько|много|число|количеств|сотни|тысяч).*(?:пользоват|клиент|заказ.*(?:день|сут|всего))|заказ.*(?:сутки|в день)',q):
        return finish(result('stats','Открытого проверенного счётчика клиентов и заказов сейчас нет, поэтому точное число я не назову. Зато качество можно посмотреть предметно: открыть документы в примерах, отзывы и порядок работы. В заказе заранее фиксируются состав, цена и срок.', [('Примеры документов','/samples.html'),('Отзывы','/reviews.html')],['Расскажи о Салоне','Хочу заказать работу']))
    if re.search(r'сколько.*(?:лет|работает|существу)|когда.*(?:основа|откр|созда)|с какого года|давно.*работ',q):
        return finish(result('history','На текущей странице о Салоне точная дата запуска не указана. Это мастерская индивидуальных учебных задач от создателя Кладовой ГИПСР. С опытом и подходом удобнее знакомиться по примерам документов и тому, что закрепляется в заказе.', [('О мастерской','/about.html'),('Примеры','/samples.html')],['Кто создатель?','Как проходит заказ?']))
    if re.search(r'кто.*(?:созда|основа|автор|стоит за)|создател|основател',q):
        r=result('creator','Салон и Кладовая ГИПСР — проекты одного автора. В реквизитах Салона исполнителем указан Семёнов Семён Юрьевич. Если хочешь обратиться по личному вопросу, помогу подготовить сообщение мастеру.', [('О проектах','/about.html'),('Исполнитель и контакты','/requisites.html')],['Что думаешь о Салоне?','Позови мастера'])
        r['sources'].append({'title':'Реквизиты исполнителя','url':'/requisites.html'});return finish(r)
    if re.search(r'(?:расскажи|что.*думаешь|что такое|что за|о проекте|чем.*занима).*(?:салон)|об академическ|о салоне',q):
        return finish(result('about','Академический Салон помогает с текстами, исследованиями и редактурой: от отдельного фрагмента до большого проекта. Здесь можно заказать нужный объём без обязательного платного разбора, заранее согласовать состав, срок и цену, а затем держать файлы, обсуждение и оплату в одном заказе.\n\nЯ — помощник этого проекта. Самым сильным в таком подходе считаю возможность сверять результат с конкретным заданием. Можно начать с примеров или рассказать мне свою задачу.', [('О Салоне','/about.html'),('Примеры работ','/samples.html')],['Кто создатель?','Что входит в работу?','Хочу заказать работу']))
    if re.search(r'(?:расскажи|что такое|что за|о проекте).*(?:кладов)',q):
        return finish(result('about','Кладовая ГИПСР — второй проект того же автора: расписание, материалы и правила института. Салон занимается индивидуальными задачами, а Кладовая помогает ориентироваться в повседневной учёбе.', [('Заглянуть в Кладовую','https://studkladovaya.ru/'),('Два проекта','/about.html')],['Как получить подарки?']))
    if re.search(r'дорого|дешевле|не по карману|нет денег|бюджет|не хватает.*денег|скинь.*цен|снизить.*цен',q):
        return finish(result('budget','Давай подберём объём под твой бюджет. Можно начать с отдельной главы, доработки своего текста или конкретного сложного места. При сравнении предложений посмотри, входят ли источники, оформление, проверка замечаний и нужный срок.\n\nЕщё проверим доступный промокод, подписку и бонусы: их применение подтверждается в смете до оплаты. Какой результат тебе нужен и на какую сумму ориентируешься?', [('Работы и цены','/services.html'),('Доступные выгоды','/dashboard.html#benefits')],['Нужна только часть работы','Какие скидки есть?','Хочу сделать самостоятельно']))
    if re.search(r'боюсь|обман|мошен|довер|почему.*выбрать|чем.*лучше|не уверен.*качеств',q):
        return finish(result('trust','Понимаю: передавать важную работу незнакомому сервису непросто. Посмотри реальные обезличенные примеры, отзывы и реквизиты. До оплаты ты видишь согласованные состав, срок и цену. Можно начать с небольшого конкретного этапа, чтобы оценить подход на своей задаче.', [('Примеры документов','/samples.html'),('Условия и гарантии','/guarantees.html')],['Хочу заказать только часть','Покажи отзывы']))
    if re.search(r'я подумаю|надо подумать|позже|не сейчас|пока не готов',q):
        return finish(result('hesitation','Конечно, решение за тобой. Можно спокойно посмотреть примеры и условия. Если уже собираем задание, оно останется в этом разговоре, пока открыта страница. Когда будешь готов, продолжим с того же места.', [('Посмотреть примеры','/samples.html')],['Что входит в работу?','Продолжим заказ']))
    if re.search(r'(?:написать|сделать|разобраться|хочу).*самостоятельно|бесплатн.*(?:помощ|инструмент)|своими силами',q):
        return finish(result('independent','Можно начать самостоятельно. В библиотеке есть разборы структуры, источников, оформления и защиты, а в инструментах — проверки текста, темы, источников и замечаний. Если застрянешь на одном месте, можно заказать помощь только с ним. С чего хочешь начать?', [('Библиотека','/knowledge.html'),('Бесплатные инструменты','/tools.html')],['Как выбрать тему?','Как оформить список литературы?']))
    if re.search(r'как дела|как ты|что делаешь|чем занят|как настроение|не скучаешь',q):
        return finish(result('social','Привет! Я на связи и готов разложить твою задачу по полочкам. Сейчас разговариваю с тобой: могу найти ответ в материалах Салона, помочь выбрать формат и собрать заказ. А у тебя как с учёбой — всё по плану или уже горят сроки?',suggestions=['Расскажи о Салоне','Хочу заказать работу','Покажи полезный совет']))
    if re.search(r'кто ты|ты бот|ты человек|ты ии|что умеешь',q):
        return finish(result('social','Я Листик, бот-помощник Академического Салона. Знаю опубликованные материалы и условия, помогаю собрать задание и открыть оформление здесь, в чате. По выбранному заказу могу показать доступные данные. Если вопрос требует решения человека, подготовлю обращение мастеру.',suggestions=['Хочу заказать работу','Расскажи о Салоне','Позови мастера']))
    if re.search(r'шутк|развесели|совет|поиграем',q) and len(q)<65:
        return finish(result('social','Мой любимый учебный фокус: превратить «сделать всю работу» в одно действие на 15 минут. Например, выписать три требования из методички. Маленький шаг уже снимает часть напряжения. Хочешь, вместе выберем такой шаг для твоей задачи?',suggestions=['Нужно выбрать тему','Есть замечания преподавателя','Хочу заказать работу']))
    if re.search(r'суахили|редк.*язык|нестандартн.*(?:дисциплин|задач)|друг.*язык',q):
        return finish(result('handoff','Для такой задачи нужно проверить доступность специалиста. Укажи язык, объём, нужный результат и дату. Подготовлю вопрос мастеру, чтобы подтвердить возможность и условия.',suggestions=['Позови мастера'],handoff=True))
    if re.search(r'первыйлист|промокод|скидк.*сертификат|сертификат.*скидк',q):
        return finish(result('bonus','Промокод и скидка подписки не суммируются: применяется более выгодная. Бонусами можно покрыть до 20% цены, а вместе со скидкой — до 25%. Сертификат применяется после этих уменьшений как отдельный способ покрытия суммы. Срок и применимость промокода проверяются по аккаунту и заказу; код сам по себе ещё не означает скидку.', [('Проверить выгоды','/dashboard.html#benefits'),('Условия программы','/loyalty.html')],['Как работают бонусы?','Как пригласить друга?']))
    if re.search(r'приглаш|приглас|реферал|\bдруга\b',q):
        return finish(result('referral','В действующей программе за первого полностью оплатившего подходящий заказ друга предусмотрено 200 бонусов однократно. Возьми личную ссылку в кабинете и поделись ею, если помощь действительно пригодится другу. Переходы по ссылке сами по себе бонусов не дают; начисление и ограничения проверяются по правилам программы.', [('Моя ссылка','/dashboard.html#referral'),('Действующие правила','/loyalty.html')],['Как работают бонусы?']))
    if re.search(r'отзывы|отзывов',q):
        return finish(result('samples','Отзывы собраны в отдельном разделе. Можно посмотреть обратную связь, а затем открыть примеры документов: так проще понять и опыт клиентов, и сам результат работы.', [('Отзывы','/reviews.html'),('Примеры документов','/samples.html')],['Хочу заказать работу']))
    if re.search(r'\bсчет\b|счета|счетом',q) and not re.search(r'бонус|баланс',q):
        return finish(_legacy_answer('Как оплатить заказ?',order,context))
    if re.fullmatch(r'(?:привет\w*|здравствуй\w*|добрый день|доброе утро|добрый вечер)[!.? ,]*',q):
        return finish(result('hello','Привет! Я Листик, бот-помощник Салона. На связи — можем обсудить твою задачу или любой вопрос о сайте.',suggestions=['Продолжим заказ' if b.get('active') else 'Хочу заказать работу','Расскажи о Салоне']))
    if re.search(r'не нужна|не нужен|не хочу.*заказ|убери заказ|передумал',q):
        b={}
        return finish(result('hesitation','Хорошо, остановимся со сбором этого задания. Расскажи, что тебе сейчас нужно: другой формат, полезный материал или ответ на вопрос.',suggestions=['Хочу заказать работу','Хочу сделать самостоятельно']))
    if order and re.search(r'статус|что дальше|когда.*готов|срок.*заказ|мой.*заказ|моя.*работ|к оплате|этап',q):
        r=_legacy_answer('Что дальше по моему заказу?',order,context)
        status=str(order.get('status',''));path='/dashboard.html#order-'+str(order['id'])
        next_step={
            'new':'Задание принято. Проверь, что все материалы приложены, и следи за вопросами мастера в обсуждении.',
            'priced':'Смета готова: сверь состав, срок и цену. Если всё подходит, прими предложение в заказе; при расхождениях сначала напиши мастеру.',
            'prepay':'Открой смету и оплату. Переходи к платежу только когда в заказе есть доступный счёт и понятная сумма текущего этапа.',
            'work':'Работа идёт по согласованному заданию. Новые требования передавай в обсуждение, чтобы согласовать их до выполнения.',
            'check':'Результат на проверке. Открой последнюю версию, сравни её с заданием и подтверди результат либо отправь замечания одним списком.',
            'done':'Заказ завершён. Файлы и история остаются в кабинете. Если нашёл несоответствие заданию, передай конкретное замечание мастеру.',
            'cancel':'Заказ отменён. Уточнения по расчёту или материалам можно передать в его обсуждение.'
        }.get(status,'Открой заказ: там доступно следующее действие и актуальное обсуждение.')
        if order.get('paused'):next_step='Заказ приостановлен. Открой его условия или обсуждение и согласуй дальнейший шаг с мастером.'
        elif order.get('claimed') is True or any(isinstance(p,dict) and (p.get('status')=='claimed' or p.get('state')=='claimed') for p in (order.get('payments') or [])):
            next_step='По платежу уже ожидается проверка. Не оплачивай повторно; следи за подтверждением в заказе.'
        r['answer']+='\n\n'+next_step
        r['links']=[{'label':'Открыть текущий этап','url':path}]
        return finish(r)
    if not order and re.search(r'мой.*заказ|моему.*заказ|статус.*заказ|заказ.*статус|моя.*работа',q):
        return finish(result('order','Открой нужный заказ в кабинете и спроси меня там. Тогда ответ будет относиться к его действительному статусу, сроку и оплате. По номеру, написанному в сообщении, я не раскрываю данные заказа.', [('Мои заказы','/dashboard.html#orders')],['Позови мастера']))
    # Draft updates never bypass questions about orders, support, payments or benefits.
    support=bool(re.search(r'оплат|платеж|скид|бонус|файл|прикреп|возврат|гарант|замечани|статус|что дальше|цен|стоит|стоим|счет|чек',q))
    if not order and ctx.get('intake_open') is True and not support and re.search(r'заказ|тема|срок|изменить|часть|глав|целиком|страниц',q):
        return finish(result('intake','Форма заказа уже открыта и сохраняет задание и файлы. Изменения темы, срока или состава внеси прямо в неё: так все условия останутся вместе. Нажми «Проверить и оформить заказ», чтобы вернуться к форме.',suggestions=['Какие скидки есть?','Что нужно приложить?']))
    if not order and not support and ctx.get('intake_open') is not True:
        if re.fullmatch(r'новый заказ[.! ]*',q):b={'active':True}
        if b.get('active') and re.search(r'ошибся|ошиблась|не определ|неизвест|не извест|пока нет|не знаю',q):
            return finish(result('intake','Хорошо, задание не меняю. Можно продолжить с тем, что уже известно, а тему и срок уточнить в форме. Для точного переноса напиши «Тема: …» или «Срок: …».',suggestions=['Проверить заказ','Изменить тему','Какие скидки есть?']))
        b,changed=_draft_update(question,b)
        if changed or re.fullmatch(r'(?:новый заказ|продолжим заказ|к заказу|оформить заказ|проверить заказ|собрать заказ)[.!? ]*',q):
            b['active']=True
            if not b.get('product'):text='Соберём заказ здесь. Какой формат тебе нужен: курсовая, ВКР, отчёт, статья или другая задача? Можно выбрать только нужную часть.';suggestions=['Курсовая работа','Дипломная работа','Отчёт по практике']
            elif not b.get('topic'):text='Записал формат: '+_PRODUCTS[b['product']]+'. Как звучит тема? Напиши «Тема: …», чтобы я точно перенёс её в задание. Её также можно уточнить позже в форме.';suggestions=['Тема пока не определена','Нужна только часть работы','Проверить заказ']
            elif not b.get('deadline'):text='Тему сохранил. К какой дате нужен результат? Например: «Срок: 20 декабря». Дату можно оставить для согласования в форме.';suggestions=['Срок пока не определён','Какие скидки есть?','Проверить заказ']
            else:text='Основа задания собрана. Проверь карточку, затем открой оформление: там можно уточнить состав, прикрепить файлы и указать контакт. Заказ отправится только после твоего подтверждения в форме.';suggestions=['Какие скидки есть?','Что нужно приложить?','Изменить тему']
            return finish(result('intake',text,suggestions=suggestions))
    # Prefer article-level answers to broad commercial keyword matches.
    wants_info=bool(re.search(r'^(?:а )?(?:как|что|чем|какой|какие|где|расскажи)|литератур|объект|предмет|дневник|титульн',q))
    if not support and not order and wants_info:
        previous_url=ctx.get('source_url') if ctx.get('source_url') in {p['url'] for p in _PAGES} else None
        query=question
        if re.fullmatch(r'(?:а )?(?:подробнее|расскажи еще|продолжай)[.!? ]*',q) and previous_url:
            query=next(p['title'] for p in _PAGES if p['url']==previous_url)
        found=_search(query,previous_url if query!=question else None)
        if found:
            r=result('site',found['answer'],[('Открыть материал',found['url'])],['Помоги с моей задачей','Хочу заказать работу'])
            r['sources']=[{'title':found['title'],'url':found['url']}];r['context']['source_url']=found['page'];return finish(r)
    legacy=_legacy_answer(question,order,context)
    if legacy['source']=='handoff' and not legacy.get('handoff_requested'):
        found=_search(question)
        if found:
            legacy=result('site',found['answer'],[('Открыть материал',found['url'])],['Хочу заказать работу','Позови мастера'])
            legacy['sources']=[{'title':found['title'],'url':found['url']}];legacy['context']['source_url']=found['page']
        else:
            legacy['answer']='Хочу правильно понять задачу. Какой результат тебе нужен и что уже есть на руках? Если речь о редкой дисциплине, языке или нестандартном сроке, уточним возможность у мастера. Я могу подготовить сообщение с твоим вопросом.'
    return finish(legacy)
