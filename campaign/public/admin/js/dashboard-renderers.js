(function () {
  'use strict';

  function fmtBase(amt) {
    return window.formatBaseCurrency ? window.formatBaseCurrency(amt) : String(amt);
  }

  function showTimeTab(tab) {
    document.querySelectorAll('.time-tab').forEach(function (t) {
      t.classList.remove('border-gfm-green', 'text-gfm-green');
      t.classList.add('border-transparent', 'text-gfm-gray');
    });
    var btn = document.getElementById('time-tab-' + tab);
    if (btn) {
      btn.classList.remove('border-transparent', 'text-gfm-gray');
      btn.classList.add('border-gfm-green', 'text-gfm-green');
    }
    document.querySelectorAll('.time-content').forEach(function (c) { c.classList.add('hidden'); });
    var content = document.getElementById('time-content-' + tab);
    if (content) content.classList.remove('hidden');
  }

  function renderHourHeatmap(data) {
    var container = document.getElementById('hour-heatmap');
    if (!container) return;
    var maxCount = Math.max.apply(null, data.map(function (h) { return h.count; }).concat(1));
    container.innerHTML = data.map(function (h) {
      var intensity = h.count / maxCount;
      var bgClass = 'bg-gray-100';
      if (intensity > 0.6) bgClass = 'bg-gfm-green';
      else if (intensity > 0.3) bgClass = 'bg-gfm-green/50';
      else if (intensity > 0) bgClass = 'bg-gfm-green/20';
      return '<div class="' + bgClass + ' rounded-lg p-3 text-center transition-all hover:scale-105 cursor-pointer" title="' + h.count + ' donations, ' + fmtBase(h.amount) + '">' +
        '<div class="text-xs font-medium text-gfm-dark">' + h.hour + ':00</div>' +
        '<div class="text-lg font-bold text-gfm-dark mt-1">' + h.count + '</div>' +
        '<div class="text-xs text-gfm-gray">' + fmtBase(h.amount) + '</div></div>';
    }).join('');
  }

  function renderBarRow(label, count, amount, percentage) {
    return '<div class="flex items-center gap-3"><div class="w-24 text-sm font-medium text-gfm-dark">' + label + '</div>' +
      '<div class="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">' +
      '<div class="bg-gfm-green h-full rounded-full transition-all" style="width: ' + percentage + '%"></div>' +
      '<div class="absolute inset-0 flex items-center justify-between px-3">' +
      '<span class="text-xs font-semibold text-gfm-dark">' + count + ' donations</span>' +
      '<span class="text-xs font-semibold text-gfm-dark">' + fmtBase(amount) + '</span></div></div></div>';
  }

  function renderDayOfWeekChart(data) {
    var container = document.getElementById('dayofweek-chart');
    if (!container) return;
    var maxCount = Math.max.apply(null, data.map(function (d) { return d.count; }).concat(1));
    container.innerHTML = data.map(function (d) {
      return renderBarRow(d.day, d.count, d.amount, (d.count / maxCount) * 100);
    }).join('');
  }

  function renderDayOfMonthChart(data) {
    var container = document.getElementById('dayofmonth-chart');
    if (!container) return;
    var maxCount = Math.max.apply(null, data.map(function (d) { return d.count; }).concat(1));
    container.innerHTML = data.map(function (d) {
      var intensity = d.count / maxCount;
      var bgClass = 'bg-gray-100';
      if (intensity > 0.6) bgClass = 'bg-gfm-green';
      else if (intensity > 0.3) bgClass = 'bg-gfm-green/50';
      else if (intensity > 0) bgClass = 'bg-gfm-green/20';
      return '<div class="' + bgClass + ' rounded-lg p-2 text-center transition-all hover:scale-105 cursor-pointer" title="' + d.count + ' donations, ' + fmtBase(d.amount) + '">' +
        '<div class="text-xs font-medium text-gfm-dark">' + d.day + '</div>' +
        '<div class="text-sm font-bold text-gfm-dark mt-1">' + d.count + '</div></div>';
    }).join('');
  }

  function renderMonthChart(data) {
    var container = document.getElementById('month-chart');
    if (!container) return;
    var maxCount = Math.max.apply(null, data.map(function (m) { return m.count; }).concat(1));
    container.innerHTML = data.map(function (m) {
      return renderBarRow(m.month, m.count, m.amount, (m.count / maxCount) * 100);
    }).join('');
  }

  function renderPeakItem(label, count, amount, idx) {
    return '<div class="flex items-center gap-2">' +
      '<span class="flex items-center justify-center w-6 h-6 rounded-full bg-gfm-green text-white text-xs font-bold">' + (idx + 1) + '</span>' +
      '<span class="text-gfm-dark font-medium">' + label + '</span>' +
      '<span class="text-gfm-gray text-xs">-</span>' +
      '<span class="text-gfm-dark font-semibold">' + count + ' donations</span>' +
      '<span class="text-gfm-gray text-xs ml-auto">' + fmtBase(amount) + '</span></div>';
  }

  function renderPeakTimes(peakHours, peakDays) {
    var hoursContainer = document.getElementById('peak-hours');
    var daysContainer = document.getElementById('peak-days');
    if (hoursContainer) {
      hoursContainer.innerHTML = peakHours.map(function (h, i) {
        return renderPeakItem(h.hour + ':00', h.count, h.amount, i);
      }).join('');
    }
    if (daysContainer) {
      daysContainer.innerHTML = peakDays.map(function (d, i) {
        return renderPeakItem(d.day, d.count, d.amount, i);
      }).join('');
    }
  }

  function renderTimeAnalytics(data) {
    renderHourHeatmap(data.byHour || []);
    renderDayOfWeekChart(data.byDayOfWeek || []);
    renderDayOfMonthChart(data.byDayOfMonth || []);
    renderMonthChart(data.byMonth || []);
    renderPeakTimes(data.peakHours || [], data.peakDays || []);
  }

  function setDeviceCard(prefix, stats) {
    var s = stats || {};
    var c = document.getElementById('device-' + prefix + '-count');
    var a = document.getElementById('device-' + prefix + '-amount');
    var p = document.getElementById('device-' + prefix + '-percent');
    if (c) c.textContent = (s.count || 0) + ' donations';
    if (a) a.textContent = 'Avg: ' + fmtBase(s.avgAmount || 0);
    if (p) p.textContent = (s.percentage || 0).toFixed(1) + '% of total';
  }

  function renderDeviceCards(devices) {
    setDeviceCard('mobile', devices.mobile);
    setDeviceCard('desktop', devices.desktop);
    setDeviceCard('tablet', devices.tablet);
  }

  function renderBrowserTable(browsers) {
    var container = document.getElementById('browser-table');
    if (!container) return;
    var browserNames = { chrome: 'Chrome', safari: 'Safari', firefox: 'Firefox', edge: 'Edge', other: 'Other' };
    container.innerHTML = Object.keys(browsers)
      .map(function (k) { return [k, browsers[k]]; })
      .sort(function (a, b) { return b[1].count - a[1].count; })
      .map(function (entry) {
        var browser = entry[0]; var stats = entry[1];
        return '<tr class="border-t border-gray-100">' +
          '<td class="px-4 py-3 text-gfm-dark font-medium">' + (browserNames[browser] || browser) + '</td>' +
          '<td class="px-4 py-3 text-right text-gfm-dark">' + stats.count + '</td>' +
          '<td class="px-4 py-3 text-right text-gfm-green font-semibold">' + fmtBase(stats.amount) + '</td>' +
          '<td class="px-4 py-3 text-right text-gfm-dark">' + fmtBase(stats.avgAmount) + '</td></tr>';
      }).join('');
  }

  function renderPaymentByDevice(paymentMethods) {
    var mobileContainer = document.getElementById('payment-mobile');
    var desktopContainer = document.getElementById('payment-desktop');
    var methodNames = { card: 'Card', apple_pay: 'Apple Pay', google_pay: 'Google Pay', paypal: 'PayPal', venmo: 'Venmo', unknown: 'Unknown' };
    function renderMethods(methods) {
      var entries = Object.keys(methods || {})
        .map(function (k) { return [k, methods[k]]; })
        .sort(function (a, b) { return b[1] - a[1]; });
      if (entries.length === 0) return '<p class="text-gfm-gray text-xs">No data</p>';
      return entries.map(function (e) {
        return '<div class="flex justify-between items-center py-1">' +
          '<span class="text-gfm-dark">' + (methodNames[e[0]] || e[0]) + '</span>' +
          '<span class="font-semibold text-gfm-green">' + e[1] + '</span></div>';
      }).join('');
    }
    if (mobileContainer) mobileContainer.innerHTML = renderMethods(paymentMethods.mobile);
    if (desktopContainer) desktopContainer.innerHTML = renderMethods(paymentMethods.desktop);
  }

  function renderDeviceAnalytics(data) {
    renderDeviceCards(data.byDeviceType || {});
    renderBrowserTable(data.byBrowser || {});
    renderPaymentByDevice(data.paymentMethodByDevice || {});
  }

  window.renderTimeAnalytics = renderTimeAnalytics;
  window.renderDeviceAnalytics = renderDeviceAnalytics;
  window.showTimeTab = showTimeTab;
})();
