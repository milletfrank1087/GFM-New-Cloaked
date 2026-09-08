(function() {
  var sc = window.StoreCheckout;
  if (!sc) return;

  var stripeKey = document.getElementById('stripe-key')?.value;
  if (!stripeKey || typeof Stripe === 'undefined') return;

  var stripe = Stripe(stripeKey);
  var elements, paymentElement;

  var submitBtn = document.getElementById('submit-payment');
  var errorEl = document.getElementById('payment-error');
  var spinnerEl = document.getElementById('payment-spinner');
  var btnText = document.getElementById('btn-text');
  var loadingEl = document.getElementById('payment-loading');

  var decimals = parseInt(document.getElementById('payment-decimals')?.value || '2', 10);
  var multiplier = Math.pow(10, decimals);
  var position = (document.getElementById('payment-symbol-position')?.value || 'before');
  var paytextAmount = (position === 'after')
    ? sc.total.toFixed(decimals) + ' ' + sc.symbol
    : sc.symbol + sc.total.toFixed(decimals);

  btnText.textContent = 'Pay ' + paytextAmount;
  submitBtn.setAttribute('data-paytext', 'Pay ' + paytextAmount);

  setTimeout(function() {
    elements = stripe.elements({
      mode: 'payment',
      amount: Math.round(sc.total * multiplier),
      currency: sc.currency,
      payment_method_types: ['card'],
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#00b964',
          borderRadius: '8px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          spacingUnit: '4px'
        },
        rules: {
          '.Input': { border: '1px solid #e5e7eb', boxShadow: 'none', padding: '10px 12px' },
          '.Input:focus': { border: '1px solid #00b964', boxShadow: '0 0 0 3px rgba(0,185,100,0.08)' },
          '.Tab': { border: '1px solid #e5e7eb', boxShadow: 'none' },
          '.Tab--selected': { border: '1px solid #00b964', boxShadow: '0 0 0 1px #00b964' }
        }
      }
    });

    paymentElement = elements.create('payment', { layout: 'tabs' });
    paymentElement.mount('#payment-element');
    paymentElement.on('ready', function() {
      if (loadingEl) loadingEl.classList.add('hidden');
      submitBtn.disabled = false;
    });
  }, 1200);

  submitBtn.addEventListener('click', async function(e) {
    e.preventDefault();
    if (submitBtn.disabled) return;

    var email = document.getElementById('store-email').value.trim();
    var name = document.getElementById('store-name').value.trim();

    if (!email || !email.includes('@')) {
      errorEl.textContent = 'Please enter a valid email address.';
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    spinnerEl.classList.remove('hidden');
    btnText.textContent = 'Processing...';
    errorEl.classList.add('hidden');

    var submitResult = await elements.submit();
    if (submitResult.error) {
      errorEl.textContent = submitResult.error.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      spinnerEl.classList.add('hidden');
      btnText.textContent = submitBtn.dataset.paytext;
      return;
    }

    try {
      var res = await fetch('/api/store-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: sc.items })
      });
      var data = await res.json();
      if (!data.clientSecret) throw new Error(data.error || 'Payment setup failed');

      var confirmResult = await stripe.confirmPayment({
        elements: elements,
        clientSecret: data.clientSecret,
        confirmParams: {
          payment_method_data: {
            billing_details: { name: name || undefined, email: email || undefined }
          }
        },
        redirect: 'if_required'
      });

      if (confirmResult.error) {
        errorEl.textContent = confirmResult.error.message;
        errorEl.classList.remove('hidden');
        submitBtn.disabled = false;
        spinnerEl.classList.add('hidden');
        btnText.textContent = submitBtn.dataset.paytext;
        return;
      }

      localStorage.removeItem(sc.CART_KEY);
      document.querySelector('main').innerHTML = '<div class="text-center py-20">' +
        '<div class="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">' +
          '<svg class="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>' +
        '</div>' +
        '<h2 class="text-xl font-bold text-gray-900 mb-2">Order Complete</h2>' +
        '<p class="text-sm text-gray-400 mb-6">Thank you for your purchase. A confirmation email with download links will arrive shortly.</p>' +
        '<a href="/" class="btn-primary inline-block text-white px-6 py-2.5 rounded-lg font-semibold text-sm">Back to Shop</a>' +
      '</div>';
    } catch(err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      spinnerEl.classList.add('hidden');
      btnText.textContent = submitBtn.dataset.paytext;
    }
  });
})();
