(function () {
  'use strict';

  var Salon = window.Salon || {};

  function byId(id) {
    return document.getElementById(id);
  }

  function money(value) {
    return Math.round(Number(value) || 0).toLocaleString('ru-RU') + ' ₽';
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function setButtonBusy(button, busy, label) {
    if (Salon.btnLoading) {
      Salon.btnLoading(button, busy, label);
      return;
    }
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = label || 'Отправляем…';
    } else {
      button.disabled = false;
      if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
    }
  }

  function initPlus() {
    var switches = Array.prototype.slice.call(document.querySelectorAll('[data-plus-period]'));
    if (!switches.length) return;

    function select(period) {
      switches.forEach(function (button) {
        var selected = button.dataset.plusPeriod === period;
        button.classList.toggle('is-current', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      document.querySelectorAll('[data-plus-price-display]').forEach(function (node) {
        node.textContent = period === 'month'
          ? node.dataset.plusPriceMonth
          : node.dataset.plusPriceSemester;
      });
      document.querySelectorAll('[data-plus-period-display]').forEach(function (node) {
        node.textContent = period === 'month'
          ? node.dataset.plusPeriodMonth
          : node.dataset.plusPeriodSemester;
      });
    }

    switches.forEach(function (button) {
      button.addEventListener('click', function () {
        select(button.dataset.plusPeriod);
      });
    });
  }

  function initDeposit() {
    var range = document.querySelector('[data-deposit-range]');
    if (!range) return;
    var tiers = Array.prototype.slice.call(document.querySelectorAll('[data-deposit-amount]'));

    function rateFor(amount) {
      if (amount >= 60000) return 15;
      if (amount >= 45000) return 12;
      if (amount >= 30000) return 10;
      return 8;
    }

    function render() {
      var amount = Number(range.value) || 20000;
      var rate = rateFor(amount);
      var bonus = Math.floor(amount * rate / 100);
      var minimum = Number(range.min) || 20000;
      var maximum = Number(range.max) || 60000;
      var position = ((amount - minimum) / (maximum - minimum)) * 100;

      range.style.setProperty('--deposit-position', position + '%');
      document.querySelectorAll('[data-deposit-value], [data-deposit-amount-label]').forEach(function (node) {
        node.textContent = money(amount);
      });
      document.querySelectorAll('[data-deposit-money], [data-receipt-money]').forEach(function (node) {
        node.textContent = money(amount);
      });
      document.querySelectorAll('[data-deposit-rate-label], [data-receipt-rate]').forEach(function (node) {
        node.textContent = rate + '\u202f%';
      });
      document.querySelectorAll('[data-deposit-bonus], [data-receipt-bonus]').forEach(function (node) {
        node.textContent = bonus.toLocaleString('ru-RU') + ' бонусов';
      });
      tiers.forEach(function (tier) {
        tier.classList.toggle('is-current', Number(tier.dataset.depositAmount) === (
          amount >= 60000 ? 60000 : amount >= 45000 ? 45000 : amount >= 30000 ? 30000 : 20000
        ));
      });
    }

    range.addEventListener('input', render);
    range.addEventListener('change', render);
    render();
  }

  function initSupport() {
    var form = byId('supportForm');
    if (!form || !Salon.api) return;
    var question = byId('supportQuestion');
    var email = byId('supportContact');
    var name = byId('supportName');
    var quiet = byId('supportQuiet');
    var consent = byId('supportConsent');
    var website = byId('supportWebsite');
    var files = byId('supportFiles');
    var fileName = byId('supportFileName');
    var submit = byId('supportSend');
    var status = byId('supportStatus');
    var success = byId('supportSuccess');

    function showStatus(message, type) {
      status.hidden = false;
      status.textContent = message;
      status.className = 'form-note' + (type ? ' is-' + type : '');
    }

    if (files) {
      files.addEventListener('change', function () {
        if (!files.files || !files.files.length) {
          fileName.textContent = 'Можно приложить документ после ответа редактора';
          return;
        }
        var first = files.files[0].name;
        fileName.textContent = files.files.length === 1
          ? first + ' · файл передадим через защищённый чат после ответа'
          : first + ' и ещё ' + (files.files.length - 1) + ' · передадим через защищённый чат';
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var bodyText = question.value.trim();
      var emailText = email.value.trim();

      if (bodyText.length < 10) {
        showStatus('Опишите вопрос чуть подробнее — одной-двух фраз будет достаточно.', 'error');
        question.focus();
        return;
      }
      var emailValid = Salon.valid
        ? Salon.valid.email(emailText)
        : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText);
      if (emailText && !emailValid) {
        showStatus('Для ответа через форму нужна действующая почта. В Telegram можно написать через кнопку рядом.', 'error');
        email.focus();
        return;
      }
      if (quiet.checked && !emailText) {
        showStatus('Для непубличного ответа укажите почту.', 'error');
        email.focus();
        return;
      }
      if (!consent.checked) {
        showStatus('Подтвердите согласие на обработку данных для ответа.', 'error');
        consent.focus();
        return;
      }

      setButtonBusy(submit, true, 'Отправляем вопрос…');
      Salon.api.post('/qa', {
        question: bodyText,
        pseudonym: name.value.trim(),
        email: emailText,
        quiet: !!quiet.checked,
        vid: Salon.store ? Salon.store.get('salon_vid', '') : '',
        website: website.value
      }).then(function (response) {
        setButtonBusy(submit, false);
        if (!(response && response.ok)) {
          var errors = {
            rate_limited: 'На сегодня лимит обращений с этого устройства исчерпан. Попробуйте завтра.',
            too_short: 'Опишите вопрос чуть подробнее.',
            email_required: 'Для непубличного ответа нужна почта.',
            bad_email: 'Проверьте адрес почты: похоже, в нём опечатка.'
          };
          showStatus(errors[response && response.error] || 'Не удалось отправить вопрос. Попробуйте ещё раз через минуту.', 'error');
          return;
        }

        form.hidden = true;
        success.hidden = false;
        var answer = success.querySelector('[data-support-success-copy]');
        if (answer) {
          answer.textContent = quiet.checked
            ? 'Вопрос передан редактору и не будет опубликован. Ответ придёт на указанную почту.'
            : 'Вопрос передан редактору. Если вы оставили почту, туда придёт уведомление об ответе.';
        }
        if (files && files.files && files.files.length) {
          var fileHint = success.querySelector('[data-support-file-hint]');
          if (fileHint) fileHint.hidden = false;
        }
        success.focus();
      });
    });
  }

  function initReviews() {
    var lightbox = byId('reviewLightbox');
    var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-review-proof]'));
    if (!lightbox || !buttons.length) return;
    var image = byId('reviewLightboxImage');
    var caption = byId('reviewLightboxCaption');
    var counter = byId('reviewLightboxCounter');
    var closeButton = lightbox.querySelector('[data-review-close]');
    var index = 0;
    var previousFocus = null;
    var inertTargets = [];

    function render(nextIndex) {
      index = (nextIndex + buttons.length) % buttons.length;
      var button = buttons[index];
      image.src = button.dataset.full || button.querySelector('img').src;
      image.alt = button.getAttribute('aria-label') || 'Отзыв клиента';
      caption.textContent = button.dataset.caption || '';
      counter.textContent = (index + 1) + ' / ' + buttons.length;
    }

    function setPageInert(on) {
      if (on) {
        inertTargets = Array.prototype.slice.call(document.body.children).filter(function (node) {
          return node !== lightbox && node.tagName !== 'SCRIPT';
        });
        inertTargets.forEach(function (el) {
          el.inert = true;
          el.setAttribute('aria-hidden', 'true');
        });
      } else {
        inertTargets.forEach(function (el) {
          el.inert = false;
          el.removeAttribute('aria-hidden');
        });
        inertTargets = [];
      }
    }

    function open(nextIndex, trigger) {
      previousFocus = trigger || document.activeElement;
      render(nextIndex);
      lightbox.hidden = false;
      lightbox.classList.add('is-open');
      document.body.classList.add('has-review-lightbox');
      setPageInert(true);
      closeButton.focus();
    }

    function close() {
      lightbox.classList.remove('is-open');
      lightbox.hidden = true;
      image.removeAttribute('src');
      document.body.classList.remove('has-review-lightbox');
      setPageInert(false);
      if (previousFocus && previousFocus.focus) {
        previousFocus.focus({ preventScroll: true });
        window.setTimeout(function () {
          if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
        }, 0);
      }
    }

    buttons.forEach(function (button, buttonIndex) {
      button.addEventListener('click', function () {
        open(buttonIndex, button);
      });
    });
    closeButton.addEventListener('click', close);
    lightbox.querySelector('[data-review-prev]').addEventListener('click', function () {
      render(index - 1);
    });
    lightbox.querySelector('[data-review-next]').addEventListener('click', function () {
      render(index + 1);
    });
    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox) close();
    });
    document.addEventListener('keydown', function (event) {
      if (lightbox.hidden) return;
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') render(index - 1);
      if (event.key === 'ArrowRight') render(index + 1);
      if (event.key === 'Tab') {
        var focusable = Array.prototype.slice.call(lightbox.querySelectorAll('button:not([disabled]),a[href]'));
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  function initGift() {
    var builder = byId('giftBuilder');
    if (!builder || !Salon.api) return;

    var config = {
      presets: [2000, 5000, 10000, 15000],
      min: 2000,
      max: 50000,
      deliver_max_days: 90,
      pay_online: false
    };
    var state = { amount: 5000, gift: null, token: '', pollTimer: null };
    var amountButtons = Array.prototype.slice.call(document.querySelectorAll('[data-gift-amount]'));
    var recipient = byId('giftRecipient');
    var message = byId('giftMessage');
    var previewAmount = byId('giftPreviewAmount');
    var previewName = byId('giftPreviewName');
    var previewMessage = byId('giftPreviewMessage');
    var prepare = byId('giftPrepare');
    var checkout = byId('giftCheckout');
    var custom = byId('giftCustom');
    var buyerName = byId('giftBuyerName');
    var buyerEmail = byId('giftBuyerEmail');
    var recipientBox = byId('giftRecipientBox');
    var recipientEmail = byId('giftRecipientEmail');
    var deliveryDate = byId('giftDate');
    var recipientAuthority = byId('giftRecipientAuth');
    var consent = byId('giftConsent');
    var website = byId('giftWebsite');
    var submit = byId('giftSubmit');
    var formNote = byId('giftFormNote');
    var payment = byId('giftPayment');
    var paymentEmpty = byId('giftPaymentEmpty');
    var paymentSum = byId('giftPaymentSum');
    var paymentWho = byId('giftPaymentWho');
    var paymentReq = byId('giftPaymentReq');
    var paymentActions = byId('giftPaymentActions');
    var paymentStatus = byId('giftPaymentStatus');
    var paymentFinal = byId('giftPaymentFinal');
    var params = new URLSearchParams(location.search);

    function selectedDelivery() {
      var checked = document.querySelector('input[name="giftDelivery"]:checked');
      return checked ? checked.value : 'self';
    }

    function showNote(text, type) {
      formNote.hidden = false;
      formNote.textContent = text;
      formNote.className = 'form-note' + (type ? ' is-' + type : '');
    }

    function selectAmount(value, fromCustom) {
      value = Math.round(Number(value) / 100) * 100;
      state.amount = value;
      amountButtons.forEach(function (button) {
        var selected = Number(button.dataset.giftAmount) === value;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      if (!fromCustom && custom) custom.value = '';
      previewAmount.textContent = value >= config.min && value <= config.max ? money(value) : '—';
    }

    function updatePreview() {
      var name = recipient.value.trim();
      var wish = message.value.trim();
      previewName.textContent = name ? 'Получатель: ' + name : 'Для редакторской консультации или работы';
      previewMessage.textContent = wish;
      previewMessage.hidden = !wish;
      var checkoutName = byId('giftCheckoutRecipient');
      var checkoutMessage = byId('giftCheckoutMessage');
      if (checkoutName && !checkoutName.matches(':focus')) checkoutName.value = name;
      if (checkoutMessage && !checkoutMessage.matches(':focus')) checkoutMessage.value = wish;
    }

    amountButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        selectAmount(Number(button.dataset.giftAmount), false);
      });
    });
    recipient.addEventListener('input', updatePreview);
    message.addEventListener('input', updatePreview);
    if (custom) {
      custom.addEventListener('input', function () {
        var value = Number(custom.value);
        if (value >= config.min && value <= config.max) {
          selectAmount(value, true);
        } else {
          state.amount = 0;
          amountButtons.forEach(function (button) {
            button.classList.remove('is-selected');
            button.setAttribute('aria-pressed', 'false');
          });
          previewAmount.textContent = '—';
        }
      });
    }

    prepare.addEventListener('click', function () {
      updatePreview();
      checkout.hidden = false;
      var checkoutName = byId('giftCheckoutRecipient');
      var checkoutMessage = byId('giftCheckoutMessage');
      if (checkoutName) checkoutName.value = recipient.value.trim();
      if (checkoutMessage) checkoutMessage.value = message.value.trim();
      checkout.scrollIntoView({ behavior: Salon.reduceMotion ? 'auto' : 'smooth', block: 'start' });
      buyerEmail.focus({ preventScroll: true });
    });

    document.querySelectorAll('input[name="giftDelivery"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        recipientBox.hidden = selectedDelivery() !== 'email';
      });
    });

    Salon.api.get('/gift/config').then(function (response) {
      if (!(response && response.ok)) return;
      config.min = Number(response.min) || config.min;
      config.max = Number(response.max) || config.max;
      config.deliver_max_days = Number(response.deliver_max_days) || config.deliver_max_days;
      config.pay_online = !!response.pay_online;
      var today = new Date();
      var maximum = new Date(Date.now() + config.deliver_max_days * 86400000);
      deliveryDate.min = today.toISOString().slice(0, 10);
      deliveryDate.max = maximum.toISOString().slice(0, 10);
    });

    submit.addEventListener('click', function () {
      var deliveryByEmail = selectedDelivery() === 'email';
      var email = buyerEmail.value.trim();
      var toEmail = deliveryByEmail ? recipientEmail.value.trim() : '';
      var validEmail = function (value) {
        return Salon.valid ? Salon.valid.email(value) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      };

      if (!(state.amount >= config.min && state.amount <= config.max)) {
        showNote('Выберите номинал от ' + money(config.min) + ' до ' + money(config.max) + '.', 'error');
        return;
      }
      if (!email && !Salon.api.token()) {
        showNote('Укажите вашу почту — на неё придут код и PDF.', 'error');
        buyerEmail.focus();
        return;
      }
      if (email && !validEmail(email)) {
        showNote('Проверьте адрес вашей почты: похоже, в нём опечатка.', 'error');
        buyerEmail.focus();
        return;
      }
      if (deliveryByEmail && !validEmail(toEmail)) {
        showNote('Укажите почту получателя или выберите «Вручу самостоятельно».', 'error');
        recipientEmail.focus();
        return;
      }
      if (deliveryByEmail && !recipientAuthority.checked) {
        showNote('Подтвердите право передать адрес получателя.', 'error');
        recipientAuthority.focus();
        return;
      }
      if (!consent.checked) {
        showNote('Подтвердите ознакомление с условиями и обработку данных.', 'error');
        consent.focus();
        return;
      }

      setButtonBusy(submit, true, 'Оформляем…');
      Salon.api.post('/gift', {
        amount: state.amount,
        buyer_name: buyerName.value.trim(),
        buyer_contact: email,
        recip_name: byId('giftCheckoutRecipient').value.trim(),
        recip_contact: toEmail,
        congrats: byId('giftCheckoutMessage').value.trim(),
        deliver_at: deliveryByEmail ? (deliveryDate.value || '') : '',
        consent: true,
        privacy_notice_ack: true,
        recipient_data_authority: !!(deliveryByEmail && recipientAuthority.checked),
        consent_doc: 'consent-request 1.0 · privacy 3.0 · oferta 3.2 · gift form 2.0',
        website: website.value
      }).then(function (response) {
        setButtonBusy(submit, false);
        if (!(response && response.ok)) {
          var messages = {
            bad_amount: 'Проверьте номинал сертификата.',
            bad_email: 'Проверьте вашу почту.',
            bad_recip_email: 'Проверьте почту получателя.',
            bad_date: 'Выберите дату в пределах ближайших ' + config.deliver_max_days + ' дней.',
            contact_required: 'Укажите почту — на неё придёт код.',
            consent_required: 'Нужно согласие на обработку данных.',
            rate_limit: 'Слишком много попыток. Подождите минуту и повторите.'
          };
          showNote(messages[response && response.error] || 'Не удалось оформить сертификат. Попробуйте ещё раз.', 'error');
          return;
        }
        state.gift = response.gift;
        state.token = response.buy_token;
        if (Salon.store) Salon.store.set('salon_gift_buy', { id: response.gift.id, t: response.buy_token });
        showNote('Сертификат оформлен. Осталось выбрать способ оплаты.', 'ok');
        drawPayment();
        payment.scrollIntoView({ behavior: Salon.reduceMotion ? 'auto' : 'smooth', block: 'center' });
      });
    });

    function giftPath(path) {
      return '/gift/' + state.gift.id + path + '?t=' + encodeURIComponent(state.token || '');
    }

    function paymentAction(path) {
      Salon.api.post(giftPath(path)).then(function (response) {
        if (!(response && response.ok)) {
          paymentStatus.textContent = 'Не удалось обновить оформление. Обновите страницу и попробуйте ещё раз.';
          return;
        }
        if (response.gift) {
          state.gift = response.gift;
        } else {
          state.gift = { state: 'canceled', amount: state.gift.amount, serial: state.gift.serial };
        }
        drawPayment();
      });
    }

    function bindPaymentActions() {
      var pay = byId('giftPay');
      var paid = byId('giftPaid');
      var unpaid = byId('giftUnpaid');
      var cancel = byId('giftCancel');
      if (pay) {
        pay.addEventListener('click', function () {
          setButtonBusy(pay, true, 'Открываем кассу…');
          Salon.api.post(giftPath('/pay')).then(function (response) {
            setButtonBusy(pay, false);
            if (response && response.ok && response.online && response.url) {
              location.href = response.url;
            } else if (response && response.ok && !response.online) {
              state.gift.requisites = response.requisites;
              drawPayment();
            } else {
              paymentStatus.textContent = 'Онлайн-касса недоступна. Деньги не списаны; используйте реквизиты ниже.';
            }
          });
        });
      }
      if (paid) paid.addEventListener('click', function () { paymentAction('/paid'); });
      if (unpaid) unpaid.addEventListener('click', function () { paymentAction('/unpaid'); });
      if (cancel) {
        cancel.addEventListener('click', function () {
          var message = 'Отменить оформление? Деньги не будут списаны.';
          if (Salon.confirm) {
            Salon.confirm({
              title: 'Отменить оформление?',
              text: 'Ничего не списано. Оформить сертификат заново можно в любой момент.',
              okLabel: 'Отменить',
              noLabel: 'Оставить',
              danger: true
            }).then(function (choice) {
              if (choice && choice.ok) paymentAction('/cancel');
            });
          } else if (window.confirm(message)) {
            paymentAction('/cancel');
          }
        });
      }
    }

    function drawPayment() {
      var gift = state.gift;
      if (!gift) return;
      paymentEmpty.hidden = true;
      payment.hidden = false;
      paymentSum.textContent = money(gift.amount);
      paymentWho.textContent = (gift.recip_name ? 'Для: ' + gift.recip_name + ' · ' : '') + 'сертификат ' + (gift.serial || '');
      paymentReq.hidden = !gift.requisites;
      paymentReq.textContent = gift.requisites || '';
      paymentActions.innerHTML = '';
      paymentFinal.hidden = true;
      paymentFinal.innerHTML = '';

      if (gift.state === 'pending') {
        var buttons = '';
        if (gift.pay_online) {
          buttons += '<button class="button button--primary" type="button" id="giftPay">Оплатить картой</button>';
        }
        buttons += gift.claimed
          ? '<button class="button button--secondary" type="button" id="giftUnpaid">Снять отметку</button>'
          : '<button class="button button--secondary" type="button" id="giftPaid">Я оплатил(а)</button>';
        buttons += '<button class="button button--text" type="button" id="giftCancel">Отменить</button>';
        paymentActions.innerHTML = buttons;
        paymentStatus.textContent = gift.claimed
          ? 'Отметка получена. После сверки платежа код и PDF придут на почту.'
          : 'После перевода отметьте оплату. Редактор сверит поступление и выпустит сертификат.';
        bindPaymentActions();
      } else if (gift.state === 'canceled') {
        paymentStatus.textContent = 'Оформление отменено. Деньги не списаны.';
        if (Salon.store) Salon.store.del('salon_gift_buy');
      } else {
        paymentStatus.textContent = 'Оплата подтверждена. Сертификат выпущен, код и PDF отправлены на почту.';
        paymentFinal.hidden = false;
        paymentFinal.innerHTML =
          '<div class="gift-code">' + escapeHTML(gift.code || '') + '</div>' +
          '<div class="gift-payment-actions">' +
          '<a class="button button--primary" href="gift.html?code=' + encodeURIComponent(gift.code || '') + '">Открыть сертификат</a>' +
          '<a class="button button--secondary" target="_blank" rel="noopener" href="' +
          Salon.api.base + '/gift/pdf?code=' + encodeURIComponent(gift.code || '') + '">Скачать PDF</a></div>';
        if (Salon.store) Salon.store.del('salon_gift_buy');
      }
    }

    function renderPublicGift(code) {
      var publicView = byId('giftPublicView');
      Salon.api.get('/gift/view?code=' + encodeURIComponent(code)).then(function (response) {
        if (!(response && response.ok)) {
          byId('giftViewStatus').textContent = 'Сертификат не найден. Проверьте код или ссылку из письма.';
          publicView.hidden = false;
          return;
        }
        var gift = response.gift;
        byId('giftStorefront').hidden = true;
        publicView.hidden = false;
        document.title = 'Сертификат на ' + money(gift.amount) + ' — Академический Салон';
        byId('giftViewAmount').textContent = money(gift.amount);
        byId('giftViewName').textContent = gift.recip_name
          ? 'Получатель: ' + gift.recip_name
          : 'Для редакторской консультации или работы';
        byId('giftViewMessage').textContent = gift.congrats || '';
        byId('giftViewMessage').hidden = !gift.congrats;
        byId('giftViewCode').textContent = gift.code || code;
        byId('giftViewStatus').textContent = gift.state_label || (
          gift.state === 'active' ? 'Действителен' :
          gift.state === 'spent' ? 'Погашен' :
          gift.state === 'expired' ? 'Срок предъявления истёк' : 'Требуется проверка'
        );
        var useButton = byId('giftViewUse');
        useButton.hidden = !(gift.state === 'active' && gift.balance > 0);
        useButton.href = 'configurator.html?gift=' + encodeURIComponent(gift.code || code);
        byId('giftViewPdf').href = Salon.api.base + '/gift/pdf?code=' + encodeURIComponent(gift.code || code);
      });
    }

    var code = (params.get('code') || '').trim().toUpperCase();
    if (code) {
      byId('giftStorefront').hidden = true;
      byId('giftPublicView').hidden = false;
      renderPublicGift(code);
      return;
    }

    var buyId = parseInt(params.get('buy') || '0', 10);
    var buyToken = params.get('t') || '';
    if (!buyId && Salon.store) {
      var saved = Salon.store.get('salon_gift_buy', null);
      if (saved && saved.id) {
        buyId = saved.id;
        buyToken = saved.t;
      }
    }
    if (buyId && buyToken) {
      Salon.api.get('/gift/state?id=' + buyId + '&t=' + encodeURIComponent(buyToken)).then(function (response) {
        if (!(response && response.ok && response.gift) || response.gift.state === 'canceled') {
          if (Salon.store) Salon.store.del('salon_gift_buy');
          return;
        }
        state.gift = response.gift;
        state.token = buyToken;
        checkout.hidden = false;
        drawPayment();
      });
    }

    function pollPayment() {
      if (state.gift && state.token && state.gift.state === 'pending') {
        Salon.api.get('/gift/state?id=' + state.gift.id + '&t=' + encodeURIComponent(state.token)).then(function (response) {
          if (!(response && response.ok && response.gift)) return;
          var previous = state.gift.state + '|' + state.gift.claimed;
          state.gift = response.gift;
          if (previous !== state.gift.state + '|' + state.gift.claimed) drawPayment();
        });
      }
      state.pollTimer = window.setTimeout(pollPayment, 12000);
    }
    state.pollTimer = window.setTimeout(pollPayment, 12000);
  }

  initPlus();
  initDeposit();
  initSupport();
  initReviews();
  initGift();
})();
