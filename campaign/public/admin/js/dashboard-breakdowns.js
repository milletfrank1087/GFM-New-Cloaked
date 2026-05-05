(function () {
  'use strict';

  function fmtBase(amt) {
    return window.formatBaseCurrency ? window.formatBaseCurrency(amt) : String(amt);
  }

  function toggleCurrencyBreakdown() {
    var panel = document.getElementById('currency-breakdown');
    if (panel) panel.classList.toggle('hidden');
  }

  function renderCurrencyBreakdown(breakdown) {
    var container = document.getElementById('currency-breakdown-content');
    if (!container) return;
    var entries = Object.keys(breakdown || {})
      .map(function (k) { return [k, breakdown[k]]; })
      .sort(function (a, b) { return b[1].raisedBase - a[1].raisedBase; });

    if (entries.length === 0) {
      container.innerHTML = '<p class="text-gfm-gray text-sm">No data</p>';
      return;
    }

    var totalBase = entries.reduce(function (sum, e) { return sum + e[1].raisedBase; }, 0);
    var symbols = window.CURRENCY_SYMBOLS || {};
    var positions = window.CURRENCY_POSITIONS || {};

    container.innerHTML = entries.map(function (entry) {
      var cur = entry[0]; var stats = entry[1];
      var pct = totalBase > 0 ? Math.round((stats.raisedBase / totalBase) * 100) : 0;
      var sym = symbols[cur] || cur;
      var pos = positions[cur] || 'before';
      var raisedNum = parseFloat(stats.raised).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      var fmtOriginal = pos === 'after' ? raisedNum + sym : sym + raisedNum;
      var donationCountText = stats.count + ' donation' + (stats.count !== 1 ? 's' : '');

      return '<div class="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">' +
        '<div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">' + cur + '</div>' +
        '<div class="flex-1 min-w-0">' +
        '<div class="flex items-center gap-2 mb-1">' +
        '<p class="font-bold text-gfm-dark text-lg">' + fmtOriginal + '</p>' +
        '<span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full font-medium">' + cur + '</span>' +
        '</div>' +
        '<p class="text-sm text-gfm-gray">' + donationCountText + ' &bull; \u2248 ' + fmtBase(stats.raisedBase) + ' EUR</p>' +
        '<div class="mt-2 w-full bg-gray-200 rounded-full h-2">' +
        '<div class="bg-blue-500 h-2 rounded-full transition-all" style="width: ' + pct + '%"></div>' +
        '</div></div>' +
        '<div class="text-right flex-shrink-0">' +
        '<p class="text-2xl font-bold text-blue-600">' + pct + '%</p>' +
        '<p class="text-xs text-gfm-gray">of total</p>' +
        '</div></div>';
    }).join('');
  }

  function renderReferralsPlaceholder() {
    var totalDon = document.getElementById('ref-total-donations');
    var totalAmt = document.getElementById('ref-total-amount');
    var uniqueRef = document.getElementById('ref-unique-referrers');
    var tbody = document.getElementById('referral-table');
    if (totalDon) totalDon.textContent = '0';
    if (totalAmt) totalAmt.textContent = fmtBase(0);
    if (uniqueRef) uniqueRef.textContent = '0';
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-3 text-gfm-gray text-center">Referral tracking not configured</td></tr>';
  }

  function renderStoreBreakdown(breakdown, totalNet) {
    var container = document.getElementById('store-breakdown');
    var content = document.getElementById('store-breakdown-content');
    if (!container || !content) return;
    var entries = Object.keys(breakdown || {}).map(function (k) { return [k, breakdown[k]]; });
    if (entries.length === 0) {
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    content.innerHTML = entries
      .sort(function (a, b) { return b[1].net - a[1].net; })
      .map(function (entry) {
        var storeId = entry[0]; var s = entry[1];
        var pct = totalNet > 0 ? Math.round((s.net / totalNet) * 100) : 0;
        var processorBadge = s.processor === 'paypal'
          ? '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">PayPal</span>'
          : '<span class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">Stripe</span>';
        return '<div class="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">' +
          '<div class="w-12 h-12 rounded-full bg-gradient-to-br from-gfm-green to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">' +
          (s.domain || '?').substring(0, 2).toUpperCase() + '</div>' +
          '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center gap-2 mb-1"><p class="font-semibold text-gfm-dark truncate">' + (s.domain || storeId) + '</p>' + processorBadge + '</div>' +
          '<p class="text-sm text-gfm-gray">' + s.count + ' transactions &bull; ' + fmtBase(s.gross) + ' gross &bull; <span class="text-red-400">-' + fmtBase(s.fees) + ' fees</span></p>' +
          '</div>' +
          '<div class="text-right flex-shrink-0">' +
          '<p class="font-bold text-gfm-green text-lg">' + fmtBase(s.net) + '</p>' +
          '<p class="text-xs text-gfm-gray">' + pct + '% of payout</p>' +
          '</div></div>';
      }).join('');
  }

  window.toggleCurrencyBreakdown = toggleCurrencyBreakdown;
  window.renderCurrencyBreakdown = renderCurrencyBreakdown;
  window.renderReferralsPlaceholder = renderReferralsPlaceholder;
  window.renderStoreBreakdown = renderStoreBreakdown;
})();
