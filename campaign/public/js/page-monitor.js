// Campaign page monitor: reports browser errors the server never sees (broken scripts, failed resources,
// a Donate tap that errors) to /api/client/error. The server prints each new error type once and counts the rest
// in the hourly summary. Load before every other script so their errors are caught.
(function () {
  var ENDPOINT = '/api/client/error';
  var startedAt = Date.now();
  var sent = {};
  var count = 0;

  function send(payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
    } catch (_) {}
    try { fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true }); } catch (_) {}
  }

  // kind: js | promise | resource | init_donation | ...
  function error(kind, message, extra) {
    var msg = String(message || '').slice(0, 300);
    if (!msg) return;
    // Noise from extensions, cross-origin scripts, in-app browser bridges and browser quirks.
    if (/^Script error\.?$|ResizeObserver loop|chrome-extension:|moz-extension:|safari-extension:|webkit-masked-url/i.test(msg + ' ' + (extra && extra.src || ''))) return;
    var key = kind + '|' + msg;
    if (sent[key] || count >= 10) return; // once per page, max 10 per page
    sent[key] = 1;
    count += 1;
    send({ kind: kind, msg: msg, src: extra && extra.src ? String(extra.src).slice(0, 200) : '', line: extra && extra.line || 0,
      code: extra && extra.code != null ? String(extra.code).slice(0, 60) : '', ms: extra && extra.ms || null,
      secs: Math.round((Date.now() - startedAt) / 1000) });
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

  window.PageMonitor = { error: error };
})();
