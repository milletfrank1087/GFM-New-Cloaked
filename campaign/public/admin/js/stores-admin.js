var stores = [];

function showToast(message, type) {
  type = type || 'info';
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  var colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500', warning: 'bg-yellow-500' };
  toast.className = (colors[type] || colors.info) + ' text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 transform translate-x-full transition-transform duration-300 max-w-sm';
  toast.innerHTML = '<span class="flex-1 text-sm font-medium">' + message + '</span><button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white text-lg leading-none">&times;</button>';
  container.appendChild(toast);
  setTimeout(function() { toast.classList.remove('translate-x-full'); }, 10);
  setTimeout(function() { toast.classList.add('translate-x-full'); setTimeout(function() { toast.remove(); }, 300); }, 5000);
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status) {
  var map = {
    active: 'bg-green-100 text-green-700',
    paused: 'bg-gray-200 text-gray-600'
  };
  return '<span class="px-2.5 py-1 rounded-full text-xs font-semibold ' + (map[status] || 'bg-gray-100 text-gray-600') + '">' + (status || 'unknown') + '</span>';
}

function weightBadge(pct) {
  if (!pct) return '<span class="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">0%</span>';
  var cls = pct >= 50 ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';
  return '<span class="px-2 py-0.5 ' + cls + ' rounded-full text-xs font-medium">' + pct + '% share</span>';
}

function processorBadge(proc) {
  if (proc === 'paypal') return '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">PayPal</span>';
  return '<span class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">Stripe</span>';
}

function volumeBar(pct) {
  var color = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-gfm-green';
  return '<div class="w-full bg-gray-200 rounded-full h-2.5"><div class="' + color + ' h-2.5 rounded-full transition-all" style="width:' + Math.min(pct, 100) + '%"></div></div>';
}

function activeWeightSum(list) {
  return (list || stores).filter(function(s) { return s.status === 'active'; }).reduce(function(sum, s) { return sum + (s.weightPct || 0); }, 0);
}

async function loadStores() {
  var res = await fetch('/api/admin/stores');
  if (!res.ok) return;
  stores = await res.json();
  renderStores(stores);
  updateSummary(stores);
}

function updateSummary(data) {
  document.getElementById('stat-total-stores').textContent = data.length;
  document.getElementById('stat-active-stores').textContent = data.filter(function(s) { return s.status === 'active'; }).length;
  var sum = activeWeightSum(data);
  var sumEl = document.getElementById('stat-weight-sum');
  if (sumEl) {
    sumEl.textContent = sum + '%';
    sumEl.className = 'text-2xl font-bold ' + (sum === 100 ? 'text-gfm-green' : sum === 0 ? 'text-gfm-gray' : 'text-red-500');
  }
  var monthVol = data.reduce(function(sum, s) { return sum + (s.monthVolume || 0); }, 0);
  var monthTxns = data.reduce(function(sum, s) { return sum + (s.monthTxnCount || 0); }, 0);
  document.getElementById('stat-month-volume').textContent = formatBaseCurrency(monthVol);
  document.getElementById('stat-month-txns').textContent = monthTxns;
}

function renderStores(data) {
  var container = document.getElementById('stores-list');
  if (data.length === 0) {
    container.innerHTML = '<p class="text-gfm-gray text-center py-8">No stores yet. Click "Add Store" to get started.</p>';
    return;
  }

  container.innerHTML = data.map(function(s) {
    var nextStatusValue = s.status === 'active' ? 'paused' : 'active';
    var nextStatusLabel = s.status === 'active' ? 'Pause' : 'Activate';
    var toggleBtnClass = s.status === 'active' ? 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100' : 'text-green-600 bg-green-50 hover:bg-green-100';

    return '<div class="bg-white rounded-2xl shadow-sm overflow-hidden">'
      + '<div class="p-5">'
      + '<div class="flex flex-col lg:flex-row lg:items-center gap-4">'
      + '<div class="flex items-center gap-4 flex-1 min-w-0 cursor-pointer" onclick="showStoreDetail(\'' + s.id + '\')">'
      + '<div class="w-14 h-14 rounded-xl bg-gradient-to-br from-gfm-green to-emerald-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">' + (s.slug || '?').substring(0, 2).toUpperCase() + '</div>'
      + '<div class="min-w-0">'
      + '<div class="flex items-center gap-2 flex-wrap"><p class="font-bold text-gfm-dark text-lg">' + (s.name || s.slug) + '</p>' + processorBadge(s.paymentProcessor) + statusBadge(s.status) + weightBadge(s.weightPct) + '</div>'
      + '<p class="text-sm text-gfm-gray font-mono truncate">' + (s.domain || '-') + '</p>'
      + '</div></div>'
      + '<div class="flex flex-wrap items-center gap-6 lg:gap-8">'
      + '<div class="text-center"><p class="text-xs text-gfm-gray uppercase tracking-wide">Total</p><p class="text-lg font-bold text-gfm-dark">' + formatBaseCurrency(s.totalProcessed) + '</p></div>'
      + '<div class="text-center"><p class="text-xs text-gfm-gray uppercase tracking-wide">Month Net</p><p class="text-lg font-bold text-gfm-green">' + formatBaseCurrency(s.monthNet) + '</p></div>'
      + '<div class="text-center"><p class="text-xs text-gfm-gray uppercase tracking-wide">Txns</p><p class="text-lg font-bold text-gfm-dark">' + s.transactionCount + '</p></div>'
      + '<div class="flex gap-2">'
      + '<button onclick="toggleStatus(\'' + s.id + '\', \'' + nextStatusValue + '\')" class="px-3 py-2 rounded-lg text-xs font-medium ' + toggleBtnClass + '">' + nextStatusLabel + '</button>'
      + '<button onclick="openEditModal(\'' + s.id + '\')" class="px-3 py-2 rounded-lg text-xs font-medium text-gfm-gray bg-gray-100 hover:bg-gray-200">Edit</button>'
      + '<button onclick="confirmDeleteStore(\'' + s.id + '\', \'' + (s.name || s.slug).replace(/'/g, "\\'") + '\')" class="px-3 py-2 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100">Remove</button>'
      + '</div></div></div>'
      + '<div class="mt-4">'
      + '<div class="flex items-center justify-between text-xs text-gfm-gray mb-1"><span>Monthly Volume</span><span>' + formatBaseCurrency(s.monthVolume) + ' / ' + formatBaseCurrency(s.maxMonthlyVolume) + ' (' + s.volumePct.toFixed(1) + '%)</span></div>'
      + volumeBar(s.volumePct)
      + '</div>'
      + '<div class="flex flex-wrap gap-4 mt-3 text-xs text-gfm-gray">'
      + '<span>Created: ' + formatDate(s.createdAt) + '</span>'
      + '<span>Last payment: ' + (s.lastPaymentAt ? formatDate(s.lastPaymentAt) : 'Never') + '</span>'
      + '<span>This month: ' + s.monthTxnCount + ' txns</span>'
      + '</div></div></div>';
  }).join('');
}

async function toggleStatus(id, newStatus) {
  var res = await fetch('/api/admin/stores/' + id + '/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
  var result = await res.json();
  if (result.success) {
    showToast('Store status changed to ' + newStatus + (newStatus === 'paused' ? ' (weight reset to 0)' : ''), 'success');
    loadStores();
  } else {
    showToast('Failed: ' + (result.error || 'Unknown error'), 'error');
  }
}

async function showStoreDetail(id) {
  document.getElementById('detail-modal').classList.remove('hidden');
  document.getElementById('detail-content').innerHTML = '<p class="text-gfm-gray">Loading...</p>';

  var res = await fetch('/api/admin/stores/' + id);
  if (!res.ok) {
    document.getElementById('detail-content').innerHTML = '<p class="text-red-500">Failed to load store details</p>';
    return;
  }

  var s = await res.json();

  document.getElementById('detail-content').innerHTML = '<div class="space-y-6">'
    + '<div class="flex items-start justify-between pb-4 border-b border-gray-100">'
    + '<div class="flex items-center gap-4">'
    + '<div class="w-16 h-16 rounded-xl bg-gradient-to-br from-gfm-green to-emerald-600 flex items-center justify-center text-white text-2xl font-bold">' + (s.slug || '?').substring(0, 2).toUpperCase() + '</div>'
    + '<div><h3 class="text-xl font-bold text-gfm-dark">' + (s.name || s.slug) + '</h3>'
    + '<p class="text-gfm-gray font-mono text-sm">' + (s.domain || '-') + '</p>'
    + '<div class="mt-2 flex gap-2">' + processorBadge(s.paymentProcessor) + statusBadge(s.status) + weightBadge(s.weightPct) + '</div></div></div></div>'
    + '<div class="grid grid-cols-2 md:grid-cols-4 gap-4">'
    + '<div class="bg-gfm-green-light rounded-xl p-4 text-center"><p class="text-2xl font-bold text-gfm-green">' + formatBaseCurrency(s.stats.totalNet) + '</p><p class="text-xs text-gfm-gray">Total Net</p></div>'
    + '<div class="bg-gray-100 rounded-xl p-4 text-center"><p class="text-2xl font-bold text-gfm-dark">' + formatBaseCurrency(s.stats.totalGross) + '</p><p class="text-xs text-gfm-gray">Total Gross</p></div>'
    + '<div class="bg-gray-100 rounded-xl p-4 text-center"><p class="text-2xl font-bold text-red-500">' + formatBaseCurrency(s.stats.totalFees) + '</p><p class="text-xs text-gfm-gray">Total Fees</p></div>'
    + '<div class="bg-gray-100 rounded-xl p-4 text-center"><p class="text-2xl font-bold text-gfm-dark">' + s.stats.paymentCount + '</p><p class="text-xs text-gfm-gray">Payments</p></div></div>'
    + '<div><h4 class="font-semibold text-gfm-dark mb-3">Store Info</h4>'
    + '<div class="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">'
    + '<div><span class="text-gfm-gray">Slug:</span> <span class="font-mono">' + s.slug + '</span></div>'
    + '<div><span class="text-gfm-gray">Weight:</span> <span class="font-medium">' + (s.weightPct || 0) + '% of revenue</span></div>'
    + '<div><span class="text-gfm-gray">Max Monthly:</span> <span class="font-medium">' + formatBaseCurrency(s.maxMonthlyVolume) + '</span></div>'
    + '<div><span class="text-gfm-gray">Avg Transaction:</span> <span class="font-medium">' + formatBaseCurrency(s.stats.avgTransaction) + '</span></div>'
    + '<div><span class="text-gfm-gray">Failures:</span> <span class="font-medium text-red-500">' + s.stats.failureCount + '</span></div>'
    + '<div><span class="text-gfm-gray">Created:</span> <span class="font-medium">' + formatDate(s.createdAt) + '</span></div>'
    + '<div><span class="text-gfm-gray">Last Used:</span> <span class="font-medium">' + (s.lastUsedAt ? formatDate(s.lastUsedAt) : 'Never') + '</span></div>'
    + '</div></div>'
    + '<div><h4 class="font-semibold text-gfm-dark mb-3">Recent Payments</h4>'
    + '<div class="space-y-2">'
    + (s.payments.length === 0 ? '<p class="text-gfm-gray text-sm">No payments yet</p>' : '')
    + s.payments.map(function(p) {
      return '<div class="bg-gray-50 rounded-xl p-4 flex items-center justify-between">'
        + '<div><p class="font-medium text-gfm-dark">' + formatBaseCurrency(p.total) + (p.tip ? ' <span class="text-xs text-blue-600">+' + formatBaseCurrency(p.tip) + ' tip</span>' : '') + '</p>'
        + '<p class="text-xs text-gfm-gray">' + (p.cardBrand ? p.cardBrand + (p.cardLast4 ? ' ****' + p.cardLast4 : '') : p.processor) + ' &bull; ' + (p.email || 'No email') + ' &bull; ' + formatDate(p.createdAt) + '</p></div>'
        + '<div class="text-right"><span class="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">' + p.status + '</span>'
        + '<p class="text-xs text-red-500 mt-1">-' + formatBaseCurrency(p.fee) + ' fee</p></div></div>';
    }).join('')
    + '</div></div>'
    + (s.recentFailures.length > 0 ? '<div><h4 class="font-semibold text-red-600 mb-3">Recent Failures</h4><div class="space-y-2">'
      + s.recentFailures.map(function(f) {
        return '<div class="bg-red-50 rounded-xl p-3 text-sm"><p class="font-medium text-red-700">' + (f.errorType || 'Error') + ': ' + (f.errorCode || '') + '</p>'
          + '<p class="text-red-600 text-xs">' + (f.errorMessage || '') + '</p>'
          + '<p class="text-red-400 text-xs mt-1">' + formatDate(f.createdAt) + ' &bull; ' + formatBaseCurrency(f.amount) + '</p></div>';
      }).join('')
      + '</div></div>' : '')
    + '</div>';
}

function closeDetailModal() { document.getElementById('detail-modal').classList.add('hidden'); }
function openAddModal() { document.getElementById('add-modal').classList.remove('hidden'); }
function closeAddModal() { document.getElementById('add-modal').classList.add('hidden'); }

function checkWeightSumWarning(addingPct) {
  var current = activeWeightSum();
  var newSum = current + (addingPct || 0);
  if (newSum !== 100) {
    return confirm('Active store weights will sum to ' + newSum + '%, not 100%. Continue anyway?');
  }
  return true;
}

async function submitAddStore() {
  var slug = document.getElementById('add-slug').value.trim();
  var domain = document.getElementById('add-domain').value.trim();
  var name = document.getElementById('add-name').value.trim();
  var processor = document.getElementById('add-processor').value;
  var maxVol = parseFloat(document.getElementById('add-max-volume').value) || 100000;
  var status = document.getElementById('add-status').value;
  var weightPct = parseInt(document.getElementById('add-weight').value, 10) || 0;

  if (!slug || !domain || !name) { showToast('All fields are required', 'warning'); return; }
  if (status === 'active' && !checkWeightSumWarning(weightPct)) return;

  var btn = document.getElementById('add-btn');
  btn.disabled = true; btn.textContent = 'Creating...';

  try {
    var res = await fetch('/api/admin/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slug, domain: domain, name: name, paymentProcessor: processor, maxMonthlyVolume: maxVol, status: status, weightPct: weightPct })
    });
    var result = await res.json();
    if (result.success) {
      showToast('Store "' + name + '" created', 'success');
      closeAddModal();
      document.getElementById('add-slug').value = '';
      document.getElementById('add-domain').value = '';
      document.getElementById('add-name').value = '';
      loadStores();
    } else {
      showToast('Failed: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Create Store'; }
}

function openEditModal(id) {
  var s = stores.find(function(st) { return st.id === id; });
  if (!s) return;
  document.getElementById('edit-id').value = s.id;
  document.getElementById('edit-name').value = s.name || '';
  document.getElementById('edit-domain').value = s.domain || '';
  document.getElementById('edit-max-volume').value = s.maxMonthlyVolume || 100000;
  document.getElementById('edit-weight').value = s.weightPct || 0;
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() { document.getElementById('edit-modal').classList.add('hidden'); }

async function submitEditStore() {
  var id = document.getElementById('edit-id').value;
  var name = document.getElementById('edit-name').value.trim();
  var domain = document.getElementById('edit-domain').value.trim();
  var maxVol = parseFloat(document.getElementById('edit-max-volume').value);
  var weightPct = parseInt(document.getElementById('edit-weight').value, 10) || 0;

  var current = stores.find(function(st) { return st.id === id; });
  if (current && current.status === 'active') {
    var others = stores.filter(function(s) { return s.id !== id && s.status === 'active'; }).reduce(function(sum, s) { return sum + (s.weightPct || 0); }, 0);
    if (others + weightPct !== 100) {
      if (!confirm('Active store weights will sum to ' + (others + weightPct) + '%, not 100%. Continue?')) return;
    }
  }

  var btn = document.getElementById('edit-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    var res = await fetch('/api/admin/stores/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, domain: domain, maxMonthlyVolume: maxVol, weightPct: weightPct })
    });
    var result = await res.json();
    if (result.success) {
      showToast('Store updated', 'success');
      closeEditModal();
      loadStores();
    } else {
      showToast('Failed: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
}

function confirmDeleteStore(id, name) {
  document.getElementById('delete-store-id').value = id;
  document.getElementById('delete-store-name').textContent = name;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() { document.getElementById('delete-modal').classList.add('hidden'); }

async function executeDeleteStore() {
  var id = document.getElementById('delete-store-id').value;
  var btn = document.getElementById('delete-btn');
  btn.disabled = true; btn.textContent = 'Removing...';

  try {
    var res = await fetch('/api/admin/stores/' + id, { method: 'DELETE' });
    var result = await res.json();
    if (result.success) {
      showToast('Store removed' + (result.method === 'soft-delete' ? ' (paused, weight zeroed)' : ''), 'success');
      closeDeleteModal();
      loadStores();
    } else {
      showToast('Failed: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Remove Store'; }
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeDetailModal(); closeAddModal(); closeEditModal(); closeDeleteModal(); }
});

document.getElementById('add-name').addEventListener('input', function(e) {
  var slug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  document.getElementById('add-slug').value = slug;
});

setInterval(loadStores, 60000);

loadCurrencyConfig().then(function() { loadStores(); });
