"""Present verified public referral terms without the legal-document DOM transformer."""
import re

def render_referral(source, shell):
    head = re.search(r'<head>([\s\S]*?)</head>', source)[1]
    head = re.sub(r'<link\b[^>]*rel=["\']stylesheet["\'][^>]*>', '', head)
    head = re.sub(r'<style\b[\s\S]*?</style>', '', head)
    head += ''.join('<link rel="stylesheet" href="'+p+'">' for p in [
        'assets/fonts/fonts.css', 'assets/css/salon-direct.css',
        'assets/css/salon-experience.css', 'assets/css/salon-home.css',
        'assets/css/salon-referral-public.css'])
    match = re.search(r'<main\b[^>]*>([\s\S]*?)</main>', source)
    if not match: raise ValueError('No verified referral content')
    content = match[1]
    if 'club-hero' in content:
        # Preserve the verified economic paragraph byte for byte inside native details.
        content = re.sub(r'(<p>Пригласившему[\s\S]*?</p>)', r'<details class="rf-terms"><summary>Условия начисления <span aria-hidden="true">＋</span></summary>\1</details>', content, count=1)
        content = content.replace('<h1>Бонусы за личную рекомендацию.</h1>', '<h1>Хорошим<br><em>делятся.</em></h1><p class="rf-intro">Пригласи друга в Салон.<br>Получи бонусы на следующие заказы.</p>')
        content = content.replace('<a class="button button--primary" href="loyalty.html">Прочитать полные правила</a>', '<a class="rf-button" href="dashboard.html#referral">Получить личную ссылку <span aria-hidden="true">↗</span></a>')
        content = content.replace('<a class="button button--text" href="configurator.html">Описать новую задачу</a>', '<a class="rf-text-link" href="loyalty.html">Полные правила →</a>')
        content = content.replace('<strong>Первый заказ оплачен</strong>', '<strong>Первый заказ<br>оплачен полностью</strong>')
        content = content.replace('<span class="club-seal" aria-hidden="true">АС</span>', '<span class="club-seal" aria-hidden="true">а.</span><span class="rf-ticket-label">ЗА ТВОЮ РЕКОМЕНДАЦИЮ</span>')
        content = content.replace('<h2>Ссылка создаётся в Telegram-боте.</h2>', '<h2>Своим — свою ссылку.</h2>')
        content = content.replace('Откройте раздел «Мои бонусы» после входа в бот. Регистрация по ссылке сама по себе не даёт бонусов: начисление появляется только после подтверждённой оплаты.', 'Открой личную ссылку в кабинете и отправь другу. Если удобнее Telegram, она есть и в разделе «Мои бонусы» нашего бота.')
        content, n = re.subn(r'<div class="invite-action">[\s\S]*?</div>\s*</div>', '<div class="rf-invite-actions"><a class="rf-button" href="dashboard.html#referral">Моя ссылка в кабинете <span aria-hidden="true">↗</span></a><a class="rf-text-link" href="https://t.me/academic_saloon_bot?start=club" target="_blank" rel="noopener">Открыть Telegram ↗</a></div>', content, count=1)
        if n != 1: raise ValueError('Unknown legacy invitation structure')
        content = content.replace('<article class="club-card">', '<article class="club-card" id="how">', 1)
        content = content.replace('Новый клиент впервые открывает бота по вашей ссылке', 'Друг впервые открывает бота по твоей ссылке')
        content = content.replace('Оформляет и оплачивает заказ', 'Оформляет первый заказ и оплачивает его полностью')
        content = content.replace('Бонусы начисляются после подтверждения оплаты', 'После подтверждения оплаты тебе начисляют 200 бонусов')
    header = re.search(r'<header class="site-header[\s\S]*?</header>', shell)[0]
    footer = re.search(r'<footer class="site-footer[\s\S]*?</footer>', shell)[0]
    js = ''.join('<script src="assets/js/'+s+'.js"></script>' for s in ['app','salon-products','salon-experience','salon-shell'])
    return '<!doctype html><html lang="ru"><head>'+head+'</head><body class="salon-direct salon-experience concept-shell salon-referral-public"><a class="skip-link" href="#main">К содержанию</a>'+header+'<main id="main" class="rf-page" data-referral-public>'+content+'</main>'+footer+js+'</body></html>'
