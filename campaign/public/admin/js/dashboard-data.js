(function () {
  'use strict';

  var inflightController = null;
  var lastSuccessfulFetchAt = 0;
  var REQUEST_TIMEOUT_MS = 15000;

  function buildDashboardURL() {
    var campaign = document.getElementById('filter-campaign');
    var dateRangeSel = document.getElementById('filter-daterange');
    var campaignVal = campaign ? campaign.value : 'all';
    var dateRangeVal = dateRangeSel ? dateRangeSel.value : 'last30days';

    var params = new URLSearchParams();
    params.set('campaign', campaignVal);
    params.set('include', 'all');

    if (dateRangeVal === 'custom') {
      var s = document.getElementById('start-date');
      var e = document.getElementById('end-date');
      if (s && e && s.value && e.value) {
        params.set('startDate', s.value + 'T00:00:00Z');
        params.set('endDate', e.value + 'T23:59:59Z');
      }
    } else if (dateRangeVal !== 'allTime') {
      var ranges = window.__getDashboardDateRanges ? window.__getDashboardDateRanges() : null;
      if (ranges && ranges[dateRangeVal]) {
        params.set('startDate', ranges[dateRangeVal].startDate);
        params.set('endDate', ranges[dateRangeVal].endDate);
      }
    }

    return '/api/admin/dashboard?' + params.toString();
  }

  function showError(message) {
    var existing = document.getElementById('dashboard-error-banner');
    if (existing) existing.remove();
    var banner = document.createElement('div');
    banner.id = 'dashboard-error-banner';
    banner.className = 'fixed top-4 right-4 z-[100] bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg max-w-sm flex items-center gap-3';
    banner.innerHTML =
      '<span class="text-sm font-medium">' + message + '</span>' +
      '<button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white text-lg leading-none">&times;</button>';
    document.body.appendChild(banner);
    setTimeout(function () { if (banner.parentElement) banner.remove(); }, 7000);
  }

  function setLoading(isLoading) {
    var ids = ['stat-net', 'stat-gross', 'stat-fees', 'stat-raised', 'stat-tips',
      'stat-transactions', 'stat-donors', 'stat-avg', 'stat-fee-pct'];
    if (isLoading && lastSuccessfulFetchAt === 0) {
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el && (el.textContent === '-' || el.textContent === '0' || el.textContent === '')) {
          el.classList.add('animate-pulse', 'opacity-60');
        }
      });
    } else {
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('animate-pulse', 'opacity-60');
      });
    }
  }

  async function fetchDashboardData() {
    if (inflightController) {
      try { inflightController.abort(); } catch (_) {}
    }
    inflightController = new AbortController();
    var ctrl = inflightController;
    var timeoutId = setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, REQUEST_TIMEOUT_MS);

    setLoading(true);

    try {
      var res = await fetch(buildDashboardURL(), {
        signal: ctrl.signal,
        credentials: 'same-origin'
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        var errBody = null;
        try { errBody = await res.json(); } catch (_) {}
        throw new Error((errBody && errBody.error) || 'HTTP ' + res.status);
      }
      var data = await res.json();
      lastSuccessfulFetchAt = Date.now();
      setLoading(false);
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      setLoading(false);
      if (err.name === 'AbortError') return null;
      console.error('[dashboard-data] fetch failed', err);
      showError('Failed to load dashboard: ' + (err.message || 'Unknown error'));
      return null;
    } finally {
      if (inflightController === ctrl) inflightController = null;
    }
  }

  window.__dashboardData = {
    fetchDashboardData: fetchDashboardData,
    showError: showError,
    setLoading: setLoading
  };
})();
