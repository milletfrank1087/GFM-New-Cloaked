/* Profit Cockpit Renderers */
(function() {

  /* Timeline Chart Renderer (Driven by Main Date Range) */
  function renderTimelineChart(chartRows, isHourly) {
    var container = document.getElementById('chart-bars-container');
    setText('chart-type-badge', isHourly ? '24H Hourly Velocity (' + window.userTimeZone + ')' : 'Daily Settlement (' + (chartRows ? chartRows.length : 0) + ' Days)');
    setText('chart-subtitle', isHourly ? 'Hourly gross revenue volume and net profit trajectory' : 'Daily gross revenue volume vs net profit trajectory');

    if (!chartRows || !chartRows.length) {
      container.innerHTML = '<div class="w-full text-center text-xs text-slate-400 py-14">No transaction activity recorded for this period</div>';
      return;
    }

    var maxGross = Math.max.apply(Math, chartRows.map(function(d) { return d.gross || 0; })) || 10;
    var html = chartRows.map(function(d) {
      var hGross = d.gross > 0 ? Math.max(8, Math.round(((d.gross || 0) / maxGross) * 100)) : 2;
      var hNet = d.net > 0 ? Math.max(6, Math.round(((d.net || 0) / maxGross) * 100)) : 2;
      var intervalLabel = isHourly ? d.date : new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' });

      var fxInfo = '';
      if (d.byCurrency && Object.keys(d.byCurrency).length > 0) {
        var nonEur = Object.keys(d.byCurrency).filter(function(k) { return k !== window.__profitBaseCurrency && d.byCurrency[k].nativeGross > 0; });
        if (nonEur.length > 0) {
          fxInfo = ' · Native: ' + nonEur.map(function(k) { return fmtNative(d.byCurrency[k].nativeGross, k); }).join(', ');
        }
      }

      return '<div class="flex-1 flex flex-col items-center justify-end h-full min-w-[20px] max-w-[52px] group" ' +
        'onmouseenter="document.getElementById(\'chart-tooltip\').innerHTML=\'<span class=\\\'font-bold text-[#061b31]\\\'>' + esc(intervalLabel) + '</span>: Gross ' + fmt(d.gross) + ' · Fees −' + fmt(d.fees) + ' · Net <b class=\\\'text-[#00875a]\\\'>' + fmt(d.net) + '</b> (' + d.count + ' txns' + esc(fxInfo) + ')\'" ' +
        'onmouseleave="document.getElementById(\'chart-tooltip\').textContent=\'Hover over any bar to inspect interval settlement & FX\'">' +
        '<div class="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-full px-0.5">' +
          '<div class="w-2 sm:w-3 bg-[#635bff] rounded-t-xs transition-all group-hover:bg-[#533afd]" style="height: ' + hGross + '%;"></div>' +
          '<div class="w-2 sm:w-3 bg-[#00875a] rounded-t-xs transition-all group-hover:bg-[#029e55]" style="height: ' + hNet + '%;"></div>' +
        '</div>' +
        '<span class="text-[9px] font-mono text-slate-400 mt-1.5 whitespace-nowrap">' + (isHourly ? esc(d.date.slice(0, 2)) : esc(d.date.slice(8, 10))) + '</span>' +
      '</div>';
    }).join('');

    container.innerHTML = html;
  }

  /* Waterfall & Hero Renderer */
  function renderWaterfallAndHero(data) {
    var t = data.totals || {};
    window.__profitBaseCurrency = data.baseCurrency || 'EUR';
    window.latestAdFx = data.adSync?.fx || null;

    var cb = data.currencyBreakdown || {};
    var currencies = Object.keys(cb);
    var nonBaseCurrencies = currencies.filter(function(c) { return c !== window.__profitBaseCurrency; });
    var hasFx = nonBaseCurrencies.length > 0 || t.spendNative > 0;

    var grossBreakdown = [];
    var tipsBreakdown = [];
    var feesBreakdown = [];
    var netBreakdown = [];

    currencies.forEach(function(cur) {
      var b = cb[cur];
      grossBreakdown.push({ currency: cur, native: fmtNative(b.nativeGross, cur), base: fmt(b.gross), count: b.count });
      if (b.tips > 0 || b.nativeTips > 0) {
        tipsBreakdown.push({ currency: cur, native: fmtNative(b.nativeTips || b.tips, cur), base: fmt(b.tips), count: b.count });
      }
      feesBreakdown.push({ currency: cur, native: '−' + fmtNative(b.nativeFees, cur), base: '−' + fmt(b.fees), count: b.count });
      netBreakdown.push({ currency: cur, native: fmtNative(b.nativeNet, cur), base: fmt(b.net), count: b.count });
    });

    var grossFxMarkup = nonBaseCurrencies.length > 0 ? fxMarkupAggregate('Gross Revenue FX Breakdown', grossBreakdown) : '';
    var tipsFxMarkup = nonBaseCurrencies.length > 0 && t.tips > 0 ? fxMarkupAggregate('Tips FX Breakdown', tipsBreakdown) : '';
    var feesFxMarkup = nonBaseCurrencies.length > 0 ? fxMarkupAggregate('Processor Fees FX Breakdown', feesBreakdown) : '';
    var netFxMarkup = nonBaseCurrencies.length > 0 ? fxMarkupAggregate('Net Revenue FX Breakdown', netBreakdown) : '';
    var spendFxMarkup = t.spendNative > 0 ? fxMarkupSpend(t.spendNative, t.spend, data.adSync?.fx) : '';

    setHtml('hero-profit', fmtSigned(t.profit) + (hasFx ? fxMarkupHero(data) : ''));
    setText('hero-margin', t.gross > 0 ? ((t.profit / t.gross) * 100).toFixed(1) + '%' : '0.0%');
    setText('hero-txns', (t.count || 0).toLocaleString());
    setText('hero-currency-badge', window.__profitBaseCurrency + ' (€)');
    setText('hero-window', data.range?.start ? new Date(data.range.start).toLocaleDateString() + ' → ' + new Date(data.range.end).toLocaleDateString() : 'All Settled Payments');

    setHtml('wf-gross', fmt(t.gross) + grossFxMarkup);
    setText('wf-gross-count', (t.count || 0) + ' txns');
    setHtml('wf-tips', fmt(t.tips) + tipsFxMarkup);

    setHtml('wf-fees', '−' + fmt(t.fees) + feesFxMarkup);
    setText('wf-fee-pct', t.gross > 0 ? ((t.fees / t.gross) * 100).toFixed(1) + '%' : '0.0%');

    /* Status & Freshness */
    var fetchedAt = data.adSync?.fetchedAt ? new Date(data.adSync.fetchedAt) : null;
    var ttlMs = data.adSync?.ttlMs || (5 * 60 * 1000);
    var isRefreshing = Boolean(data.adSync?.refreshing);
    var ageMs = fetchedAt ? (Date.now() - fetchedAt.getTime()) : null;
    var isStale = typeof data.adSync?.isStale === 'boolean' ? data.adSync.isStale : (ageMs === null || ageMs > ttlMs);
    var dot = document.getElementById('fresh-dot');
    if (dot) {
      dot.classList.toggle('warn', isStale && !isRefreshing);
      dot.classList.toggle('pulse', isRefreshing);
    }
    var ageMinutes = fetchedAt ? Math.max(0, Math.round(ageMs / 60000)) : null;
    var presetName = data.adSync?.preset || 'filter';

    var metaSyncText = isRefreshing
      ? 'Meta ads syncing…'
      : (fetchedAt
          ? 'Meta ads polled ' + (ageMinutes === 0 ? 'just now' : ageMinutes + 'm ago') + ' (' + presetName + ')'
          : 'Meta sync pending');

    setText('freshness-label', 'Real-Time Payments');
    setText('last-updated-label', metaSyncText);

    setHtml('wf-spend', fmt(t.spend) + spendFxMarkup);
    setText('wf-spend-native-badge', fmtNative(t.spendNative, data.totals?.spendCurrency || 'USD'));
    setText('wf-spend-preset', fetchedAt ? (ageMinutes === 0 ? 'polled just now' : 'polled ' + ageMinutes + 'm ago') + ' · ' + presetName : 'syncing…');

    setHtml('wf-net', fmtSigned(t.profit) + (hasFx ? fxMarkupHero(data) : ''));
    setText('wf-margin-badge', t.gross > 0 ? ((t.profit / t.gross) * 100).toFixed(1) + '%' : '0%');

    /* Signals */
    setText('signal-aov', t.count ? fmt(t.gross / t.count) : '€0.00');
    setText('signal-roas', t.spend > 0 && t.metaPurchaseValue > 0 ? (t.metaPurchaseValue / t.spend).toFixed(2) + 'x' : '—');
    setHtml('signal-cpa', (t.metaPurchases > 0 ? fmt(t.spend / t.metaPurchases) : '—') + (t.metaPurchases > 0 && t.spendNative > 0 ? fxMarkupSpend(t.spendNative / t.metaPurchases, t.spend / t.metaPurchases, data.adSync?.fx) : ''));
    setText('signal-cpa-sub', t.metaPurchases ? t.metaPurchases + ' purchases' : 'no purchases');
    setHtml('signal-tips', fmt(t.tips) + tipsFxMarkup);
    setText('signal-tips-pct', t.gross > 0 ? ((t.tips / t.gross) * 100).toFixed(1) + '% of gross' : '0%');
    setHtml('signal-fee-drag', (t.gross > 0 ? ((t.fees / t.gross) * 100).toFixed(1) + '%' : '0.0%') + feesFxMarkup);
    setHtml('signal-fx', currencies.length + ' Currencies' + (nonBaseCurrencies.length > 0 ? fxMarkupAggregate('Multi-Currency Portfolio', grossBreakdown) : ''));

    setText('timezone-note', 'Txns: ' + window.userTimeZone + ' · Ads: Meta tz');
  }

  /* Campaign Matrix Renderer */
  function filterCampaignTable(mode) {
    window.campaignFilterMode = mode;
    document.querySelectorAll('.camp-tab').forEach(function(btn) {
      var isSelected = btn.dataset.filter === mode;
      btn.classList.toggle('bg-white', isSelected);
      btn.classList.toggle('shadow-sm', isSelected);
      btn.classList.toggle('text-[#061b31]', isSelected);
      btn.classList.toggle('text-slate-500', !isSelected);
    });
    renderCampaignTableRows();
  }

  function searchCampaigns(q) {
    renderCampaignTableRows(q.toLowerCase().trim());
  }

  function updateCampaignBadges(rows) {
    var allCount = (rows || []).length;
    var activeCount = (rows || []).filter(function(c) { return (c.gross > 0 || c.spend > 0); }).length;
    var adsCount = (rows || []).filter(function(c) { return c.isAdCampaign; }).length;

    setText('badge-all-count', allCount);
    setText('badge-active-count', activeCount);
    setText('badge-ads-count', adsCount);
  }

  function renderCampaignTableRows(searchQuery) {
    var tbody = document.getElementById('campaign-table-body');
    var rows = window.activeCampaignsData || [];

    if (window.campaignFilterMode === 'active') {
      rows = rows.filter(function(c) { return (c.gross > 0 || c.spend > 0); });
    } else if (window.campaignFilterMode === 'ads') {
      rows = rows.filter(function(c) { return c.isAdCampaign; });
    }

    if (searchQuery) {
      rows = rows.filter(function(c) {
        return (c.name || '').toLowerCase().indexOf(searchQuery) >= 0 ||
               (c.key || '').toLowerCase().indexOf(searchQuery) >= 0;
      });
    }

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-6 text-slate-400 text-xs">No matching campaign performance found</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function(c) {
      var isAd = c.isAdCampaign;
      var displayName = esc(c.name || c.key);
      var badge = isAd ? '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 ml-1.5 border border-indigo-100">AD</span>' : '';
      var profitClass = c.profit < 0 ? 'text-[#df1b41] font-bold' : 'text-[#00875a] font-bold';

      var byCur = c.byCurrency || {};
      var curKeys = Object.keys(byCur);
      var nonEur = curKeys.filter(function(k) { return k !== (window.__profitBaseCurrency || 'EUR'); });
      var hasCampFx = nonEur.length > 0;

      var campGrossBreakdown = curKeys.map(function(k) {
        return { currency: k, native: fmtNative(byCur[k].nativeGross, k), base: fmt(byCur[k].gross) };
      });
      var campTipsBreakdown = curKeys.filter(function(k) { return byCur[k].tips > 0; }).map(function(k) {
        return { currency: k, native: fmtNative(byCur[k].nativeTips, k), base: fmt(byCur[k].tips) };
      });
      var campFeesBreakdown = curKeys.map(function(k) {
        return { currency: k, native: '−' + fmtNative(byCur[k].nativeFees, k), base: '−' + fmt(byCur[k].fees) };
      });
      var campNetBreakdown = curKeys.map(function(k) {
        return { currency: k, native: fmtNative(byCur[k].nativeNet, k), base: fmt(byCur[k].net) };
      });

      var grossFx = hasCampFx ? fxMarkupAggregate('Campaign Revenue FX', campGrossBreakdown) : '';
      var tipsFx = hasCampFx && c.tips > 0 ? fxMarkupAggregate('Campaign Tips FX', campTipsBreakdown) : '';
      var feesFx = hasCampFx ? fxMarkupAggregate('Campaign Fees FX', campFeesBreakdown) : '';
      var netFx = hasCampFx ? fxMarkupAggregate('Campaign Net FX', campNetBreakdown) : '';
      var spendFx = c.spendNative > 0 ? fxMarkupSpend(c.spendNative, c.spend, window.latestAdFx) : '';

      return '<tr>' +
        '<td class="sticky-col font-semibold text-[#061b31]">' + displayName + badge + '<div class="text-[10px] text-slate-400 font-mono">' + esc(c.key) + '</div></td>' +
        '<td class="text-right font-medium">' + fmt(c.gross) + grossFx + '</td>' +
        '<td class="text-right text-blue-600">' + fmt(c.tips) + tipsFx + '</td>' +
        '<td class="text-right text-[#df1b41]">−' + fmt(c.fees) + feesFx + '</td>' +
        '<td class="text-right font-medium">' + fmt(c.net) + netFx + '</td>' +
        '<td class="text-right text-indigo-600">' + fmt(c.spend) + spendFx + (c.spendNative ? '<div class="text-[10px] text-slate-400 font-normal">' + fmtNative(c.spendNative, 'USD') + '</div>' : '') + '</td>' +
        '<td class="text-right ' + profitClass + '">' + fmtSigned(c.profit) + '</td>' +
        '<td class="text-right">' + (c.roas ? '<span class="px-1.5 py-0.5 rounded ' + (c.roas >= 2.5 ? 'bg-emerald-50 text-[#00875a] font-bold border border-emerald-100' : 'text-slate-700') + '">' + Number(c.roas).toFixed(2) + 'x</span>' : '—') + '</td>' +
        '<td class="text-right text-slate-700">' + (c.cpa ? fmt(c.cpa) : '—') + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderCampaignFilter(rows) {
    var select = document.getElementById('filter-campaign');
    if (!select) return;
    var current = select.value;
    if (current !== 'all' && select.options.length > 2) return;
    var options = ['<option value="all">All Campaigns</option>'];
    (rows || []).filter(function(c) { return c.key && c.key !== 'direct'; }).forEach(function(c) {
      options.push('<option value="' + esc(c.key) + '">' + esc(c.name || c.key) + '</option>');
    });
    select.innerHTML = options.join('');
    select.value = options.some(function(o) { return o.indexOf('value="' + current + '"') >= 0; }) ? current : 'all';
  }

  /* Store Performance Renderer */
  function renderStoreBreakdown(storeRows) {
    var container = document.getElementById('stores-breakdown-list');
    setText('store-count-badge', (storeRows ? storeRows.length : 0) + ' Stores');
    if (!storeRows || !storeRows.length) {
      container.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">No store routing data</p>';
      return;
    }

    var totalVolume = storeRows.reduce(function(s, r) { return s + (r.gross || 0); }, 0) || 1;
    container.innerHTML = storeRows.map(function(s) {
      var pct = ((s.gross / totalVolume) * 100).toFixed(1);
      var sByCur = s.byCurrency || {};
      var sCurKeys = Object.keys(sByCur);
      var sNonEur = sCurKeys.filter(function(k) { return k !== (window.__profitBaseCurrency || 'EUR'); });
      var storeBreakdown = sCurKeys.map(function(k) {
        return { currency: k, native: fmtNative(sByCur[k].nativeGross, k), base: fmt(sByCur[k].gross) };
      });
      var storeFx = sNonEur.length > 0 ? fxMarkupAggregate('Store Volume FX Breakdown', storeBreakdown) : '';

      return '<div class="p-3 rounded bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">' +
        '<div class="flex items-center justify-between mb-1">' +
          '<span class="font-semibold text-xs text-[#061b31] truncate font-mono">' + esc(s.domain) + '</span>' +
          '<span class="font-bold text-xs font-mono text-[#061b31] flex items-center">' + fmt(s.gross) + storeFx + '</span>' +
        '</div>' +
        '<div class="w-full bg-slate-200 rounded-full h-1.5 mb-1.5 overflow-hidden">' +
          '<div class="bg-[#00875a] h-1.5 rounded-full transition-all" style="width: ' + pct + '%"></div>' +
        '</div>' +
        '<div class="flex items-center justify-between text-[11px] text-slate-400 font-mono">' +
          '<span>' + s.count + ' txns · fees ' + fmt(s.fees) + '</span>' +
          '<span class="font-semibold text-slate-500">' + pct + '% share</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* Currency Breakdown Renderer */
  function renderCurrencyBreakdown(breakdown) {
    var container = document.getElementById('currency-breakdown-container');
    if (!breakdown || !Object.keys(breakdown).length) {
      container.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">No currency data</p>';
      return;
    }

    container.innerHTML = Object.keys(breakdown).map(function(cur) {
      var b = breakdown[cur];
      var fxIcon = cur !== (window.__profitBaseCurrency || 'EUR') ? fxMarkup(fmtNative(b.nativeGross, cur), fmt(b.gross), cur, { rate: b.rate, rateDate: b.rateDate, source: b.fxSource }) : '';
      return '<div class="p-3 rounded bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors flex items-center justify-between">' +
        '<div>' +
          '<div class="flex items-center gap-1"><span class="font-bold text-xs font-mono text-[#061b31]">' + esc(cur) + '</span>' + fxIcon + '</div>' +
          '<p class="text-xs text-slate-400 mt-0.5">' + b.count + ' payments</p>' +
        '</div>' +
        '<div class="text-right font-mono">' +
          '<p class="font-bold text-sm text-[#061b31]">' + fmt(b.gross) + '</p>' +
          '<p class="text-[11px] text-slate-400">Native ' + fmtNative(b.nativeGross, cur) + '</p>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* All Completed Transactions Renderer */
  function searchTransactions(q) {
    renderTransactionsFeed(q.toLowerCase().trim());
  }

  function renderTransactionsFeed(searchQuery) {
    var tbody = document.getElementById('recent-transactions-body');
    var list = window.allTransactionsData || [];

    if (searchQuery) {
      list = list.filter(function(p) {
        return (p.name || '').toLowerCase().indexOf(searchQuery) >= 0 ||
               (p.id || '').toLowerCase().indexOf(searchQuery) >= 0 ||
               (p.campaign || '').toLowerCase().indexOf(searchQuery) >= 0;
      });
    }

    setText('txns-count-badge', (list ? list.length : 0) + ' Transactions');

    if (!list || !list.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-6 text-slate-400 text-xs">No completed payments for this timeframe</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(function(p) {
      var isNonEur = p.currency !== (window.__profitBaseCurrency || 'EUR');
      var amountFx = isNonEur ? fxMarkup(fmtNative(p.native?.amount, p.currency), fmt(p.amountBase), p.currency, p.fx) : '';
      var tipFx = (isNonEur && p.tipBase > 0) ? fxMarkup(fmtNative(p.native?.tip, p.currency), fmt(p.tipBase), p.currency, p.fx) : '';
      var grossFx = isNonEur ? fxMarkup(fmtNative(p.native?.gross, p.currency), fmt(p.grossBase), p.currency, p.fx) : '';
      var feeFx = isNonEur ? fxMarkup(fmtNative(p.native?.fee, p.currency), '−' + fmt(p.feeBase), p.currency, p.fx) : '';
      var netFx = isNonEur ? fxMarkup(fmtNative(p.native?.net, p.currency), fmt(p.netBase), p.currency, p.fx) : '';

      var timeLabel = new Date(p.date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short', timeZone: window.userTimeZone });
      var donorName = esc(p.name || 'Anonymous');
      var cadenceBadge = p.isSubscription
        ? '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100 ml-1">SUB</span>'
        : '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-100 ml-1">\u00D71</span>';

      return '<tr class="cursor-pointer transition-colors" onclick="showDetail(\'' + p.id + '\', this)">' +
        '<td class="sticky-col font-semibold text-[#061b31] flex items-center gap-2">' +
          '<div class="w-6 h-6 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">' + donorName.charAt(0).toUpperCase() + '</div>' +
          '<span class="truncate max-w-[120px] sm:max-w-none">' + donorName + '</span>' + cadenceBadge +
        '</td>' +
        '<td class="text-left font-mono text-xs text-slate-600">' + esc(p.campaign) + '</td>' +
        '<td class="text-right font-mono">' + fmt(p.amountBase) + amountFx + '</td>' +
        '<td class="text-right font-mono text-blue-600">' + fmt(p.tipBase) + tipFx + '</td>' +
        '<td class="text-right font-mono font-bold text-[#061b31]">' + fmt(p.grossBase) + grossFx + '</td>' +
        '<td class="text-right font-mono text-[#df1b41]">−' + fmt(p.feeBase) + feeFx + '</td>' +
        '<td class="text-right font-mono text-[#00875a] font-bold">' + fmt(p.netBase) + netFx + '</td>' +
        '<td class="text-left font-mono text-xs text-slate-500">' + esc(p.currency) + '</td>' +
        '<td class="text-right font-mono text-xs text-slate-400">' + esc(timeLabel) + '</td>' +
      '</tr>';
    }).join('');
  }

  /* Transaction Detail Modal */
  async function showDetail(id, trigger) {
    showDetail.lastTrigger = trigger || document.activeElement;
    document.getElementById('detail-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    document.getElementById('detail-close').focus();
    setText('detail-id-label', 'ID: ' + id);
    setHtml('detail-content', '<p class="text-slate-400 text-xs">Loading transaction metadata…</p>');

    try {
      var res = await fetch('/api/admin/transactions/' + id);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var d = await res.json();
      var a = d.amounts || {};

      var rows = [
        ['Donor Name', esc(d.donor?.name || 'Anonymous')],
        ['Payer Email', d.payer?.email ? '<span class="copy-pill font-mono" onclick="copyToClipboard(\'' + esc(d.payer.email) + '\', this)">' + esc(d.payer.email) + ' 📋</span>' : '—'],
        ['Campaign Target', esc(d.campaign || '—')],
        ['Storefront Domain', esc(d.storeDomain || '—')],
        ['Settlement Status', '<span class="px-2 py-0.5 rounded bg-emerald-100 text-[#00875a] text-xs font-bold font-mono uppercase">' + esc(d.status || 'completed') + '</span>'],
        ['Payment Method', esc((d.card?.brand || '') + (d.card?.lastDigits ? ' •••• ' + d.card.lastDigits : '') || 'Card')],
        ['Donation Amount', fmtNative(a.donation, a.currency)],
        ['Platform Tip', fmtNative(a.tip, a.currency)],
        ['Total Charged', fmtNative(a.total, a.currency)],
        ['Stripe Processor Fee', '−' + fmtNative(a.stripeFee, a.currency)],
        ['Net Payout', fmtNative(a.net, a.currency)],
        ['Timestamp', new Date(d.timestamps?.created).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium', timeZone: window.userTimeZone }) + ' (' + esc(window.userTimeZone) + ')'],
        ['UTM Attribution', esc(d.metadata?.utmCampaign || '—')],
        ['Charge ID', d.processing?.chargeId ? '<span class="copy-pill font-mono text-[11px]" onclick="copyToClipboard(\'' + esc(d.processing.chargeId) + '\', this)">' + esc(d.processing.chargeId) + ' 📋</span>' : '—']
      ];

      var html = rows.map(function(r) {
        return '<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">' +
          '<span class="text-xs font-medium text-slate-500">' + r[0] + '</span>' +
          '<span class="text-xs sm:text-sm font-semibold text-[#061b31] text-right font-mono">' + r[1] + '</span>' +
        '</div>';
      }).join('');

      setHtml('detail-content', html);
    } catch (e) {
      setHtml('detail-content', '<p class="text-red-500 text-xs">Failed to load transaction details.</p>');
    }
  }

  function closeDetail() {
    document.getElementById('detail-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    if (showDetail.lastTrigger && typeof showDetail.lastTrigger.focus === 'function') {
      showDetail.lastTrigger.focus();
    }
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !document.getElementById('detail-modal').classList.contains('hidden')) {
      closeDetail();
    }
  });

  function exportProfitCSV() {
    if (!window.activeCampaignsData || !window.activeCampaignsData.length) return;
    var headers = ['Campaign', 'Key', 'IsAd', 'Revenue_EUR', 'Tips_EUR', 'Fees_EUR', 'Net_EUR', 'Spend_EUR', 'Spend_Native_USD', 'Net_Profit_EUR', 'Purchases', 'ROAS', 'CPA_EUR'];
    var rows = window.activeCampaignsData.map(function(c) {
      return [
        '"' + (c.name || c.key).replace(/"/g, '""') + '"',
        c.key,
        c.isAdCampaign ? 'YES' : 'NO',
        (c.gross || 0).toFixed(2),
        (c.tips || 0).toFixed(2),
        (c.fees || 0).toFixed(2),
        (c.net || 0).toFixed(2),
        (c.spend || 0).toFixed(2),
        (c.spendNative || 0).toFixed(2),
        (c.profit || 0).toFixed(2),
        c.purchases || 0,
        c.roas || '',
        (c.cpa || 0).toFixed(2)
      ];
    });

    var csv = [headers.join(','), rows.map(function(r) { return r.join(','); }).join('\n')].join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'profit-matrix-' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
  }

  window.renderTimelineChart = renderTimelineChart;
  window.renderWaterfallAndHero = renderWaterfallAndHero;
  window.filterCampaignTable = filterCampaignTable;
  window.searchCampaigns = searchCampaigns;
  window.updateCampaignBadges = updateCampaignBadges;
  window.renderCampaignTableRows = renderCampaignTableRows;
  window.renderCampaignFilter = renderCampaignFilter;
  window.renderStoreBreakdown = renderStoreBreakdown;
  window.renderCurrencyBreakdown = renderCurrencyBreakdown;
  window.searchTransactions = searchTransactions;
  window.renderTransactionsFeed = renderTransactionsFeed;
  window.showDetail = showDetail;
  window.closeDetail = closeDetail;
  window.exportProfitCSV = exportProfitCSV;
})();
