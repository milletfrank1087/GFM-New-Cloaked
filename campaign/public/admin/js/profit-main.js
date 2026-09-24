/* Profit Cockpit Main Controller & Data Orchestrator */
(function() {
  window.__profitBaseCurrency = 'EUR';
  window.currentRange = 'today';
  window.activeCampaignsData = [];
  window.allTransactionsData = [];
  window.campaignFilterMode = 'active';
  window.userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  window.latestAdFx = null;

  function fmt(v) {
    return '€' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtNative(v, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR' }).format(parseFloat(v || 0));
    } catch {
      return parseFloat(v || 0).toFixed(2) + ' ' + (currency || '');
    }
  }

  function fmtSigned(v) {
    var x = parseFloat(v || 0);
    return (x < 0 ? '−' : '') + fmt(Math.abs(x));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setHtml(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function copyToClipboard(text, pillEl) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(function() {
      if (pillEl) {
        var original = pillEl.innerHTML;
        pillEl.innerHTML = '<span class="text-[#00875a] font-bold text-xs">Copied!</span>';
        setTimeout(function() { pillEl.innerHTML = original; }, 1500);
      }
    });
  }

  // All ranges are Europe/Athens calendar days, whatever the viewer's browser timezone.
  // fb-ads-manager buckets Meta spend into the same Athens days (lib/adInsights.js).
  var REPORT_TZ = 'Europe/Athens';

  function athensOffsetMinutes(ms) {
    var name = new Intl.DateTimeFormat('en-US', { timeZone: REPORT_TZ, timeZoneName: 'longOffset' })
      .formatToParts(new Date(ms)).find(function(p) { return p.type === 'timeZoneName'; });
    var m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name ? name.value : '');
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
  }

  function athensYmd(ms) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  }

  function shiftYmd(ymd, days) {
    return new Date(Date.parse(ymd + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  }

  // UTC instant of 00:00 Athens time on that date.
  function athensMidnight(ymd) {
    var utcMidnight = Date.parse(ymd + 'T00:00:00Z');
    return new Date(utcMidnight - athensOffsetMinutes(utcMidnight - 3 * 3600000) * 60000);
  }

  function getDateRanges() {
    var now = new Date();
    var today = athensYmd(now.getTime());
    var monthStart = today.slice(0, 8) + '01';
    var lastMonthStart = shiftYmd(monthStart, -1).slice(0, 8) + '01';
    var start = function(ymd) { return athensMidnight(ymd).toISOString(); };
    var endOf = function(ymd) { return new Date(athensMidnight(shiftYmd(ymd, 1)).getTime() - 1).toISOString(); };
    return {
      today: { startDate: start(today), endDate: now.toISOString() },
      yesterday: { startDate: start(shiftYmd(today, -1)), endDate: endOf(shiftYmd(today, -1)) },
      last7days: { startDate: start(shiftYmd(today, -6)), endDate: now.toISOString() },
      last30days: { startDate: start(shiftYmd(today, -29)), endDate: now.toISOString() },
      thisMonth: { startDate: start(monthStart), endDate: now.toISOString() },
      lastMonth: { startDate: start(lastMonthStart), endDate: endOf(shiftYmd(monthStart, -1)) },
      thisYear: { startDate: start(today.slice(0, 4) + '-01-01'), endDate: now.toISOString() }
    };
  }

  function selectRange(rangeKey) {
    window.currentRange = rangeKey;
    document.querySelectorAll('#range-pills .stripe-pill').forEach(function(btn) {
      var isSelected = btn.dataset.range === rangeKey;
      btn.classList.toggle('active', isSelected);
      btn.classList.toggle('inactive', !isSelected);
    });
    loadProfit();
  }

  function currentQuery() {
    var params = new URLSearchParams();
    var campaign = document.getElementById('filter-campaign')?.value;
    if (campaign && campaign !== 'all') params.set('campaign', campaign);
    params.set('range', window.currentRange);
    params.set('tzOffset', -athensOffsetMinutes(Date.now())); // getTimezoneOffset() sign convention
    var ranges = getDateRanges();
    var r = ranges[window.currentRange];
    if (window.currentRange !== 'allTime' && r) {
      params.set('startDate', r.startDate);
      params.set('endDate', r.endDate);
    }
    return params.toString();
  }

  /* Data Fetcher */
  async function loadProfit() {
    var requestId = ++loadProfit.requestId;
    if (loadProfit.controller) loadProfit.controller.abort();
    loadProfit.controller = new AbortController();

    var errorBox = document.getElementById('profit-error');
    if (errorBox) errorBox.classList.add('hidden');

    try {
      var res = await fetch('/api/admin/profit?' + currentQuery(), { signal: loadProfit.controller.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (requestId !== loadProfit.requestId) return;

      window.activeCampaignsData = data.perCampaign || [];
      window.allTransactionsData = data.transactions || data.recent || [];

      renderWaterfallAndHero(data);
      renderTimelineChart(data.daily || [], data.timelineType === 'hourly');
      renderCampaignFilter(data.perCampaign);
      updateCampaignBadges(data.perCampaign);
      renderCampaignTableRows();
      renderStoreBreakdown(data.perStore);
      renderCurrencyBreakdown(data.currencyBreakdown);
      renderTransactionsFeed();

      var quality = document.getElementById('profit-quality');
      if (quality) {
        quality.classList.toggle('hidden', !data.dataQuality?.paymentsTruncated);
        setText('profit-quality-text', data.dataQuality?.paymentsTruncated
          ? 'Volume exceeds ' + Number(data.dataQuality.maxPayments || 5000).toLocaleString() + ' records. Narrow date range for exact totals.'
          : '');
      }

      scheduleRefreshPoll(data);
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (requestId !== loadProfit.requestId) return;
      console.error('Profit fetch error:', e);
      if (errorBox) {
        setText('profit-error-text', 'Could not load profit intelligence (' + (e.message || 'network timeout') + ').');
        errorBox.classList.remove('hidden');
      }
    }
  }
  loadProfit.requestId = 0;
  loadProfit.controller = null;

  var refreshPoll = null;
  function scheduleRefreshPoll(data) {
    if (refreshPoll) clearTimeout(refreshPoll);
    if (!data.adSync?.refreshing) return;
    refreshPoll = setTimeout(loadProfit, 2500);
  }

  var __refreshDepth = 0;
  function setRefreshLoading(loading) {
    var btn = document.getElementById('refresh-btn');
    var icon = document.getElementById('refresh-icon');
    var label = document.getElementById('refresh-label');
    var mobBtn = document.getElementById('mobile-refresh-btn');
    var mobIcon = document.getElementById('mobile-refresh-icon');

    if (btn) btn.disabled = loading;
    if (mobBtn) mobBtn.disabled = loading;
    if (icon) icon.classList.toggle('animate-spin', loading);
    if (mobIcon) mobIcon.classList.toggle('animate-spin', loading);
    if (label) label.textContent = loading ? 'Refreshing…' : 'Refresh';
  }

  async function refreshProfit() {
    __refreshDepth++;
    setRefreshLoading(true);
    try {
      await loadProfit();
    } finally {
      __refreshDepth--;
      if (__refreshDepth <= 0) {
        __refreshDepth = 0;
        setRefreshLoading(false);
      }
    }
  }

  /* Auto Polling on Visibility Change */
  var profitPollTimer = null;
  function startProfitPolling() {
    if (profitPollTimer) clearInterval(profitPollTimer);
    profitPollTimer = setInterval(function() {
      if (document.visibilityState === 'visible') loadProfit();
    }, 60000);
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      loadProfit();
      startProfitPolling();
    } else if (profitPollTimer) {
      clearInterval(profitPollTimer);
      profitPollTimer = null;
    }
  });

  window.fmt = fmt;
  window.fmtNative = fmtNative;
  window.fmtSigned = fmtSigned;
  window.esc = esc;
  window.setText = setText;
  window.setHtml = setHtml;
  window.copyToClipboard = copyToClipboard;
  window.getDateRanges = getDateRanges;
  window.selectRange = selectRange;
  window.currentQuery = currentQuery;
  window.loadProfit = loadProfit;
  window.refreshProfit = refreshProfit;
  window.startProfitPolling = startProfitPolling;

  // Auto-run on open
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      loadProfit();
      startProfitPolling();
    });
  } else {
    loadProfit();
    startProfitPolling();
  }
})();
