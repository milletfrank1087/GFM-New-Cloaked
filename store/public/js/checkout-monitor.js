// Checkout monitor: reports (1) browser-side errors the server never sees and (2) the furthest step
// reached when a checkout ends without paying. Sent to /api/client/report; the server prints each
// new error type once and rolls everything else into the hourly log summary.
(function () {
  var ENDPOINT = '/api/client/report';
  var ORDER = ['page_loaded', 'form_loading', 'form_ready', 'email', 'card_typing', 'card_complete', 'pay_tapped', 'declined', 'paid'];
  var furthest = 'page_loaded';
  var paid = false;
  var sentExit = false;
  var sentErrors = {};
  var errorCount = 0;
  var startedAt = Date.now();

  function send(payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
    } catch (_) {}
    try { fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }); } catch (_) {}
  }

  function stage(name) {
    if (name === 'paid') { paid = true; furthest = 'paid'; return; }
    if (ORDER.indexOf(name) > ORDER.indexOf(furthest)) furthest = name;
  }

  // kind: js | promise | stripe_load | stripe_submit | stripe_confirm | create_payment | confirm_payment | validation
  function error(kind, message, extra) {
    var msg = String(message || '').slice(0, 300);
    if (!msg) return;
    // Noise from extensions, cross-origin scripts and browser quirks.
    if (/^Script error\.?$|ResizeObserver loop|chrome-extension:|moz-extension:|safari-extension:|webkit-masked-url/i.test(msg + ' ' + (extra && extra.src || ''))) return;
    var key = kind + '|' + msg;
    if (sentErrors[key] || errorCount >= 15) return; // once per page, max 15 per page
    sentErrors[key] = 1;
    errorCount += 1;
    send({ t: 'error', kind: kind, msg: msg, src: extra && extra.src ? String(extra.src).slice(0, 200) : '', line: extra && extra.line || 0,
      code: extra && extra.code ? String(extra.code).slice(0, 60) : '', stage: furthest, secs: Math.round((Date.now() - startedAt) / 1000) });
  }

  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window && (e.target.src || e.target.href)) {
      error('resource', 'failed to load ' + (e.target.tagName || '').toLowerCase(), { src: e.target.src || e.target.href });
      return;
    }
    error('js', e.message, { src: e.filename, line: e.lineno });
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    error('promise', r && r.message ? r.message : String(r), { src: r && r.stack ? String(r.stack).split('\n')[1] : '' });
  });

  // Phones often skip pagehide when an app is swiped away, so "hidden" counts as leaving too.
  // Reported once per page; someone who comes back and pays later is still counted at the step they left.
  function reportExit() {
    if (paid || sentExit) return;
    sentExit = true;
    send({ t: 'exit', stage: furthest, secs: Math.round((Date.now() - startedAt) / 1000) });
  }
  window.addEventListener('pagehide', reportExit);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && furthest !== 'pay_tapped') reportExit(); // 3-D Secure / wallet sheets can hide the page mid-payment
  });

  window.CheckoutMonitor = { stage: stage, error: error };
})();
