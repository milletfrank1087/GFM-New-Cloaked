async function showTransactionDetail(id) {
  document.getElementById('detail-modal').classList.remove('hidden');
  document.getElementById('detail-content').innerHTML = '<p class="text-gfm-gray">Loading...</p>';

  const res = await fetch(`/api/admin/transactions/${id}`);
  if (!res.ok) {
    document.getElementById('detail-content').innerHTML = '<p class="text-red-500">Failed to load details</p>';
    return;
  }

  const d = await res.json();

  document.getElementById('detail-content').innerHTML = `
    <div class="space-y-6">
      <!-- Donor Info -->
      <div>
        <h4 class="font-semibold text-gfm-dark mb-3 flex items-center gap-2">
          <svg class="w-5 h-5 text-gfm-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          Donor Information
        </h4>
        <div class="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-4 text-sm">
          <div><span class="text-gfm-gray">Real Name:</span> <span class="font-medium">${d.donor?.name || '-'}</span></div>
          <div><span class="text-gfm-gray">Display As:</span> <span class="font-medium">${d.donor?.displayName || d.donor?.name || '-'}${d.donor?.isAnonymous ? ' <span class="text-xs text-orange-500">(anonymous)</span>' : ''}</span></div>
          ${d.payer?.email ? `<div class="col-span-2"><span class="text-gfm-gray">Payer Email:</span> <span class="font-medium">${d.payer.email}</span></div>` : ''}
          ${d.payer?.id ? `<div class="col-span-2"><span class="text-gfm-gray">Payer ID:</span> <span class="font-mono text-xs">${d.payer.id}</span></div>` : ''}
          ${d.payer?.country ? `<div><span class="text-gfm-gray">Country:</span> <span class="font-medium">${d.payer.country}</span></div>` : ''}
        </div>
      </div>

      <!-- Amount Breakdown -->
      <div>
        <h4 class="font-semibold text-gfm-dark mb-3 flex items-center gap-2">
          <svg class="w-5 h-5 text-gfm-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Amount Breakdown
        </h4>
        <div class="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <div class="flex justify-between"><span class="text-gfm-gray">Donation:</span> <span class="font-medium">${formatCurrency(d.amounts?.donation)}</span></div>
          <div class="flex justify-between"><span class="text-gfm-gray">Tip:</span> <span class="font-medium text-blue-600">+${formatCurrency(d.amounts?.tip)}</span></div>
          <div class="flex justify-between border-t border-gray-200 pt-2"><span class="text-gfm-gray">Gross Total:</span> <span class="font-bold">${formatCurrency(d.amounts?.total)}</span></div>
          <div class="flex justify-between"><span class="text-gfm-gray">Processing Fee:</span> <span class="font-medium text-red-500">-${formatCurrency(d.amounts?.paypalFee)}</span></div>
          <div class="flex justify-between border-t border-gray-200 pt-2"><span class="text-gfm-gray">Net Received:</span> <span class="font-bold text-gfm-green">${formatCurrency(d.amounts?.net)}</span></div>
        </div>
      </div>

      <!-- Card Details -->
      ${d.card?.holderName || d.card?.lastDigits ? `
      <div>
        <h4 class="font-semibold text-gfm-dark mb-3 flex items-center gap-2">
          <svg class="w-5 h-5 text-gfm-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
          Card Details
        </h4>
        <div class="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-4 text-sm">
          ${d.card?.holderName ? `<div class="col-span-2"><span class="text-gfm-gray">Cardholder:</span> <span class="font-medium">${d.card.holderName}</span></div>` : ''}
          ${d.card?.brand ? `<div><span class="text-gfm-gray">Brand:</span> <span class="font-medium">${d.card.brand}</span></div>` : ''}
          ${d.card?.lastDigits ? `<div><span class="text-gfm-gray">Last 4:</span> <span class="font-mono">****${d.card.lastDigits}</span></div>` : ''}
          ${d.card?.expiry ? `<div><span class="text-gfm-gray">Expiry:</span> <span class="font-medium">${d.card.expiry}</span></div>` : ''}
          ${d.card?.type ? `<div><span class="text-gfm-gray">Type:</span> <span class="font-medium">${d.card.type}</span></div>` : ''}
          ${d.card?.network ? `<div><span class="text-gfm-gray">Network:</span> <span class="font-medium">${d.card.network}</span></div>` : ''}
        </div>
      </div>
      ` : ''}

      <!-- Processing Details -->
      <div>
        <h4 class="font-semibold text-gfm-dark mb-3 flex items-center gap-2">
          <svg class="w-5 h-5 text-gfm-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
          Processing Details
        </h4>
        <div class="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-4 text-sm">
          <div><span class="text-gfm-gray">Status:</span> <span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">${d.status || 'completed'}</span></div>
          <div><span class="text-gfm-gray">Method:</span> <span class="font-medium">${d.processing?.source || d.processing?.method || '-'}</span></div>
          ${d.processing?.processorCode ? `<div><span class="text-gfm-gray">Response Code:</span> <span class="font-mono">${d.processing.processorCode}</span></div>` : ''}
          ${d.processing?.cvvCode ? `<div><span class="text-gfm-gray">CVV Check:</span> <span class="font-mono">${d.processing.cvvCode}</span></div>` : ''}
          ${d.processing?.sellerProtection ? `<div><span class="text-gfm-gray">Protection:</span> <span class="font-medium">${d.processing.sellerProtection}</span></div>` : ''}
          ${d.processing?.networkTxnId ? `<div class="col-span-2"><span class="text-gfm-gray">Network Txn:</span> <span class="font-mono text-xs">${d.processing.networkTxnId}</span></div>` : ''}
          ${d.processing?.vaultId ? `<div class="col-span-2"><span class="text-gfm-gray">Vault Token:</span> <span class="font-mono text-xs text-purple-600">${d.processing.vaultId}</span> <span class="text-xs text-purple-500">🔄 Can rebill</span></div>` : ''}
        </div>
      </div>

      <!-- Transaction IDs -->
      <div>
        <h4 class="font-semibold text-gfm-dark mb-3 flex items-center gap-2">
          <svg class="w-5 h-5 text-gfm-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg>
          Transaction IDs
        </h4>
        <div class="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <div><span class="text-gfm-gray">Internal ID:</span> <span class="font-mono text-xs break-all">${d.id || '-'}</span></div>
          <div><span class="text-gfm-gray">Order ID:</span> <span class="font-mono text-xs break-all">${d.orderId || '-'}</span></div>
          <div><span class="text-gfm-gray">Capture ID:</span> <span class="font-mono text-xs break-all">${d.captureId || '-'}</span></div>
        </div>
      </div>

      <!-- Metadata -->
      <div>
        <h4 class="font-semibold text-gfm-dark mb-3 flex items-center gap-2">
          <svg class="w-5 h-5 text-gfm-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Metadata
        </h4>
        <div class="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <div><span class="text-gfm-gray">Campaign:</span> <span class="font-medium">${d.campaign || '-'}</span></div>
          <div><span class="text-gfm-gray">Type:</span> <span class="font-medium">${d.metadata?.donationType || '-'}</span></div>
          <div><span class="text-gfm-gray">IP Address:</span> <span class="font-mono text-xs">${d.metadata?.ipAddress || '-'}</span></div>
          <div><span class="text-gfm-gray">Created:</span> <span class="font-medium">${d.timestamps?.created ? new Date(d.timestamps.created).toLocaleString() : '-'}</span></div>
          ${d.timestamps?.paypalCreated ? `<div><span class="text-gfm-gray">Payment Time:</span> <span class="font-medium">${new Date(d.timestamps.paypalCreated).toLocaleString()}</span></div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.add('hidden');
}
