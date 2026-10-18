// Аналитика: загрузка Яндекс.Метрики и отправка целей (reachGoal).
// Все события сайта проходят через track(), поэтому список целей виден в одном месте.
(function () {
  'use strict';

  var raw = (window.APP_CONFIG || {}).METRIKA_ID;
  var id = Number(raw);
  var enabled = Number.isInteger(id) && id > 0;

  // ?debug=1 включает вывод событий в консоль и плашку с журналом событий внизу экрана.
  // Флаг запоминается в sessionStorage, чтобы не терялся при переходах по hash.
  var debug = false;
  try {
    var q = new URLSearchParams(location.search).get('debug');
    if (q === '1') sessionStorage.setItem('afisha_debug', '1');
    if (q === '0') sessionStorage.removeItem('afisha_debug');
    debug = sessionStorage.getItem('afisha_debug') === '1';
  } catch (e) {
    debug = /[?&]debug=1/.test(location.search);
  }

  // Список целей. Идентификаторы совпадают с целями «JavaScript-событие» в Метрике.
  var GOALS = [
    'list_view',      // открыт список событий
    'filter_used',    // применён фильтр даты или категории
    'event_open',     // открыта карточка события
    'ticket_select',  // выбран тип билета
    'checkout_start', // нажата кнопка «Перейти к оформлению»
    'form_error',     // форма не прошла проверку
    'order_success',  // показан экран успешного заказа
    'back_to_list',   // ушёл из карточки обратно в список, ничего не оформив
  ];

  if (enabled) {
    // Стандартный код счётчика Метрики
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) return; }
      k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

    window.ym(id, 'init', {
      clickmap: true,          // карта кликов
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,          // вебвизор; по его записям строится и карта скроллинга
      trackHash: true,         // смена #/... считается просмотром страницы
    });
  }

  var panel = null;
  function logToPanel(text) {
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'debug-panel';
      panel.setAttribute('aria-live', 'polite');
      panel.innerHTML = '<b>debug: события Метрики</b>' + (enabled ? '' : ' <i>(METRIKA_ID не задан — в Метрику не уходит)</i>');
      document.body.appendChild(panel);
    }
    var row = document.createElement('div');
    row.textContent = text;
    panel.appendChild(row);
    while (panel.children.length > 9) panel.removeChild(panel.children[1]);
  }

  function track(goal, params) {
    if (GOALS.indexOf(goal) === -1) console.warn('[analytics] неизвестная цель', goal);
    params = params || {};
    if (enabled && typeof window.ym === 'function') window.ym(id, 'reachGoal', goal, params);
    if (debug) {
      console.log('[analytics] reachGoal', goal, params);
      var time = new Date().toLocaleTimeString('ru-RU');
      logToPanel(time + '  ' + goal + '  ' + JSON.stringify(params));
    }
  }

  window.analytics = { track: track, GOALS: GOALS, enabled: enabled, debug: debug };
})();
