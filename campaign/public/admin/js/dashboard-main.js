var dashboardBaseCurrency = 'EUR';
var dashboardCurrencyBreakdown = {};

function getDateRanges() {
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    today: { startDate: today.toISOString(), endDate: new Date().toISOString() },
    yesterday: { startDate: new Date(today.getTime() - 86400000).toISOString(), endDate: today.toISOString() },
    last7days: { startDate: new Date(today.getTime() - 7 * 86400000).toISOString(), endDate: now.toISOString() },
    last30days: { startDate: new Date(today.getTime() - 30 * 86400000).toISOString(), endDate: now.toISOString() },
    thisMonth: { startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), endDate: now.toISOString() },
    lastMonth: {
      startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
      endDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    },
    thisYear: { startDate: new Date(now.getFullYear(), 0, 1).toISOString(), endDate: now.toISOString() }
  };
}
window.__getDashboardDateRanges = getDateRanges;

function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

function applyHeaderStats(data) {
  setText('stat-base-label', '(' + dashboardBaseCurrency + ')');
  setText('stat-net', formatBaseCurrency(data.net));
  setText('stat-gross', formatBaseCurrency(data.gross));
  setText('stat-fees', '-' + formatBaseCurrency(data.fees));
  var feeRate = data.gross > 0 ? ((data.fees / data.gross) * 100).toFixed(1) + '%' : '0%';
  setText('stat-fee-pct', feeRate);
  setText('stat-raised', formatBaseCurrency(data.raised));
  setText('stat-tips', formatBaseCurrency(data.tips));
  setText('stat-transactions', data.transactionCount);
  setText('stat-donors', data.donorCount);
  setText('stat-avg', formatBaseCurrency(data.avgDonation));
  var progressPct = data.goal > 0 ? Math.round((data.raised / data.goal) * 100) : 0;
  setText('stat-progress', data.goal > 0 ? progressPct + '%' : 'N/A');
  var goalCard = document.getElementById('goal-progress-card');
  var goalBar = document.getElementById('goal-progress-bar');
  if (goalCard && goalBar) {
    if (data.goal > 0) {
      goalCard.classList.remove('hidden');
      goalBar.style.width = Math.min(progressPct, 100) + '%';
    } else {
      goalCard.classList.add('hidden');
    }
  }
  var hintEl = document.getElementById('stat-multi-hint');
  if (hintEl) {
    var numCurrencies = Object.keys(dashboardCurrencyBreakdown).length;
    hintEl.textContent = numCurrencies > 1 ? numCurrencies + ' currencies \u00B7 Click to expand' : '';
  }
}

function applyCampaignBreakdown(data) {
  if (data.campaignBreakdown && Object.keys(data.campaignBreakdown).length > 1) {
    var breakdownContainer = document.getElementById('campaign-breakdown');
    var breakdownContent = document.getElementById('breakdown-content');
    if (!breakdownContainer || !breakdownContent) return;
    breakdownContainer.classList.remove('hidden');
    breakdownContent.innerHTML = Object.keys(data.campaignBreakdown)
      .map(function (k) { return [k, data.campaignBreakdown[k]]; })
      .sort(function (a, b) { return (b[1].net || b[1].raised) - (a[1].net || a[1].raised); })
      .map(function (entry) {
        var slug = entry[0]; var stats = entry[1];
        var campaign = (data.campaigns || []).find(function (c) { return c.id === slug; });
        var netVal = stats.net || (stats.raised + stats.tips - stats.fees);
        var percentage = data.net > 0 ? Math.round((netVal / data.net) * 100) : 0;
        var title = campaign ? campaign.title : slug;
        return '<div class="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">' +
          '<div class="flex-1 min-w-0">' +
          '<p class="font-semibold text-gfm-dark truncate">' + title + '</p>' +
          '<p class="text-sm text-gfm-gray">' + stats.count + ' donations &bull; ' + formatBaseCurrency(stats.tips) + ' tips &bull; <span class="text-red-400">' + formatBaseCurrency(stats.fees) + ' fees</span></p>' +
          '</div>' +
          '<div class="text-right">' +
          '<p class="font-bold text-gfm-green text-lg">' + formatBaseCurrency(netVal) + '</p>' +
          '<p class="text-xs text-gfm-gray">' + percentage + '% of payout</p>' +
          '</div></div>';
      }).join('');
  } else {
    var hideEl = document.getElementById('campaign-breakdown');
    if (hideEl) hideEl.classList.add('hidden');
  }
}

function renderRecentDonors(data) {
  var container = document.getElementById('recent-donations');
  if (!container) return;
  if (!data.recentDonors || data.recentDonors.length === 0) {
    container.innerHTML = '<p class="text-gfm-gray text-sm">No donations yet</p>';
    return;
  }
  container.innerHTML = data.recentDonors.map(function (d) {
    var anonHtml = d.isAnonymous ? ' <span class="text-xs text-gfm-gray">(anon)</span>' : '';
    var campHtml = d.campaign ? ' <span class="text-xs text-blue-500">(' + d.campaign + ')</span>' : '';
    var cardHtml = d.cardBrand ? ' &bull; ' + d.cardBrand + (d.cardLastDigits ? ' ****' + d.cardLastDigits : '') : '';
    var monthlyHtml = d.donationType === 'monthly' ? ' &bull; <span class="text-blue-500">Monthly</span>' : '';
    var curBadge = d.currency && d.currency !== dashboardBaseCurrency
      ? '<span class="ml-1 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-medium">' + d.currency + '</span>' : '';
    var recurringHtml = d.vaultId ? '<p class="text-xs text-purple-500">\uD83D\uDD04 Recurring</p>' : '';
    return '<div class="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors" onclick="showTransactionDetail(\'' + d.id + '\')">' +
      '<div class="w-10 h-10 rounded-full bg-gradient-to-br ' + d.color + ' flex items-center justify-center text-white text-sm font-bold">' + d.initials + '</div>' +
      '<div class="flex-1 min-w-0">' +
      '<p class="font-medium text-gfm-dark truncate">' + d.name + anonHtml + campHtml + '</p>' +
      '<p class="text-sm text-gfm-gray">' + d.time + cardHtml + monthlyHtml + '</p>' +
      '</div>' +
      '<div class="text-right">' +
      '<span class="font-bold text-gfm-green">' + formatCurrency(d.amount, d.currency) + '</span>' +
      curBadge + recurringHtml +
      '</div>' +
      '<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' +
      '</div>';
  }).join('');
}

async function loadDashboard() {
  var data = await window.__dashboardData.fetchDashboardData();
  if (!data) return;

  if (data.campaigns) {
    var campaignSelect = document.getElementById('filter-campaign');
    if (campaignSelect) {
      var currentValue = campaignSelect.value;
      campaignSelect.innerHTML = '<option value="all">All Campaigns</option>' +
        data.campaigns.map(function (c) { return '<option value="' + c.id + '">' + c.title + '</option>'; }).join('');
      campaignSelect.value = currentValue;
    }
  }

  dashboardBaseCurrency = data.baseCurrency || 'EUR';
  dashboardCurrencyBreakdown = data.currencyBreakdown || {};

  applyHeaderStats(data);
  renderCurrencyBreakdown(dashboardCurrencyBreakdown);
  updateActiveFilters(data.filters, data.campaigns);
  applyCampaignBreakdown(data);
  renderStoreBreakdown(data.storeBreakdown || {}, data.net || 0);
  renderRecentDonors(data);

  if (data.timeAnalytics) renderTimeAnalytics(data.timeAnalytics);
  if (data.deviceAnalytics) renderDeviceAnalytics(data.deviceAnalytics);
}

function updateActiveFilters(filters, campaigns) {
  var container = document.getElementById('active-filters');
  if (!container || !filters) return;
  var tags = [];
  if (filters.campaign && filters.campaign !== 'all') {
    var campaign = (campaigns || []).find(function (c) { return c.id === filters.campaign; });
    var label = campaign ? campaign.title : filters.campaign;
    tags.push('<span class="px-3 py-1 bg-gfm-green-light text-gfm-green rounded-full text-xs font-medium">Campaign: ' + label + '</span>');
  }
  if (filters.startDate && filters.endDate) {
    var start = new Date(filters.startDate).toLocaleDateString();
    var end = new Date(filters.endDate).toLocaleDateString();
    tags.push('<span class="px-3 py-1 bg-blue-100 text-blue-600 rounded-full text-xs font-medium">\uD83D\uDCC5 ' + start + ' - ' + end + '</span>');
  }
  container.innerHTML = tags.join('');
}

(function setupEventListeners() {
  var dr = document.getElementById('filter-daterange');
  if (dr) dr.addEventListener('change', function (e) {
    var customRange = document.getElementById('custom-date-range');
    if (!customRange) return;
    if (e.target.value === 'custom') {
      customRange.classList.remove('hidden');
      var today = new Date().toISOString().split('T')[0];
      var lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      var s = document.getElementById('start-date');
      var en = document.getElementById('end-date');
      if (s) s.value = lastMonth;
      if (en) en.value = today;
    } else {
      customRange.classList.add('hidden');
      loadDashboard();
    }
  });

  var fc = document.getElementById('filter-campaign');
  if (fc) fc.addEventListener('change', loadDashboard);

  var sd = document.getElementById('start-date');
  var ed = document.getElementById('end-date');
  if (sd) sd.addEventListener('change', function () {
    if (ed && ed.value) loadDashboard();
  });
  if (ed) ed.addEventListener('change', function () {
    if (sd && sd.value) loadDashboard();
  });
})();

var dashboardPollTimer = null;
function startDashboardPolling() {
  if (dashboardPollTimer) clearInterval(dashboardPollTimer);
  dashboardPollTimer = setInterval(function () {
    if (document.visibilityState === 'visible') loadDashboard();
  }, 60000);
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') {
    loadDashboard();
    startDashboardPolling();
  } else if (dashboardPollTimer) {
    clearInterval(dashboardPollTimer);
    dashboardPollTimer = null;
  }
});

window.loadDashboard = loadDashboard;
window.startDashboardPolling = startDashboardPolling;
