/* FX Popover Tooltip & Lineage Engine */
(function() {
  var fxPopover = null;
  var popoverTimer = null;

  function initPopover() {
    if (!fxPopover) {
      fxPopover = document.getElementById('fx-popover-card');
      if (fxPopover) {
        fxPopover.addEventListener('mouseenter', function() { clearTimeout(popoverTimer); });
        fxPopover.addEventListener('mouseleave', hideFx);
      }
    }
    return fxPopover;
  }

  function showFx(anchor) {
    var pop = initPopover();
    if (!pop) return;
    clearTimeout(popoverTimer);
    var type = anchor.dataset.fxType || 'single';
    var html = '';

    if (type === 'aggregate') {
      var title = anchor.dataset.fxTitle || 'Multi-Currency FX Breakdown';
      var items = [];
      try { items = JSON.parse(anchor.dataset.breakdown || '[]'); } catch (e) { items = []; }

      html = '<div class="font-bold text-white mb-2 flex items-center justify-between">' +
        '<span>' + esc(title) + '</span>' +
        '<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">ECB Daily</span>' +
      '</div>' +
      '<div class="space-y-1.5 pt-1 border-t border-slate-700/60">';

      if (items.length) {
        html += items.map(function(item) {
          return '<div class="flex items-center justify-between text-xs font-mono">' +
            '<span class="text-slate-300">' + esc(item.currency) + ': <b class="text-white">' + esc(item.native) + '</b></span>' +
            '<span class="text-emerald-400 font-semibold">→ ' + esc(item.base) + '</span>' +
          '</div>';
        }).join('');
      } else {
        html += '<div class="text-xs text-slate-400">Single currency transactions</div>';
      }

      html += '</div>' +
        '<div class="mt-2.5 text-[11px] text-slate-400 border-t border-slate-700/60 pt-1.5">' +
          'Converted using European Central Bank rates at transaction dates' +
        '</div>';

    } else if (type === 'spend') {
      var spendNative = anchor.dataset.spendNative || '$0.00 USD';
      var spendBase = anchor.dataset.spendBase || '€0.00';
      var rate = Number(anchor.dataset.spendRate || 1);
      var source = anchor.dataset.spendSource || 'Frankfurter ECB';

      html = '<div class="font-bold text-white mb-2 flex items-center justify-between">' +
        '<span>Meta Ad Spend FX Conversion</span>' +
        '<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-900/70 text-indigo-200 border border-indigo-700/60">Meta Ads</span>' +
      '</div>' +
      '<div class="text-emerald-300 font-mono text-xs font-semibold mb-1.5">' + esc(spendNative) + ' → ' + esc(spendBase) + '</div>' +
      '<div class="text-xs text-slate-300 space-y-0.5">' +
        '<div>Rate: <b>1 EUR = ' + rate.toFixed(4) + ' USD</b></div>' +
        '<div class="text-[11px] text-slate-400">(1 USD = ' + (rate > 0 ? (1 / rate).toFixed(4) : '0') + ' EUR)</div>' +
      '</div>' +
      '<div class="mt-2 text-[11px] text-slate-400 border-t border-slate-700/60 pt-1.5">' +
        'Provider: ' + esc(source) +
      '</div>';

    } else if (type === 'hero') {
      var grossNativeList = anchor.dataset.heroGrossList || '';
      var spendNativeVal = anchor.dataset.heroSpendNative || '$0.00 USD';

      html = '<div class="font-bold text-white mb-2 flex items-center justify-between">' +
        '<span>True Net Profit FX Portfolio</span>' +
        '<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/60">Normalized EUR</span>' +
      '</div>' +
      '<div class="text-xs text-slate-300 space-y-1">' +
        '<div>Gross Revenues: <b class="text-white">' + esc(grossNativeList) + '</b></div>' +
        '<div>Meta Ad Spend: <b class="text-indigo-300">' + esc(spendNativeVal) + '</b></div>' +
      '</div>' +
      '<div class="mt-2 text-[11px] text-slate-400 border-t border-slate-700/60 pt-1.5">' +
        'All cross-border revenues and ad spends normalized to base EUR via ECB rates' +
      '</div>';

    } else {
      var original = anchor.dataset.original || '';
      var base = anchor.dataset.base || '';
      var currency = anchor.dataset.currency || '';
      var singleRate = Number(anchor.dataset.rate || 0);
      var rateDate = anchor.dataset.rateDate || 'latest';
      var singleSource = anchor.dataset.source || 'ECB';

      var rateLine = rateDate === 'multiple dates'
        ? 'Historical daily rates applied per payment'
        : '1 EUR = ' + singleRate.toFixed(4) + ' ' + esc(currency) + (singleRate > 0 ? ' (1 ' + esc(currency) + ' = ' + (1 / singleRate).toFixed(4) + ' EUR)' : '');

      html = '<div class="font-bold text-white mb-2 flex items-center justify-between">' +
        '<span>FX Payment Provenance</span>' +
        '<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">' + esc(currency) + ' → EUR</span>' +
      '</div>' +
      '<div class="text-emerald-300 font-mono text-xs font-semibold mb-1.5">' + esc(original) + ' → ' + esc(base) + '</div>' +
      '<div class="text-xs text-slate-200">' + rateLine + '</div>' +
      '<div class="mt-2 text-[11px] text-slate-400 border-t border-slate-700/60 pt-1.5">' +
        'Date: ' + esc(rateDate) + ' · Provider: ' + esc(singleSource) +
      '</div>';
    }

    pop.innerHTML = html;

    var rect = anchor.getBoundingClientRect();
    var left = Math.min(Math.max(12, rect.left - 100), window.innerWidth - 320);
    var top = rect.bottom + 8;
    if (top + 180 > window.innerHeight) top = Math.max(12, rect.top - 190);

    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.classList.add('open');
  }

  function hideFx() {
    popoverTimer = setTimeout(function() {
      if (fxPopover) fxPopover.classList.remove('open');
    }, 150);
  }

  function fxMarkup(original, base, currency, fx) {
    if (!fx || !currency || currency === (window.__profitBaseCurrency || 'EUR')) return '';
    return '<span class="fx-info-trigger" onmouseenter="showFx(this)" onmouseleave="hideFx()" onfocus="showFx(this)" onblur="hideFx()" onclick="showFx(this); event.stopPropagation()" data-fx-type="single" data-original="' + esc(original) + '" data-base="' + esc(base) + '" data-currency="' + esc(currency) + '" data-rate="' + Number(fx.rate || 0) + '" data-rate-date="' + esc(fx.rateDate || '') + '" data-source="' + esc(fx.source || '') + '">ⓘ</span>';
  }

  function fxMarkupAggregate(title, items) {
    if (!items || !items.length) return '';
    return '<span class="fx-info-trigger" onmouseenter="showFx(this)" onmouseleave="hideFx()" onfocus="showFx(this)" onblur="hideFx()" onclick="showFx(this); event.stopPropagation()" data-fx-type="aggregate" data-fx-title="' + esc(title) + '" data-breakdown=\'' + JSON.stringify(items).replace(/'/g, '&#39;') + '\'>ⓘ</span>';
  }

  function fxMarkupSpend(nativeSpend, baseSpend, fx) {
    if (!nativeSpend) return '';
    var rate = fx && fx.nativePerBase ? Number(fx.nativePerBase) : (fx && fx.basePerNative ? 1 / Number(fx.basePerNative) : 1.15);
    var source = (fx && fx.source) ? fx.source : 'Frankfurter ECB Latest';
    return '<span class="fx-info-trigger" onmouseenter="showFx(this)" onmouseleave="hideFx()" onfocus="showFx(this)" onblur="hideFx()" onclick="showFx(this); event.stopPropagation()" data-fx-type="spend" data-spend-native="' + esc(fmtNative(nativeSpend, 'USD')) + '" data-spend-base="' + esc(fmt(baseSpend)) + '" data-spend-rate="' + rate + '" data-spend-source="' + esc(source) + '">ⓘ</span>';
  }

  function fxMarkupHero(data) {
    var cb = data.currencyBreakdown || {};
    var curKeys = Object.keys(cb);
    var grossStr = curKeys.map(function(c) { return fmtNative(cb[c].nativeGross, c); }).join(' + ');
    var spendStr = fmtNative(data.totals?.spendNative, data.totals?.spendCurrency || 'USD');
    return '<span class="fx-info-trigger" onmouseenter="showFx(this)" onmouseleave="hideFx()" onfocus="showFx(this)" onblur="hideFx()" onclick="showFx(this); event.stopPropagation()" data-fx-type="hero" data-hero-gross-list="' + esc(grossStr) + '" data-hero-spend-native="' + esc(spendStr) + '">ⓘ</span>';
  }

  window.showFx = showFx;
  window.hideFx = hideFx;
  window.fxMarkup = fxMarkup;
  window.fxMarkupAggregate = fxMarkupAggregate;
  window.fxMarkupSpend = fxMarkupSpend;
  window.fxMarkupHero = fxMarkupHero;
})();
