// Мини-афиша: список → карточка события → выбор билета → форма → успех.
// Роутинг через hash (#/, #/event/<id>, #/checkout, #/success), чтобы сайт работал на GitHub Pages без настройки сервера.
(function () {
  'use strict';

  var app = document.getElementById('app');
  var track = window.analytics ? window.analytics.track : function () {};
  var EVENTS = window.EVENTS;
  var CATEGORIES = window.CATEGORIES;
  var MAX_QTY = 6;

  // ---------- хранилище (sessionStorage может быть недоступен — тогда живём в памяти) ----------
  var memory = {};
  function load(key, fallback) {
    try {
      var v = sessionStorage.getItem('afisha_' + key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return key in memory ? memory[key] : fallback; }
  }
  function save(key, value) {
    memory[key] = value;
    try { sessionStorage.setItem('afisha_' + key, JSON.stringify(value)); } catch (e) { /* приватный режим */ }
  }

  var filters = load('filters', { date: 'all', category: 'all' });
  var selection = load('selection', null); // { eventId, ticketId, qty }
  var lastPosition = null;                 // позиция карточки в списке, по которой кликнули

  // ---------- даты ----------
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  var today = startOfDay(new Date());
  // Ближайшая суббота; в воскресенье «этими выходными» считается вчерашняя суббота + сегодня
  var anchor = today.getDay() === 0 ? addDays(today, -1) : addDays(today, 6 - today.getDay());

  EVENTS.forEach(function (ev) {
    var d = addDays(anchor, ev.day);
    if (d < today) d = addDays(d, 7);
    ev.date = d;
    ev.priceFrom = Math.min.apply(null, ev.tickets.map(function (t) { return t.price; }));
  });
  EVENTS.sort(function (a, b) { return a.date - b.date || a.time.localeCompare(b.time); });

  var DATE_FILTERS = [
    { id: 'all', name: 'Все даты', test: function () { return true; } },
    { id: 'today', name: 'Сегодня', test: function (d) { return +d === +today; } },
    { id: 'weekend', name: 'Эти выходные', test: function (d) { return d >= addDays(anchor, -1) && d <= addDays(anchor, 1); } },
    { id: 'next_weekend', name: 'Следующие выходные', test: function (d) { return d >= addDays(anchor, 6) && d <= addDays(anchor, 8); } },
  ];

  var fmtDay = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  function dateLabel(d) {
    if (+d === +today) return 'Сегодня';
    if (+d === +addDays(today, 1)) return 'Завтра';
    return fmtDay.format(d);
  }
  function rub(n) { return n.toLocaleString('ru-RU').replace(/ |\s/g, ' ') + ' ₽'; }
  function catName(id) { var c = CATEGORIES.find(function (x) { return x.id === id; }); return c ? c.name : id; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function byId(id) { return EVENTS.find(function (e) { return e.id === id; }); }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------- роутер ----------
  var prevRoute = null;

  function parse() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/');
    if (parts[0] === 'event' && parts[1]) return { name: 'event', id: decodeURIComponent(parts[1]) };
    if (parts[0] === 'checkout') return { name: 'checkout' };
    if (parts[0] === 'success') return { name: 'success' };
    return { name: 'list' };
  }

  function route() {
    var r = parse();
    // Ушёл из карточки или формы обратно в список, ничего не оформив
    if (prevRoute && r.name === 'list' && (prevRoute.name === 'event' || prevRoute.name === 'checkout')) {
      var sel = selection;
      track('back_to_list', {
        from: prevRoute.name,
        event_id: prevRoute.name === 'event' ? prevRoute.id : (sel && sel.eventId),
        had_ticket: !!(sel && sel.ticketId && (prevRoute.name === 'checkout' || sel.eventId === prevRoute.id)),
      });
    }
    var shown;
    if (r.name === 'list') shown = renderList(true);
    else if (r.name === 'event') shown = renderEvent(r.id);
    else if (r.name === 'checkout') shown = renderCheckout();
    else shown = renderSuccess();
    // при редиректе (нет события / нет выбора) экран не показан — не считаем его предыдущим
    prevRoute = shown === false ? null : r;
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }

  // ---------- 1. список событий ----------
  function renderList(isPageView) {
    document.title = 'Афиша выходных · Санкт-Петербург';
    var dateF = DATE_FILTERS.find(function (f) { return f.id === filters.date; }) || DATE_FILTERS[0];
    var list = EVENTS.filter(function (e) {
      return dateF.test(e.date) && (filters.category === 'all' || e.category === filters.category);
    });

    var chip = function (group, id, name) {
      return '<button class="chip" type="button" data-filter="' + group + '" data-value="' + id + '" aria-pressed="' + (filters[group] === id) + '">' + esc(name) + '</button>';
    };

    var cards = list.map(function (e, i) {
      return '<a class="card" href="#/event/' + encodeURIComponent(e.id) + '" data-pos="' + (i + 1) + '">' +
        '<div class="card-cover" style="background:' + e.color + '">' +
          '<span class="badge">' + esc(catName(e.category)) + '</span>' +
          '<span class="badge">' + esc(e.age) + '</span>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-title">' + esc(e.title) + '</div>' +
          '<div class="card-meta">' + esc(dateLabel(e.date)) + ', ' + esc(e.time) + '</div>' +
          '<div class="card-meta">' + esc(e.venue) + ' · м. ' + esc(e.metro) + '</div>' +
          '<div class="card-foot"><span class="price"><small>от </small>' + rub(e.priceFrom) + '</span><span class="card-cta">Билеты →</span></div>' +
        '</div></a>';
    }).join('');

    var hasFilters = filters.date !== 'all' || filters.category !== 'all';
    app.innerHTML =
      '<section class="page-head"><h1>Куда сходить в Петербурге</h1>' +
      '<p>Выберите дату и категорию — цены видны сразу.</p></section>' +
      '<section class="filters" aria-label="Фильтры">' +
        '<div><div class="filter-label" id="f-date">Когда</div><div class="chips" role="group" aria-labelledby="f-date">' +
          DATE_FILTERS.map(function (f) { return chip('date', f.id, f.name); }).join('') + '</div></div>' +
        '<div><div class="filter-label" id="f-cat">Что</div><div class="chips" role="group" aria-labelledby="f-cat">' +
          chip('category', 'all', 'Все') + CATEGORIES.map(function (c) { return chip('category', c.id, c.name); }).join('') + '</div></div>' +
      '</section>' +
      '<div class="result-line"><span>' + (list.length ? 'Найдено ' + list.length + ' ' + plural(list.length, 'событие', 'события', 'событий') : '') + '</span>' +
        (hasFilters ? '<button class="link-btn" type="button" data-reset>Сбросить фильтры</button>' : '') + '</div>' +
      (list.length
        ? '<div class="grid">' + cards + '</div>'
        : '<div class="empty"><h2>Ничего не нашлось</h2><p>На эти даты в выбранной категории событий нет.</p>' +
          '<button class="btn btn-secondary" type="button" data-reset>Показать все события</button></div>');

    if (isPageView) {
      track('list_view', { date: filters.date, category: filters.category, results: list.length });
    }
  }

  app.addEventListener('click', function (e) {
    var chipEl = e.target.closest('[data-filter]');
    if (chipEl) {
      var group = chipEl.getAttribute('data-filter');
      var value = chipEl.getAttribute('data-value');
      if (filters[group] === value) return;
      filters[group] = value;
      save('filters', filters);
      renderList(false);
      var count = app.querySelectorAll('.card').length;
      track('filter_used', { filter: group, value: value, results: count });
      return;
    }
    if (e.target.closest('[data-reset]')) {
      filters = { date: 'all', category: 'all' };
      save('filters', filters);
      renderList(false);
      track('filter_used', { filter: 'reset', value: 'all', results: app.querySelectorAll('.card').length });
      return;
    }
    var card = e.target.closest('.card[data-pos]');
    if (card) lastPosition = Number(card.getAttribute('data-pos'));
  });

  // ---------- 2. карточка события + выбор билета ----------
  function renderEvent(id) {
    var ev = byId(id);
    if (!ev) { location.replace('#/'); return false; }
    document.title = ev.title + ' · Афиша выходных';

    // выбор сохраняется только для этого события
    if (!selection || selection.eventId !== ev.id) selection = { eventId: ev.id, ticketId: null, qty: 1 };
    save('selection', selection);

    var ticketsHtml = ev.tickets.map(function (t) {
      var low = t.left <= 20;
      return '<label class="ticket' + (selection.ticketId === t.id ? ' selected' : '') + '">' +
        '<input type="radio" name="ticket" value="' + t.id + '"' + (selection.ticketId === t.id ? ' checked' : '') + '>' +
        '<span class="ticket-name">' + esc(t.name) +
          (low ? '<span class="ticket-left low">Осталось ' + t.left + '</span>' : '<span class="ticket-left">Есть места</span>') + '</span>' +
        '<span class="ticket-price">' + rub(t.price) + '</span></label>';
    }).join('');

    app.innerHTML =
      '<a class="back" href="#/">← Ко всем событиям</a>' +
      '<section class="hero" style="background:' + ev.color + '">' +
        '<span class="badge" style="align-self:flex-start">' + esc(catName(ev.category)) + ' · ' + esc(ev.age) + '</span>' +
        '<h1>' + esc(ev.title) + '</h1>' +
        '<div>' + esc(dateLabel(ev.date)) + ', ' + esc(ev.time) + ' · от ' + rub(ev.priceFrom) + '</div>' +
      '</section>' +
      '<div class="layout">' +
        '<section class="panel"><h2>О событии</h2>' +
          '<dl class="facts">' +
            '<div><dt>Когда</dt><dd>' + esc(dateLabel(ev.date)) + ', ' + esc(ev.time) + '</dd></div>' +
            '<div><dt>Где</dt><dd>' + esc(ev.venue) + '</dd></div>' +
            '<div><dt>Адрес</dt><dd>' + esc(ev.address) + ', м. ' + esc(ev.metro) + '</dd></div>' +
            '<div><dt>Возраст</dt><dd>' + esc(ev.age) + '</dd></div>' +
          '</dl>' +
          '<p class="description">' + esc(ev.description) + '</p>' +
        '</section>' +
        '<section class="panel" id="tickets" aria-labelledby="t-head"><h2 id="t-head">Выберите билет</h2>' +
          '<div class="tickets" role="radiogroup" aria-labelledby="t-head">' + ticketsHtml + '</div>' +
          '<div class="qty-row"><span>Количество</span>' +
            '<div class="stepper"><button type="button" data-qty="-1" aria-label="Меньше">−</button>' +
            '<output id="qty" aria-live="polite">' + selection.qty + '</output>' +
            '<button type="button" data-qty="1" aria-label="Больше">+</button></div></div>' +
          '<p class="hint" id="ticket-hint">Билеты придут на почту сразу после оформления.</p>' +
        '</section>' +
      '</div>' +
      '<div class="buybar"><div class="buybar-inner">' +
        '<div class="buybar-sum"><div class="what" id="bb-what"></div><div class="total" id="bb-total"></div></div>' +
        '<a class="btn" id="to-checkout" href="#/checkout" role="button">Перейти к оформлению</a>' +
      '</div></div>';

    updateBuybar(ev);

    track('event_open', {
      event_id: ev.id,
      category: ev.category,
      price_from: ev.priceFrom,
      position: lastPosition,
      date_filter: filters.date,
    });
    lastPosition = null;

    app.querySelectorAll('input[name="ticket"]').forEach(function (input) {
      input.addEventListener('change', function () {
        var t = ev.tickets.find(function (x) { return x.id === input.value; });
        selection.ticketId = t.id;
        selection.qty = Math.min(selection.qty, maxQty(t));
        save('selection', selection);
        app.querySelectorAll('.ticket').forEach(function (l) { l.classList.toggle('selected', l.contains(input)); });
        updateBuybar(ev);
        track('ticket_select', { event_id: ev.id, category: ev.category, ticket_type: t.id, price: t.price });
      });
    });

    app.querySelectorAll('[data-qty]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = currentTicket(ev);
        var next = selection.qty + Number(b.getAttribute('data-qty'));
        selection.qty = Math.max(1, Math.min(next, t ? maxQty(t) : MAX_QTY));
        save('selection', selection);
        updateBuybar(ev);
      });
    });

    document.getElementById('to-checkout').addEventListener('click', function (e) {
      var t = currentTicket(ev);
      if (!t) {
        e.preventDefault();
        var hint = document.getElementById('ticket-hint');
        hint.textContent = 'Сначала выберите тип билета — от него зависит цена.';
        hint.style.color = 'var(--error)';
        document.getElementById('tickets').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      track('checkout_start', {
        event_id: ev.id, category: ev.category, ticket_type: t.id, qty: selection.qty, total: t.price * selection.qty,
      });
    });
  }

  function currentTicket(ev) {
    return selection && selection.eventId === ev.id ? ev.tickets.find(function (t) { return t.id === selection.ticketId; }) : null;
  }
  function maxQty(t) { return Math.min(MAX_QTY, t.left); }

  function updateBuybar(ev) {
    var t = currentTicket(ev);
    var what = document.getElementById('bb-what');
    var total = document.getElementById('bb-total');
    var btn = document.getElementById('to-checkout');
    var qtyOut = document.getElementById('qty');
    qtyOut.textContent = selection.qty;
    app.querySelector('[data-qty="-1"]').disabled = selection.qty <= 1;
    app.querySelector('[data-qty="1"]').disabled = selection.qty >= (t ? maxQty(t) : MAX_QTY);
    if (t) {
      what.textContent = t.name + ' × ' + selection.qty;
      total.textContent = rub(t.price * selection.qty);
      btn.removeAttribute('aria-disabled');
    } else {
      what.textContent = 'Билет не выбран';
      total.textContent = 'от ' + rub(ev.priceFrom);
      btn.setAttribute('aria-disabled', 'true');
    }
  }

  // ---------- 3. форма оформления ----------
  function renderCheckout() {
    var ev = selection && byId(selection.eventId);
    var t = ev && currentTicket(ev);
    if (!t) { location.replace(ev ? '#/event/' + encodeURIComponent(ev.id) : '#/'); return false; }
    document.title = 'Оформление · Афиша выходных';
    var total = t.price * selection.qty;
    var contact = load('contact', { name: '', email: '' });

    app.innerHTML =
      '<a class="back" href="#/event/' + encodeURIComponent(ev.id) + '">← Назад к выбору билета</a>' +
      '<div class="layout checkout">' +
        // итог заказа стоит первым, чтобы на телефоне выбранный билет и сумма были видны над формой
        '<aside class="panel"><h2>Ваш заказ</h2>' + summaryHtml(ev, t, selection.qty, true) + '</aside>' +
        '<section class="panel"><h1 style="font-size:22px;margin-bottom:14px">Куда отправить билеты</h1>' +
          '<form id="order-form" novalidate>' +
            field('name', 'Имя', 'text', 'name', contact.name, 'Как к вам обращаться') +
            field('email', 'Email', 'email', 'email', contact.email, 'Сюда придут билеты') +
            '<button class="btn btn-block" type="submit">Оформить заказ на ' + rub(total) + '</button>' +
            '<p class="note">Это учебный прототип: оплата не нужна, билеты не настоящие. Данные никуда не отправляются.</p>' +
          '</form></section>' +
      '</div>';

    var form = document.getElementById('order-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = { name: input('name').value.trim(), email: input('email').value.trim() };
      save('contact', data);
      var errors = validate(data);
      ['name', 'email'].forEach(function (k) { showError(k, errors[k]); });
      var keys = Object.keys(errors);
      if (keys.length) {
        track('form_error', { event_id: ev.id, fields: keys.join(','), reasons: keys.map(function (k) { return errors[k].code; }).join(',') });
        input(keys[0]).focus();
        return;
      }
      var order = {
        no: 'SPB-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
        eventId: ev.id, ticketId: t.id, qty: selection.qty, total: total, email: data.email, tracked: false,
      };
      save('order', order);
      location.hash = '#/success';
    });
    // ошибку поля убираем, как только пользователь начал его исправлять
    form.addEventListener('input', function (e) { if (e.target.name) showError(e.target.name, null); });
  }

  function input(id) { return document.getElementById(id); }

  function field(id, label, type, autocomplete, value, help) {
    return '<div class="field" id="f-' + id + '"><label for="' + id + '">' + label + '</label>' +
      '<input id="' + id + '" name="' + id + '" type="' + type + '" autocomplete="' + autocomplete + '" value="' + esc(value) + '" aria-describedby="' + id + '-err ' + id + '-help"' +
      (type === 'email' ? ' inputmode="email" autocapitalize="off" spellcheck="false"' : '') + '>' +
      '<span class="help" id="' + id + '-help">' + help + '</span>' +
      '<span class="err" id="' + id + '-err" role="alert"></span></div>';
  }

  function validate(d) {
    var errors = {};
    if (!d.name) errors.name = { code: 'name_empty', text: 'Введите имя' };
    else if (d.name.length < 2) errors.name = { code: 'name_short', text: 'Имя слишком короткое' };
    if (!d.email) errors.email = { code: 'email_empty', text: 'Введите email — на него придут билеты' };
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.email = { code: 'email_invalid', text: 'Проверьте email: например, name@mail.ru' };
    return errors;
  }

  function showError(k, err) {
    var box = document.getElementById('f-' + k);
    if (!box) return;
    box.classList.toggle('invalid', !!err);
    box.querySelector('input').setAttribute('aria-invalid', err ? 'true' : 'false');
    document.getElementById(k + '-err').textContent = err ? err.text : '';
  }

  function summaryHtml(ev, t, qty, editable) {
    return '<div class="summary">' +
      '<div class="row"><span>Событие</span><strong>' + esc(ev.title) + '</strong></div>' +
      '<div class="row"><span>Когда</span><span>' + esc(dateLabel(ev.date)) + ', ' + esc(ev.time) + '</span></div>' +
      '<div class="row"><span>Где</span><span>' + esc(ev.venue) + '</span></div>' +
      '<div class="row"><span>Билет</span><span>' + esc(t.name) + ' × ' + qty + '</span></div>' +
      (editable ? '<div class="row"><span></span><a href="#/event/' + encodeURIComponent(ev.id) + '">Изменить билет</a></div>' : '') +
      '<div class="row total-row"><span>Итого</span><span>' + rub(t.price * qty) + '</span></div></div>';
  }

  // ---------- 4. успех ----------
  function renderSuccess() {
    var order = load('order', null);
    var ev = order && byId(order.eventId);
    if (!ev) { location.replace('#/'); return false; }
    var t = ev.tickets.find(function (x) { return x.id === order.ticketId; });
    document.title = 'Заказ оформлен · Афиша выходных';

    app.innerHTML =
      '<section class="panel success" style="margin-top:20px">' +
        '<div class="success-icon" aria-hidden="true">✓</div>' +
        '<h1>Билеты оформлены</h1>' +
        '<p>Номер заказа <span class="order-no">' + esc(order.no) + '</span><br>Билеты отправлены на <strong>' + esc(order.email) + '</strong></p>' +
        summaryHtml(ev, t, order.qty, false) +
        '<a class="btn btn-secondary" href="#/">Вернуться к афише</a>' +
      '</section>';

    // цель отправляется один раз на заказ, даже если страницу обновили
    if (!order.tracked) {
      track('order_success', {
        event_id: ev.id, category: ev.category, ticket_type: t.id, qty: order.qty, total: order.total, order_price: order.total,
      });
      order.tracked = true;
      save('order', order);
      selection = null;
      save('selection', null);
    }
  }

  window.addEventListener('hashchange', route);
  route();
})();
