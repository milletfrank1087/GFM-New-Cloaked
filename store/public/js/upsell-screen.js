// Thank-you screen with a one-tap monthly gift offer, shown on the checkout after a successful
// one-time donation (public/js/checkout.js calls window.showSuccessScreen(confirmData)).
// The offer comes from /api/confirm-payment (confirmData.upsell); without it we just redirect.
// On acceptance the same card morphs into the success state (no second screen).
(function () {
  if (typeof window.showSuccessScreen === 'function') return; // template provides its own

  var cfgEl = document.getElementById('upsell-config');
  var cfg = {};
  try { cfg = JSON.parse(cfgEl ? cfgEl.textContent : '{}'); } catch (_) {}
  var t = cfg.strings || {};
  var lang = cfg.lang || document.documentElement.lang || 'en';
  var beneficiary = cfg.beneficiary || '';

  var CSS = [
    '.us-collapse{display:grid;grid-template-rows:1fr;opacity:1;transition:grid-template-rows .55s cubic-bezier(.2,.8,.2,1),opacity .35s ease}',
    '.us-collapse>.us-inner{overflow:hidden;min-height:0}',
    '.us-collapse.is-closed{grid-template-rows:0fr;opacity:0}',
    '.us-fade{transition:opacity .25s ease,transform .25s ease}',
    '.us-fade.is-out{opacity:0;transform:translateY(4px)}',
    '.us-heart{transition:background-color .45s ease,box-shadow .45s ease}',
    '.us-heart svg{transition:color .45s ease}',
    '.us-heart.is-done{background:#059669;box-shadow:0 0 0 8px rgba(5,150,105,.12);animation:us-pop .6s cubic-bezier(.3,1.6,.5,1)}',
    '.us-heart.is-done svg{color:#fff}',
    '.us-heart.is-beat{animation:us-beat 1.6s ease-in-out 2}',
    '@keyframes us-pop{0%{transform:scale(1)}40%{transform:scale(1.28)}100%{transform:scale(1)}}',
    '@keyframes us-beat{0%,100%{transform:scale(1)}15%{transform:scale(1.12)}30%{transform:scale(1)}45%{transform:scale(1.08)}}',
    '.us-float{position:absolute;left:50%;top:28px;color:#10b981;opacity:0;pointer-events:none;animation:us-rise 1.8s ease-out forwards}',
    '@keyframes us-rise{0%{opacity:0;transform:translate(var(--x),0) scale(.6)}15%{opacity:.9}100%{opacity:0;transform:translate(calc(var(--x) * 2.2),-120px) scale(1.1)}}',
    '.us-chip{transition:border-color .15s,background-color .15s,transform .1s}',
    '.us-chip:active{transform:scale(.97)}',
    '.us-chip[aria-checked="true"]{border-color:#059669;background:#ecfdf5}',
    '.us-chip[aria-checked="true"] .us-chip-amt{color:#047857}',
    '@media (prefers-reduced-motion:reduce){.us-collapse,.us-fade,.us-heart,.us-heart svg{transition:none}.us-heart.is-done,.us-heart.is-beat{animation:none}.us-float{display:none}}'
  ].join('');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fill(str, vars) {
    return String(str || '').replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ''; });
  }
  function money(amount, currency, forceCents) {
    var whole = !forceCents && Math.round(amount) === amount;
    try {
      return new Intl.NumberFormat(lang, { style: 'currency', currency: currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
    } catch (_) { return amount + ' ' + currency; }
  }
  function perDay(monthly) { return monthly * 12 / 365; }
  function dateStr(iso) {
    try { return new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'long' }); } catch (_) { return iso.slice(0, 10); }
  }

  var state = { offer: null, redirectUrl: '/', amount: 0, busy: false, shownAt: 0, decided: false };

  // Offer-screen analytics (store logs only): shown / other_open / accept_click / declined / closed / left_page.
  function track(type) {
    var body = JSON.stringify({ type: type, amount: state.amount, secs: state.shownAt ? (Date.now() - state.shownAt) / 1000 : 0 });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/upsell/event', new Blob([body], { type: 'application/json' }))) return;
    } catch (_) {}
    try { fetch('/api/upsell/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }); } catch (_) {}
  }
  var HEART = '<svg class="h-7 w-7 text-emerald-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  function $(id) { return document.getElementById(id); }
  function card() { return $('checkout-card') || document.querySelector('.checkout-card'); }
  function goBack() { window.location.href = state.redirectUrl || '/'; }
  function leave(type) { state.decided = true; track(type); goBack(); }
  function vars(extra) {
    var o = state.offer;
    var base = {
      name: beneficiary,
      donor: o.donorFirstName ? ', ' + o.donorFirstName : '',
      amount: money(state.amount, o.currency),
      perDay: money(perDay(state.amount), o.currency, true),
      yearly: money(state.amount * 12, o.currency),
      date: dateStr(o.firstCharge),
      oneTime: money(o.donation, o.currency)
    };
    for (var k in extra) base[k] = extra[k];
    return base;
  }

  // Which impact line applies: chips map 1:1, custom amounts fall into the nearest band.
  function tierIndex() {
    var a = state.offer.amounts;
    if (state.amount < (a[0] + (a[1] || a[0])) / 2) return 0;
    if (a.length < 3 || state.amount < (a[1] + a[2]) / 2) return 1;
    return 2;
  }

  function chipHtml(a, i) {
    var cur = state.offer.currency;
    var suggested = i === 1;
    return '<button type="button" role="radio" aria-checked="' + (a === state.amount) + '" data-amt="' + a + '" ' +
      'class="us-chip flex min-h-[92px] flex-col items-center justify-center rounded-2xl border-2 border-gray-200 bg-white px-1 py-2 text-center">' +
      '<span class="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ' + (suggested ? 'bg-emerald-600 text-white' : 'invisible') + '">' + esc(t.suggested) + '</span>' +
      '<span class="us-chip-amt text-lg font-extrabold leading-none text-gray-900">' + esc(money(a, cur)) + '</span>' +
      '<span class="mt-0.5 text-[11px] font-medium text-gray-400">' + esc(t.perMonth) + '</span>' +
      '<span class="mt-1 text-[11px] font-semibold text-emerald-700">' + esc(fill(t.perDayChip, { perDay: money(perDay(a), cur, true) })) + '</span>' +
    '</button>';
  }

  function updateCopy() {
    var v = vars();
    $('us-impact-text').textContent = fill(t.tiers && t.tiers[tierIndex()] || t.impact, v);
    $('us-impact-foot').textContent = fill(t.impactFooter, v);
    $('us-cta-label').textContent = fill(t.cta, v);
    $('us-terms').textContent = fill(t.terms, v);
    document.querySelectorAll('.us-chip').forEach(function (b) {
      b.setAttribute('aria-checked', String(Number(b.dataset.amt) === state.amount));
    });
    $('us-accept').disabled = !(state.amount >= 1);
  }

  function renderOffer() {
    var o = state.offer;
    state.amount = o.amounts[Math.min(1, o.amounts.length - 1)];
    var v = vars();
    var c = card();
    if (!$('us-style')) {
      var st = document.createElement('style');
      st.id = 'us-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    c.innerHTML =
      '<div class="upsell-screen relative px-5 pb-6 pt-7 sm:px-7">' +
        '<button type="button" id="us-close" aria-label="' + esc(t.close) + '" class="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600">' +
          '<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>' +
        // Hero: stays in place and morphs on success
        '<div class="relative text-center" id="us-hero">' +
          '<div id="us-heart" class="us-heart is-beat mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">' + HEART + '</div>' +
          '<h2 id="us-title" class="us-fade text-[22px] font-extrabold leading-tight text-gray-900">' + esc(fill(t.thanksTitle, v)) + '</h2>' +
          '<p id="us-body" class="us-fade mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-gray-600">' + esc(fill(t.thanksBody, vars({ amount: v.oneTime })))  /* the one-time gift, never the monthly suggestion */ + '</p>' +
          '<div id="us-receipt" class="us-fade mx-auto mt-4 flex max-w-sm items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left">' +
            '<span class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600"><svg class="h-4 w-4 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></span>' +
            '<span class="flex-1"><span class="block text-sm font-bold text-emerald-900">' + esc(t.completed) + ' · ' + esc(v.oneTime) + '</span>' +
            '<span class="block text-xs text-emerald-800/80">' + esc(t.receipt) + '</span></span>' +
          '</div>' +
        '</div>' +

        // Offer: collapses away on success
        '<div id="us-offer" class="us-collapse"><div class="us-inner">' +
          '<div class="mt-6 rounded-3xl border border-emerald-100 bg-gradient-to-b from-emerald-50/70 to-white p-4 sm:p-5">' +
            '<p class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">' + esc(t.offerKicker) +
              '<span class="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-gray-500">' + esc(t.optional) + '</span></p>' +
            '<h3 class="mt-1 text-lg font-extrabold leading-snug text-gray-900">' + esc(fill(t.offerTitle, v)) + '</h3>' +
            '<p class="mt-1.5 text-sm leading-relaxed text-gray-600">' + esc(fill(t.whyMonthly, v)) + '</p>' +
            '<div class="mt-4 grid grid-cols-3 gap-2" role="radiogroup">' + o.amounts.map(chipHtml).join('') + '</div>' +
            '<button type="button" id="us-other-toggle" class="mt-2 min-h-[44px] w-full text-sm font-semibold text-emerald-700">' + esc(t.other) + ' ›</button>' +
            '<div id="us-other" class="hidden">' +
              '<input id="us-other-input" type="number" inputmode="decimal" min="1" step="1" placeholder="' + esc(t.other) + '" class="w-full rounded-2xl border-2 border-gray-200 bg-white px-4 py-3.5 text-base font-semibold focus:border-emerald-600 focus:outline-none">' +
            '</div>' +
            '<div class="mt-3 flex gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-emerald-100">' +
              '<div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">' +
                '<svg class="h-5 w-5 text-emerald-700" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m6-6H6"/></svg>' +
              '</div>' +
              '<div><p id="us-impact-text" class="text-sm font-semibold leading-snug text-gray-900"></p>' +
              '<p id="us-impact-foot" class="mt-0.5 text-xs text-gray-500"></p></div>' +
            '</div>' +
            '<p class="mt-4 flex items-start gap-2 text-xs leading-snug text-gray-600">' +
              '<svg class="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
              '<span>' + esc(t.notActive) + '</span></p>' +
            '<button type="button" id="us-accept" class="mt-3 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-base font-bold text-white shadow-lg shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-50">' +
              '<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
              '<span id="us-cta-label"></span></button>' +
            '<p id="us-terms" class="mt-2.5 text-center text-xs leading-relaxed text-gray-500"></p>' +
            '<p id="us-error" class="mt-3 hidden rounded-xl bg-red-50 px-3 py-2 text-center text-sm text-red-700"></p>' +
          '</div>' +
          '<button type="button" id="us-decline" class="mt-3 min-h-[52px] w-full rounded-2xl border-2 border-gray-200 bg-white text-[15px] font-semibold text-gray-700 active:scale-[0.98]">' + esc(t.decline) + '</button>' +
        '</div></div>' +

        // Success details: expand in on success
        '<div id="us-success" class="us-collapse is-closed"><div class="us-inner">' +
          '<div class="mt-5 rounded-2xl bg-gray-50 p-4 text-sm">' +
            '<div class="flex items-center justify-between py-1"><span class="text-gray-500">' + esc(t.todayLabel) + '</span><span id="us-sum-today" class="font-bold text-gray-900"></span></div>' +
            '<div class="my-1 h-px bg-gray-200"></div>' +
            '<div class="flex items-center justify-between py-1"><span class="text-gray-500">' + esc(t.monthlyLabel) + '</span><span id="us-sum-monthly" class="font-bold text-emerald-700"></span></div>' +
          '</div>' +
          '<p id="us-note" class="mt-4 text-center text-sm italic text-gray-500"></p>' +
          '<button type="button" id="us-back" class="mt-5 min-h-[56px] w-full rounded-2xl bg-gray-900 px-4 text-base font-bold text-white active:scale-[0.98]">' + esc(t.back) + '</button>' +
        '</div></div>' +
      '</div>';

    document.querySelectorAll('.us-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        state.amount = Number(b.dataset.amt);
        $('us-other-input').value = '';
        updateCopy();
      });
    });
    $('us-close').addEventListener('click', function () { leave('closed'); });
    $('us-other-toggle').addEventListener('click', function () {
      track('other_open');
      $('us-other').classList.remove('hidden');
      this.classList.add('hidden');
      $('us-other-input').focus();
    });
    $('us-other-input').addEventListener('input', function () {
      var val = Math.round(Number(this.value) * 100) / 100;
      state.amount = val >= 1 ? val : 0;
      updateCopy();
    });
    $('us-accept').addEventListener('click', accept);
    $('us-decline').addEventListener('click', function () { leave('declined'); });
    $('us-back').addEventListener('click', goBack);
    window.addEventListener('pagehide', function () { if (!state.decided) { state.decided = true; track('left_page'); } });
    state.shownAt = Date.now();
    track('shown');
    updateCopy();
    c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function accept() {
    if (state.busy || !(state.amount >= 1)) return;
    state.busy = true;
    state.decided = true;
    track('accept_click');
    $('us-error').classList.add('hidden');
    $('us-accept').disabled = true;
    $('us-cta-label').textContent = t.processing || '…';

    fetch('/api/upsell/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyAmount: state.amount })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.success) throw new Error(res.d && res.d.error);
        morphToSuccess(res.d);
      })
      .catch(function () {
        state.busy = false;
        $('us-error').textContent = t.error;
        $('us-error').classList.remove('hidden');
        updateCopy();
      });
  }

  // Same card, in place: offer collapses, heart fills and pops, copy crossfades, summary expands.
  function morphToSuccess(d) {
    state.amount = d.monthly;
    state.offer.firstCharge = d.firstCharge;
    var v = vars();

    $('us-close').onclick = null;
    $('us-offer').classList.add('is-closed');
    ['us-title', 'us-body', 'us-receipt'].forEach(function (id) { $(id).classList.add('is-out'); });

    setTimeout(function () {
      var heart = $('us-heart');
      heart.classList.remove('is-beat');
      heart.classList.add('is-done');
      floatHearts();

      $('us-title').textContent = fill(t.successTitle, v);
      $('us-body').textContent = fill(t.successBody, v);
      $('us-receipt').style.display = 'none';
      $('us-sum-today').textContent = v.oneTime + ' ✓';
      $('us-sum-monthly').textContent = v.amount + ' · ' + v.date;
      $('us-note').textContent = fill(t.successNote, v);
      ['us-title', 'us-body'].forEach(function (id) { $(id).classList.remove('is-out'); });
      $('us-success').classList.remove('is-closed');
      card().scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 320);
  }

  function floatHearts() {
    var hero = $('us-hero');
    [-34, -18, -6, 8, 20, 36].forEach(function (x, i) {
      var s = document.createElement('span');
      s.className = 'us-float';
      s.style.setProperty('--x', x + 'px');
      s.style.animationDelay = (i * 90) + 'ms';
      s.innerHTML = '<svg width="' + (10 + (i % 3) * 3) + '" height="' + (10 + (i % 3) * 3) + '" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
      hero.appendChild(s);
      setTimeout(function () { s.remove(); }, 2400);
    });
  }

  window.showSuccessScreen = function (confirmData) {
    state.redirectUrl = (confirmData && confirmData.redirectUrl) || '/';
    state.offer = confirmData && confirmData.upsell;
    if (!state.offer || !card() || !state.offer.amounts || !state.offer.amounts.length) {
      goBack();
      return;
    }
    document.querySelectorAll('[data-hide-on-success]').forEach(function (el) { el.style.display = 'none'; });
    renderOffer();
  };
})();
