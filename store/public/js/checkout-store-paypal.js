(function() {
  var sc = window.StoreCheckout;
  if (!sc) return;

  var submitBtn = document.getElementById('submit-payment');
  var errorEl = document.getElementById('payment-error');
  var spinnerEl = document.getElementById('payment-spinner');
  var btnText = document.getElementById('btn-text');
  var loadingEl = document.getElementById('payment-loading');

  btnText.textContent = 'Pay ' + sc.symbol + sc.total.toFixed(2);
  submitBtn.setAttribute('data-paytext', 'Pay ' + sc.symbol + sc.total.toFixed(2));

  function showOrderComplete() {
    localStorage.removeItem(sc.CART_KEY);
    document.querySelector('main').innerHTML = '<div class="text-center py-20">' +
      '<div class="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">' +
        '<svg class="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>' +
      '</div>' +
      '<h2 class="text-xl font-bold text-gray-900 mb-2">Order Complete</h2>' +
      '<p class="text-sm text-gray-400 mb-6">Thank you for your purchase.</p>' +
      '<a href="/" class="btn-primary inline-block text-white px-6 py-2.5 rounded-lg font-semibold text-sm">Back to Shop</a>' +
    '</div>';
  }

  async function createStoreOrder() {
    var resp = await fetch('/api/paypal/store-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: sc.items })
    });
    var order = await resp.json();
    if (order.orderId) return order.orderId;
    throw new Error(order.error || 'Failed to create order');
  }

  async function captureOrder(orderID) {
    var resp = await fetch('/api/paypal/orders/' + orderID + '/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return await resp.json();
  }

  async function initPayPalCheckout() {
    var resp = await fetch('/api/paypal/client-id');
    var data = await resp.json();
    await new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://www.paypal.com/sdk/js?client-id=' + data.clientId + '&components=buttons,card-fields&currency=' + (sc.currency || 'gbp').toUpperCase();
      s.setAttribute('data-sdk-integration-source', 'developer-studio');
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    if (loadingEl) loadingEl.classList.add('hidden');

    var cardFields = paypal.CardFields({
      style: {
        input: { 'font-size': '15px', 'font-family': "'Inter', system-ui, sans-serif", 'color': '#1f2937', 'border': '1px solid #e5e7eb', 'border-radius': '8px', 'padding': '0 12px', 'height': '42px', 'line-height': '42px' },
        ':focus': { 'border': '1px solid #00b964', 'box-shadow': '0 0 0 3px rgba(0,185,100,0.1)' },
        '.invalid': { 'border': '1px solid #ef4444' },
      },
      createOrder: createStoreOrder,
      onApprove: async function(data) {
        var result = await captureOrder(data.orderID);
        if (result.success) { showOrderComplete(); }
        else { errorEl.textContent = result.error || 'Payment failed'; errorEl.classList.remove('hidden'); }
      },
      onError: function(err) {
        errorEl.textContent = err.message || 'Payment failed';
        errorEl.classList.remove('hidden');
      }
    });

    if (cardFields.isEligible()) {
      var numEl = document.getElementById('card-number-field');
      var expEl = document.getElementById('card-expiry-field');
      var cvvEl = document.getElementById('card-cvv-field');
      var nameEl = document.getElementById('card-name-field');

      if (numEl) await cardFields.NumberField({ placeholder: '1234 5678 9012 3456' }).render('#card-number-field');
      if (expEl) await cardFields.ExpiryField({ placeholder: 'MM/YY' }).render('#card-expiry-field');
      if (cvvEl) await cardFields.CVVField({ placeholder: 'CVV' }).render('#card-cvv-field');
      if (nameEl) { await new Promise(function(r) { setTimeout(r, 100); }); await cardFields.NameField({ placeholder: 'Cardholder Name' }).render('#card-name-field'); }

      submitBtn.disabled = false;
    }

    if (window.paypal && window.paypal.Buttons) {
      var ppContainer = document.getElementById('paypal-button-container');
      if (ppContainer) {
        await paypal.Buttons({
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal', height: 44 },
          fundingSource: paypal.FUNDING.PAYPAL,
          createOrder: createStoreOrder,
          onApprove: async function(data) {
            var result = await captureOrder(data.orderID);
            if (result.success) { showOrderComplete(); }
            else { errorEl.textContent = result.error || 'Payment failed'; errorEl.classList.remove('hidden'); }
          },
          onError: function(err) { errorEl.textContent = err.message || 'Payment failed'; errorEl.classList.remove('hidden'); }
        }).render('#paypal-button-container');
      }
    }

    submitBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      if (submitBtn.disabled) return;
      submitBtn.disabled = true;
      spinnerEl.classList.remove('hidden');
      btnText.textContent = 'Processing...';
      errorEl.classList.add('hidden');
      try {
        await cardFields.submit();
      } catch(err) {
        errorEl.textContent = err.message || 'Card payment failed';
        errorEl.classList.remove('hidden');
        submitBtn.disabled = false;
        spinnerEl.classList.add('hidden');
        btnText.textContent = submitBtn.dataset.paytext;
      }
    });
  }

  setTimeout(initPayPalCheckout, 800);
})();
