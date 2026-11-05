"""Patch the verified live cashier without replacing unrelated release overlays.

Usage: python3 patch.py BACKEND_MODULE STATIC_CHECKOUT_PAGE
No credentials, databases, forms or customer files are read.
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE_SHA = '61623e9c4fd9e751610b4ca61b4379f1d7e82f0535d53b6549548696d09d86c7'
SPEC = (ROOT/'spec.html').read_text(encoding='utf-8').replace('\r\n','\n')
SPEC_SHA = hashlib.sha256(SPEC.encode()).hexdigest()


def once(text, before, after):
    if text.count(before) != 1:
        raise ValueError('unexpected baseline: '+before[:90])
    return text.replace(before, after, 1)


def backend(source):
    source = source.replace('\r\n','\n')
    if hashlib.sha256(source.encode()).hexdigest() != BASE_SHA:
        raise ValueError('live cashier changed; review the new baseline before patching')
    source = once(source, 'PRODUCTS = {', '''LISTIK_EDITION = "listik 1.0"
LISTIK_SHA256 = "'''+SPEC_SHA+'''"
LISTIK_URL = "https://studkladovaya.ru/listik"
PRODUCTS = {
    "listik_20": {"title": "ЛистикGPT · 20 ответов", "prices": {399: "20 ответов на 30 дней"}, "receipt": "ЛистикGPT: информационная помощь, 20 ответов на 30 дней"},
    "listik_60": {"title": "ЛистикGPT · 60 ответов", "prices": {899: "60 ответов на 30 дней"}, "receipt": "ЛистикGPT: информационная помощь, 60 ответов на 30 дней"},''')
    source = once(source, '"edition": SPEC_EDITION, "sha256": SPEC_SHA256,', '"edition": LISTIK_EDITION if link["product"].startswith("listik_") else SPEC_EDITION, "sha256": LISTIK_SHA256 if link["product"].startswith("listik_") else SPEC_SHA256,')
    source = once(source, '''f"Исправление оформления .docx, заказ {inv['ord']} · Кладовая ГИПСР"''', '''f"{PRODUCTS[inv['product']]['title']}, заказ {inv['ord']} · Кладовая ГИПСР"''')
    source = once(source, '''"edition": SPEC_EDITION, "bot": f"{BOT}?start=paid_{link['order']}",''', '''"edition": LISTIK_EDITION if link["product"].startswith("listik_") else SPEC_EDITION,
            "bot": LISTIK_URL if link["product"].startswith("listik_") else f"{BOT}?start=paid_{link['order']}",''')
    source = once(source, '''        prefix = "paid_" if result == "paid" else "payfail_"''', '''        stored = await self.call(self.store.order, order)
        if stored and stored["product"].startswith("listik_"):
            raise web.HTTPFound(LISTIK_URL + "?payment=returned")
        prefix = "paid_" if result == "paid" else "payfail_"''')
    source = once(source, 'class Runtime:', '''LISTIK_STATUS_URL = "https://studkladovaya.ru/listik-api/ask"


async def ensure_listik_open(link):
    if not link["product"].startswith("listik_"):
        return
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as session:
            async with session.post(LISTIK_STATUS_URL, json={"kind":"quota"}) as response:
                data = await response.json()
                if response.status != 200 or data.get("ok") is not True or data.get("quota",{}).get("service_paused") is not False:
                    raise PayError("checkout_closed",503)
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
        raise PayError("checkout_closed",503) from None


class Runtime:''')
    source = once(source, '            await self.ensure_open()  # закрыто', '            await ensure_listik_open(link)\n            await self.ensure_open()  # закрыто')
    source = once(source, '        link = verify_link(body, now=now)', '        link = verify_link(body, now=now)\n        await ensure_listik_open(link)')
    compile(source, 'kladovaya_pay.py', 'exec')
    return source


def page(source):
    source = source.replace('\r\n','\n')
    # Preserve the exact legacy specification bytes/hash. Hide until quote verifies.
    source = once(source, '</head>', '<style>.kp-spec[aria-labelledby="kpSpecTitle"]{display:none}</style></head>')
    source = once(source, '</main>', SPEC+'\n</main>')
    source = once(source, 'После оплаты касса вернёт вас в бота, файл придёт туда.', 'После оплаты касса вернёт вас к выбранной услуге.')
    source = source.replace('Оплата исправления оформления', 'Оплата услуги Кладовой')
    # Existing release includes the script inline; replace only its own marked block.
    pattern = r'<script[^>]*>\s*\(function \(\) \{\s*\x27use strict\x27;\s*// kladovaya-pay:20261031-v1[\s\S]*?</script>'
    matches = list(re.finditer(pattern,source))
    if len(matches)!=1:
        raise ValueError('expected one inline cashier script')
    m=matches[0]
    source=source[:m.start()]+'<script>\n'+(ROOT/'page.js').read_text(encoding='utf-8')+'\n</script>'+source[m.end():]
    return source


if __name__ == '__main__':
    module, html = map(Path,sys.argv[1:])
    code, markup = backend(module.read_text(encoding='utf-8')), page(html.read_text(encoding='utf-8'))
    module.write_text(code,encoding='utf-8',newline='\n')
    html.write_text(markup,encoding='utf-8',newline='\n')
    print('patched cashier; spec sha256='+SPEC_SHA)
