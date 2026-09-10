"""Reusable subscriber gifts. No monetary ledger, paid API or messaging side effects.

Identity is injected by the reviewed webapp session resolver. Only authenticated
Telegram identities can claim; stored grants survive later unsubscribe. Separate
SQLite file is additive and is never rolled back with application source.
"""
from __future__ import annotations
import asyncio
from contextlib import contextmanager
import html
import json
import os
import sqlite3
import time
from pathlib import Path

# Numeric IDs verified with Telegram getChat; public usernames are display links only.
CHANNELS = {'salon': -1003745006134, 'kladovaya': -1001236018289}
VERSION = '2026-09-v1'
MEMBERS = {'creator', 'administrator', 'member'}

def member(value):
    status = value.get('status') if isinstance(value, dict) else getattr(value, 'status', '')
    present = value.get('is_member') if isinstance(value, dict) else getattr(value, 'is_member', False)
    return status in MEMBERS or (status == 'restricted' and present is True)

def status_of(value):
    return value.get('status') if isinstance(value, dict) else getattr(value, 'status', '')

class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS community_grants (
                user_id INTEGER NOT NULL, gift_id TEXT NOT NULL, version TEXT NOT NULL,
                created_at INTEGER NOT NULL, PRIMARY KEY(user_id,gift_id,version));
                CREATE TABLE IF NOT EXISTS community_checks (
                user_id INTEGER NOT NULL, channel TEXT NOT NULL, checked_at INTEGER NOT NULL,
                PRIMARY KEY(user_id,channel));''')
        os.chmod(self.path, 0o600)
    @contextmanager
    def connect(self):
        db=sqlite3.connect(self.path, timeout=3)
        try:
            with db: yield db
        finally: db.close()
    def grants(self, uid):
        with self.connect() as db:
            return {r[0] for r in db.execute('SELECT gift_id FROM community_grants WHERE user_id=? AND version=?', (uid,VERSION))}
    def grant(self, uid, gift, now):
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO community_grants VALUES(?,?,?,?)', (uid,gift,VERSION,now))
    def reserve(self, uid, channel, now):
        with self.connect() as db:
            cur=db.execute('''INSERT INTO community_checks VALUES(?,?,?) ON CONFLICT(user_id,channel)
                DO UPDATE SET checked_at=excluded.checked_at WHERE community_checks.checked_at<=?''', (uid,channel,now,now-15))
            return cur.rowcount == 1

class Rewards:
    def __init__(self, store, bot, clock=time.time):
        self.store,self.bot,self.clock=store,bot,clock
    async def overview(self, identity):
        uid=identity['user_id']; grants=await asyncio.to_thread(self.store.grants,uid)
        return {'ok':True,'enabled':True,'linked':bool(identity.get('telegram_id')) and not identity.get('impersonated',False),
                'channels':{k:{'granted':k in grants,'status':'granted' if k in grants else 'ready'} for k in CHANNELS}}
    async def claim(self, identity, channel):
        if channel not in CHANNELS: return {'ok':False,'error':'invalid_channel'}
        if identity.get('impersonated'): return {'ok':False,'error':'impersonation_forbidden'}
        if not identity.get('telegram_id'): return {'ok':False,'error':'telegram_required'}
        state=await self.overview(identity)
        if state['channels'][channel]['granted']: return state
        uid=identity['user_id']; now=int(self.clock())
        if not await asyncio.to_thread(self.store.reserve,uid,channel,now):
            state['channels'][channel]['status']='unavailable';state['retry_after']=15;return state
        try:
            bot_user=await asyncio.wait_for(self.bot.get_me(),timeout=8)
            bot_id=bot_user.get('id') if isinstance(bot_user,dict) else bot_user.id
            admin=await asyncio.wait_for(self.bot.get_chat_member(CHANNELS[channel],bot_id),timeout=8)
            if status_of(admin) not in {'creator','administrator'}: raise RuntimeError('not_admin')
            result=await asyncio.wait_for(self.bot.get_chat_member(CHANNELS[channel],identity['telegram_id']),timeout=8)
            if not member(result):
                state['channels'][channel]['status']='not_member' if status_of(result) in {'left','kicked','restricted'} else 'unavailable';return state
        except Exception:
            # Telegram error strings may contain credentials or user data.
            state['channels'][channel]['status']='unavailable';return state
        await asyncio.to_thread(self.store.grant,uid,channel,now)
        return await self.overview(identity)
    async def gift(self, identity, gift):
        if gift not in CHANNELS: return {'ok':False,'error':'not_found'}
        if gift not in await asyncio.to_thread(self.store.grants,identity['user_id']):
            return {'ok':False,'error':'gift_not_claimed'}
        return {'ok':True,'document':gift_document(gift)}

def gift_document(gift):
    """Original offline worksheets, printable and editable; no client data included."""
    if gift not in CHANNELS: raise ValueError('unknown gift')
    def checklist(items):
        return '<div class="checklist">'+''.join('<label><input type="checkbox"> <span>'+html.escape(x)+'</span></label>' for x in items)+'</div>'
    def table(headers,rows=5):
        return '<table><thead><tr>'+''.join('<th>'+x+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td contenteditable="true" aria-label="'+x+'"></td>' for x in headers)+'</tr>' for _ in range(rows))+'</tbody></table>'
    def note(title,placeholder):
        return '<label class="note"><strong>'+title+'</strong><div contenteditable="true" role="textbox" aria-label="'+title+'" data-placeholder="'+placeholder+'"></div></label>'
    if gift=='salon':
        title='Сдать без суеты';project='Академический Салон';color='#5136b5';url='https://t.me/akademsalon'
        sections=[('Перед отправкой', 'Один проход по важному, чтобы не пересылать работу заново.',
            checklist(['Тема, цель и задачи совпадают с согласованным заданием.','Введение, выводы и заключение отвечают на одни и те же вопросы.','Каждый источник из текста есть в списке литературы, и наоборот.','Проверены ссылки на рисунки, таблицы и приложения.','Оглавление обновлено после последней правки.','Шрифт, интервалы, поля и нумерация сверены с методичкой.','В файле нет чужих имён, комментариев и режима исправлений.','Приложены все файлы, которые просил руководитель.','Имя файла и формат понятны; последняя версия открывается.'])+note('Мой последний контроль','Что ещё нужно проверить перед отправкой?')),
          ('Замечания без потерь','Одна строка на замечание. Сохраняй формулировку руководителя рядом с решением.',
            table(['Замечание и страница','Что меняю','Где исправлено','Готово'],6)+note('Нужно уточнить','Какие замечания противоречат друг другу или требуют уточнения?')),
          ('Речь к защите','Каркас для твоего выступления. Подставь свои результаты, не пересказывай оглавление.',
            note('Начало · 30 секунд','Тема. Почему этот вопрос важен именно в твоей работе?')+note('Задача и метод · 1 минута','Что ты хотел выяснить? Как проверял: материал, выборка, методы?')+note('Главные результаты · 2–3 минуты','Два-три результата с конкретными цифрами или примерами. Какой слайд это показывает?')+note('Вывод · 30 секунд','Что получилось установить? Где можно использовать результат?')+note('Три ожидаемых вопроса','Что могут спросить о методе, ограничениях и практической пользе?')+'<p class="hint">Длительность уточни у кафедры. Проговори речь вслух с таймером, затем убери всё, что не помогает объяснить результат.</p>')]
    else:
        title='Сессия по полочкам';project='Кладовая ГИПСР';color='#426438';url='https://t.me/kladovaya_gipsr'
        sections=[('Неделя без перегруза','Выбери три обязательных результата. Остальное добавляй, только если остаётся время.',
            note('Три главных результата недели','1.\n2.\n3.')+table(['День / дата','Главное дело','Срок','Запас времени'],7)+note('Что можно упростить','Разделить задачу, попросить уточнение, перенести необязательное.')+'<p class="hint">Оставь один свободный блок на внезапные правки. Планируй завершение раньше официальной сдачи.</p>'),
          ('Билеты: видеть прогресс','Проверь себя без конспекта. Отметка «прочитано» не заменяет воспроизведение.',
            table(['Билет / тема','Первый раз','Могу объяснить','Повторить'],12)+checklist(['Собран актуальный список вопросов.','Непонятные темы вынесены в отдельный список.','На сложные темы оставлено больше одного подхода.','Перед экзаменом есть время на сон и сборы.'])),
          ('Конспект, который помогает','Слева — вопросы. Справа — короткие ответы, определения и примеры.',
            note('Предмет, тема, дата','Заполни перед занятием.')+table(['Вопрос / понятие','Объяснение своими словами'],8)+note('Три мысли после занятия','Что было новым? Что связано с предыдущей темой? Где это пригодится?')+note('Осталось непонятным','Что уточнить у преподавателя или найти в источнике?'))]
    cards=''.join('<section id="part'+str(i)+'"><div class="section-head"><span>0'+str(i+1)+'</span><h2>'+heading+'</h2></div><p class="lead">'+description+'</p>'+body+'</section>' for i,(heading,description,body) in enumerate(sections))
    tabs=''.join('<a href="#part'+str(i)+'">'+h+'</a>' for i,(h,_,_) in enumerate(sections))
    return '''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>'''+title+''' · личный набор</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{--accent:'''+color+''';margin:0;background:#f5f3f8;color:#292537;font:15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:980px;padding:45px 32px;margin:auto}.brand{font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--accent)}header{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;border-bottom:1px solid #dcd5e8;padding-bottom:30px}h1{font-size:clamp(35px,6vw,61px);font-weight:600;letter-spacing:-.065em;line-height:1.05;max-width:590px;margin:20px 0}header p{max-width:550px;color:#6b6376;font-size:13px}.mark{width:96px;height:120px;background:var(--accent);color:white;border-radius:12px 35px 12px 12px;display:grid;place-items:center;font:italic 66px Georgia}nav{display:flex;gap:10px;flex-wrap:wrap;margin:25px 0}nav a{padding:9px 14px;border:1px solid #dcd5e8;border-radius:20px;text-decoration:none;color:var(--accent);font-size:12px}section{background:white;border:1px solid #e4dfea;border-radius:20px;padding:30px;margin:20px 0;scroll-margin-top:20px}.section-head{display:flex;align-items:center;gap:17px}.section-head>span{font-size:12px;color:var(--accent);border:1px solid #dcd5e8;border-radius:50%;width:34px;height:34px;display:grid;place-items:center}h2{font-size:25px;letter-spacing:-.04em;font-weight:600;margin:0}.lead{font-size:13px;color:#6b6376;margin:15px 0 22px}.checklist{display:grid;gap:12px}.checklist label{display:flex;align-items:start;gap:9px;font-size:14px;cursor:pointer}.checklist input{width:18px;height:18px;margin-top:4px;accent-color:var(--accent);flex:none}.checklist input:checked+span{text-decoration:line-through;color:#8b8495}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:20px 0;font-size:12px}th{background:#f0ebf8;color:var(--accent);text-align:left;font-weight:600}th,td{border:1px solid #dcd5e8;padding:10px;overflow-wrap:anywhere}td{height:50px;vertical-align:top}.note{display:block;margin:22px 0}.note strong{font-size:13px;font-weight:600}.note>div{border:1px solid #dcd5e8;border-radius:10px;min-height:82px;padding:13px;margin-top:8px;white-space:pre-wrap;font-size:14px}[contenteditable]:empty:before{content:attr(data-placeholder);color:#91889e}[contenteditable]:focus{outline:2px solid var(--accent);outline-offset:2px}.hint{padding:15px;background:#f3eff9;border-radius:10px;font-size:12px;color:#655b73}.tools{display:flex;gap:10px;flex-wrap:wrap}button{font:600 12px inherit;background:var(--accent);color:white;border:0;border-radius:10px;padding:13px 17px;cursor:pointer;min-height:44px}.status{font-size:12px;color:var(--accent);min-height:20px}footer{font-size:12px;color:#6b6376;margin-top:25px}footer a{color:var(--accent)}@media(max-width:600px){.wrap{padding:25px 15px}header{gap:12px}.mark{width:60px;height:85px;font-size:44px}section{padding:20px 16px}h2{font-size:22px}th,td{padding:7px;font-size:10px}.section-head{gap:10px}nav a{font-size:11px;padding:8px 10px}}@media print{body{background:white;font-size:11pt}.wrap{max-width:none;padding:0}.tools,nav,.status,header p{display:none}section{break-before:page;border:0;margin:0;padding:0}section:first-of-type{break-before:auto}header{padding:0 0 15px}h1{font-size:30pt;margin:10px 0}.mark{width:50px;height:60px;font-size:34px}table,tr,.note{break-inside:avoid}[contenteditable]:empty:before{color:#aaa}footer{display:none}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body><main class="wrap"><header><div><span class="brand">'''+project+''' · ДЛЯ СВОИХ</span><h1>'''+title+'''</h1><p>Твой личный набор. Заполняй прямо здесь, сохрани копию или распечатай. Всё работает без интернета. Данные никуда не отправляются.</p></div><span class="mark" aria-hidden="true">'''+('а.' if gift=='salon' else 'к.')+'''</span></header><nav aria-label="Инструменты">'''+tabs+'''</nav><div class="tools"><button type="button" id="save">Сохранить заполненную копию</button><button type="button" id="print">Распечатать / PDF</button></div><p class="status" id="status" role="status">Изменения сохраняются только по кнопке. Перед закрытием скачай свою копию.</p>'''+cards+'''<footer>Подарок от <a href="'''+url+'''" target="_blank" rel="noopener noreferrer">'''+project+'''</a>. Эти шаблоны помогают организовать работу; требования твоей кафедры и методички имеют приоритет.</footer></main><script>
document.querySelectorAll('input[type=checkbox]').forEach(function(x){x.addEventListener('change',function(){if(x.checked)x.setAttribute('checked','');else x.removeAttribute('checked')})});
document.getElementById('print').addEventListener('click',function(){window.print()});
document.getElementById('save').addEventListener('click',function(){var url=URL.createObjectURL(new Blob(['<!doctype html>'+document.documentElement.outerHTML],{type:'text/html;charset=utf-8'}));var a=document.createElement('a');a.href=url;a.download='moy-uchebnyy-nabor.html';a.click();setTimeout(function(){URL.revokeObjectURL(url)},30000);document.getElementById('status').textContent='Копия скачана. Открой её, чтобы продолжить с сохранёнными записями.'});
</script></body></html>'''


def register_routes(app, resolve_identity, *, path, enabled=False):
    """Attach only to an existing app with its authenticated CSRF middleware.
    resolve_identity returns None or {user_id:int, telegram_id:int|None,
    impersonated:bool}; it must revalidate session expiry/revocation each call.
    """
    from aiohttp import web
    runtime=Rewards(Store(path),app['bot']) if enabled else None
    headers={'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}
    async def identity(request):
        who=await resolve_identity(request)
        if not who or not isinstance(who.get('user_id'),int) or not who['user_id']:
            raise web.HTTPUnauthorized(headers=headers)
        return who
    async def overview(request):
        who=await identity(request)
        return web.json_response(await runtime.overview(who) if runtime else {'ok':True,'enabled':False,'linked':False,'channels':{}},headers=headers)
    async def claim(request):
        who=await identity(request)
        if not runtime: return web.json_response({'ok':False,'error':'disabled'},status=503,headers=headers)
        if request.content_length is None or request.content_length>128: raise web.HTTPBadRequest(headers=headers)
        try: body=await request.json()
        except (ValueError,UnicodeError): raise web.HTTPBadRequest(headers=headers)
        if not isinstance(body,dict) or set(body)!={'channel'} or not isinstance(body['channel'],str) or body['channel'] not in CHANNELS: raise web.HTTPBadRequest(headers=headers)
        result=await runtime.claim(who,body['channel'])
        return web.json_response(result,status=200 if result.get('ok') else 403,headers=headers)
    async def gift(request):
        who=await identity(request)
        if not runtime: raise web.HTTPServiceUnavailable(headers=headers)
        result=await runtime.gift(who,request.match_info['gift_id'])
        return web.json_response(result,status=200 if result.get('ok') else 403,headers=headers)
    app.router.add_get('/api/community',overview)
    app.router.add_post('/api/community/claim',claim)
    app.router.add_get('/api/community/gift/{gift_id}',gift)
