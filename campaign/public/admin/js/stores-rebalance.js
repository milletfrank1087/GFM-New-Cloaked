(function() {
  var draft = [];

  function findStore(id) {
    return (typeof stores !== 'undefined' ? stores : []).find(function(s) { return s.id === id; });
  }

  function snapshotStores() {
    var list = typeof stores !== 'undefined' ? stores : [];
    return list.map(function(s) {
      return {
        id: s.id,
        slug: s.slug,
        name: s.name || s.slug,
        domain: s.domain,
        status: s.status === 'active' ? 'active' : 'paused',
        weightPct: parseInt(s.weightPct, 10) || 0,
        currentStatus: s.status === 'active' ? 'active' : 'paused',
        currentWeightPct: parseInt(s.weightPct, 10) || 0,
        monthVolume: s.monthVolume || 0,
        monthTxnCount: s.monthTxnCount || 0
      };
    });
  }

  function activeDraftSum() {
    return draft.filter(function(r) { return r.status === 'active'; })
                .reduce(function(t, r) { return t + (parseInt(r.weightPct, 10) || 0); }, 0);
  }

  function isDraftDirty() {
    return draft.some(function(r) { return r.status !== r.currentStatus || r.weightPct !== r.currentWeightPct; });
  }

  function statusPill(status) {
    var cls = status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600';
    return '<span class="px-2 py-0.5 rounded-full text-xs font-semibold ' + cls + '">' + status + '</span>';
  }

  function deltaBadge(row) {
    var deltaW = (parseInt(row.weightPct, 10) || 0) - row.currentWeightPct;
    var statusChanged = row.status !== row.currentStatus;
    if (!statusChanged && deltaW === 0) {
      return '<span class="text-xs text-gfm-gray">unchanged</span>';
    }
    var parts = [];
    if (statusChanged) parts.push('<span class="text-xs font-medium text-purple-600">' + row.currentStatus + ' &rarr; ' + row.status + '</span>');
    if (deltaW !== 0) {
      var sign = deltaW > 0 ? '+' : '';
      var cls = deltaW > 0 ? 'text-green-600' : 'text-red-600';
      parts.push('<span class="text-xs font-medium ' + cls + '">' + sign + deltaW + '%</span>');
    }
    return parts.join(' &middot; ');
  }

  function renderSumIndicator() {
    var sum = activeDraftSum();
    var ok = sum === 100 || sum === 0;
    var color = sum === 100 ? 'text-gfm-green' : sum === 0 ? 'text-gfm-gray' : 'text-red-500';
    var bar = sum === 100 ? 'bg-gfm-green' : sum === 0 ? 'bg-gray-300' : sum < 100 ? 'bg-amber-400' : 'bg-red-500';
    var widthPct = Math.min(sum, 100);
    var hint = sum === 100
      ? 'Ready to apply.'
      : sum === 0
        ? 'All stores paused. Rotation will fall back to the env default until reactivated.'
        : sum < 100
          ? 'Add ' + (100 - sum) + '% more to the active stores.'
          : 'Remove ' + (sum - 100) + '% from the active stores.';

    var html = ''
      + '<div class="flex items-center justify-between gap-3 mb-2">'
      + '<span class="text-sm font-medium text-gfm-dark">Active weight sum</span>'
      + '<span class="text-2xl font-bold ' + color + '">' + sum + '<span class="text-base font-normal text-gfm-gray"> / 100</span></span>'
      + '</div>'
      + '<div class="h-2 bg-gray-100 rounded-full overflow-hidden mb-1.5">'
      + '<div class="h-full ' + bar + ' transition-all" style="width:' + widthPct + '%"></div>'
      + '</div>'
      + '<p class="text-xs text-gfm-gray">' + hint + '</p>';

    var el = document.getElementById('rebalance-sum');
    if (el) el.innerHTML = html;

    var applyBtn = document.getElementById('rebalance-apply-btn');
    if (applyBtn) {
      var dirty = isDraftDirty();
      applyBtn.disabled = !ok || !dirty;
      applyBtn.className = 'flex-1 px-4 py-3 rounded-xl font-medium transition-colors '
        + (applyBtn.disabled ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gfm-green text-white hover:bg-gfm-green-dark');
      applyBtn.textContent = !dirty
        ? 'No changes to apply'
        : ok ? 'Apply Rebalance' : 'Active weights must sum to 100';
    }
  }

  function renderRows() {
    var rows = draft.map(function(row, idx) {
      var disabledStyle = row.status === 'paused' ? 'opacity-50' : '';
      return '<tr class="border-b border-gray-100 last:border-0">'
        + '<td class="py-3 pr-3">'
        + '<div class="flex items-center gap-3">'
        + '<div class="w-9 h-9 rounded-lg bg-gradient-to-br from-gfm-green to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">' + (row.slug || '?').substring(0, 2).toUpperCase() + '</div>'
        + '<div class="min-w-0"><p class="font-medium text-gfm-dark text-sm truncate">' + row.name + '</p>'
        + '<p class="text-xs text-gfm-gray font-mono truncate">' + (row.slug || '') + '</p></div></div></td>'
        + '<td class="py-3 px-2">'
        + '<button type="button" onclick="window.__rebalanceToggleStatus(' + idx + ')" class="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors '
          + (row.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-200 text-gray-600 hover:bg-gray-300') + '">' + row.status + '</button>'
        + '</td>'
        + '<td class="py-3 px-2 ' + disabledStyle + '">'
        + '<div class="flex items-center gap-2">'
        + '<input type="number" min="0" max="100" step="1" value="' + row.weightPct + '" '
        + (row.status === 'paused' ? 'disabled' : '')
        + ' oninput="window.__rebalanceSetWeight(' + idx + ', this.value)" '
        + ' class="w-20 px-2 py-1.5 border-2 border-gray-200 rounded-lg focus:border-gfm-green focus:outline-none text-sm font-mono text-right">'
        + '<span class="text-xs text-gfm-gray">%</span></div></td>'
        + '<td class="py-3 pl-2 text-right">' + deltaBadge(row) + '</td>'
        + '</tr>';
    }).join('');

    var tbody = document.getElementById('rebalance-tbody');
    if (tbody) tbody.innerHTML = rows;
    renderSumIndicator();
  }

  window.__rebalanceSetWeight = function(idx, val) {
    var n = parseInt(val, 10);
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n > 100) n = 100;
    draft[idx].weightPct = n;
    renderSumIndicator();
  };

  window.__rebalanceToggleStatus = function(idx) {
    var row = draft[idx];
    row.status = row.status === 'active' ? 'paused' : 'active';
    if (row.status === 'paused') row.weightPct = 0;
    renderRows();
  };

  window.__rebalanceDistributeEvenly = function() {
    var actives = draft.filter(function(r) { return r.status === 'active'; });
    if (actives.length === 0) { showToast('Activate at least one store first', 'warning'); return; }
    var base = Math.floor(100 / actives.length);
    var remainder = 100 - base * actives.length;
    actives.forEach(function(r, i) { r.weightPct = base + (i < remainder ? 1 : 0); });
    renderRows();
  };

  window.__rebalanceResetDraft = function() {
    draft.forEach(function(r) { r.status = r.currentStatus; r.weightPct = r.currentWeightPct; });
    renderRows();
  };

  window.openRebalanceModal = function() {
    if (typeof stores === 'undefined' || stores.length === 0) {
      showToast('No stores loaded yet', 'warning');
      return;
    }
    draft = snapshotStores();
    document.getElementById('rebalance-modal').classList.remove('hidden');
    renderRows();
  };

  window.closeRebalanceModal = function() {
    document.getElementById('rebalance-modal').classList.add('hidden');
  };

  window.submitRebalance = async function() {
    var sum = activeDraftSum();
    if (sum !== 100 && sum !== 0) {
      showToast('Active weights must sum to 100, got ' + sum + '%', 'warning');
      return;
    }
    if (!isDraftDirty()) {
      showToast('No changes to apply', 'info');
      return;
    }

    var payload = draft.map(function(r) {
      return { id: r.id, weightPct: r.weightPct, status: r.status };
    });

    var btn = document.getElementById('rebalance-apply-btn');
    var prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Applying...';

    try {
      var res = await fetch('/api/admin/stores/rebalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: payload })
      });
      var result = await res.json();
      if (res.ok && result.success) {
        showToast('Rebalance applied (' + payload.length + ' stores)', 'success');
        window.closeRebalanceModal();
        if (typeof loadStores === 'function') loadStores();
      } else {
        showToast('Rebalance failed: ' + (result.error || 'unknown error'), 'error');
      }
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  };

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') window.closeRebalanceModal();
  });
})();
