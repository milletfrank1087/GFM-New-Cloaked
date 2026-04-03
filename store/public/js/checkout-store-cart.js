(function() {
  var CART_KEY = 'store_cart';
  var items = [];
  try { items = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch(e) {}

  var emptyEl = document.getElementById('empty-cart');
  var contentEl = document.getElementById('checkout-content');

  if (!items.length) {
    emptyEl.classList.remove('hidden');
    contentEl.style.display = 'none';
    return;
  }

  var orderItemsEl = document.getElementById('order-items');
  var orderTotalEl = document.getElementById('order-total');
  var total = 0;

  items.forEach(function(item) {
    total += item.price * item.quantity;
    orderItemsEl.innerHTML += '<div class="flex items-center gap-3">' +
      '<div class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">' +
        '<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V5.25a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5V19.5a1.5 1.5 0 001.5 1.5z"/></svg>' +
      '</div>' +
      '<div class="flex-1 min-w-0">' +
        '<p class="text-xs font-medium text-gray-900 truncate">' + item.name + '</p>' +
        '<p class="text-[10px] text-gray-400">Qty: ' + item.quantity + '</p>' +
      '</div>' +
      '<span class="text-xs font-semibold text-gray-900">&pound;' + (item.price * item.quantity).toFixed(2) + '</span>' +
    '</div>';
  });

  orderTotalEl.textContent = '\u00a3' + total.toFixed(2);

  window.StoreCheckout = { items: items, total: total, CART_KEY: CART_KEY };
})();
