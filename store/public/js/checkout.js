const stripeKey = document.getElementById('stripe-key')?.value;
if (!stripeKey) throw new Error('Stripe key missing');

const stripeLocale = document.getElementById('payment-locale')?.value || 'auto';
const stripe = Stripe(stripeKey, { locale: stripeLocale });

const paymentAmountCents = parseInt(document.getElementById('payment-amount')?.value || '0', 10);
const paymentCurrency = (document.getElementById('payment-currency')?.value || 'eur').toLowerCase();
const paymentValueMajor = paymentAmountCents / 100;
const paymentPixelId = document.getElementById('payment-pixel-id')?.value || null;
const localizedEmailError = document.getElementById('locale-email-error')?.value || 'Please enter a valid email address.';

let elements, paymentElement;
let addPaymentInfoFired = false;

function generateEventId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}

function updateAdvancedMatching() {
  if (typeof fbq === 'undefined') return;
  const pixelId = document.getElementById('payment-pixel-id')?.value;
  if (!pixelId) return;
  const emailField = document.getElementById('billing-email');
  const typedEmail = emailField?.value?.trim() || '';
  const donorEmail = document.getElementById('payment-donor-email')?.value || '';
  const email = (typedEmail && typedEmail.includes('@')) ? typedEmail : donorEmail;
  const externalId = document.getElementById('payment-external-id')?.value || '';
  const country = (document.getElementById('payment-country')?.value || '').toLowerCase();
  const am = {};
  if (email) am.em = email.toLowerCase();
  if (externalId) am.external_id = externalId;
  if (country) am.country = country;
  if (Object.keys(am).length === 0) return;
  try { fbq('init', pixelId, am); } catch (_) {}
}

function firePurchaseBrowser() {
  const purchaseEventId = document.getElementById('payment-event-id')?.value;
  if (!purchaseEventId) return;
  updateAdvancedMatching();
  const payload = { value: paymentValueMajor, currency: paymentCurrency.toUpperCase() };
  if (typeof fbq !== 'undefined') {
    try {
      fbq('track', 'Purchase', payload, { eventID: purchaseEventId });
    } catch (_) {}
  }
  if (typeof ttq !== 'undefined') {
    try {
      ttq.track('CompletePayment', { ...payload, event_id: purchaseEventId });
    } catch (_) {}
  }
}

function fireAddPaymentInfo() {
  if (addPaymentInfoFired) return;
  addPaymentInfoFired = true;
  updateAdvancedMatching();
  const eventId = generateEventId('AddPaymentInfo');
  const payload = { value: paymentValueMajor, currency: paymentCurrency.toUpperCase() };
  if (typeof fbq !== 'undefined') {
    try {
      fbq('track', 'AddPaymentInfo', payload, { eventID: eventId });
    } catch (_) {}
  }
  fetch('/api/track-interaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'AddPaymentInfo', eventId, data: payload, sourceUrl: window.location.href })
  }).catch(function() {});
}

async function initCheckout() {
  const submitBtn = document.getElementById('submit-payment');
  const errorEl = document.getElementById('payment-error');
  const spinnerEl = document.getElementById('payment-spinner');
  const btnText = document.getElementById('btn-text');
  const emailInput = document.getElementById('billing-email');
  const nameInput = document.getElementById('billing-name');
  const loadingEl = document.getElementById('payment-loading');

  try {
    elements = stripe.elements({
      mode: 'payment',
      amount: paymentAmountCents,
      currency: paymentCurrency,
      locale: stripeLocale,
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

    paymentElement = elements.create('payment', {
      layout: 'tabs',
      wallets: { applePay: 'auto', googlePay: 'auto' }
    });

    paymentElement.mount('#payment-element');

    paymentElement.on('ready', () => {
      if (loadingEl) loadingEl.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = false;
    });

    paymentElement.on('focus', () => {
      fireAddPaymentInfo();
    });

  } catch (err) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (submitBtn.disabled) return;

      const email = emailInput?.value?.trim() || '';
      const name = nameInput?.value?.trim() || '';

      if (!email || !email.includes('@')) {
        if (errorEl) {
          errorEl.textContent = localizedEmailError;
          errorEl.classList.remove('hidden');
        }
        return;
      }

      submitBtn.disabled = true;
      if (spinnerEl) spinnerEl.classList.remove('hidden');
      if (btnText) btnText.textContent = submitBtn.dataset.processing || 'Processing...';
      if (errorEl) errorEl.classList.add('hidden');

      const submitResult = await elements.submit();
      if (submitResult.error) {
        if (errorEl) {
          errorEl.textContent = submitResult.error.message;
          errorEl.classList.remove('hidden');
        }
        submitBtn.disabled = false;
        if (spinnerEl) spinnerEl.classList.add('hidden');
        if (btnText) btnText.textContent = submitBtn.dataset.paytext || 'Pay';
        return;
      }

      try {
        const response = await fetch('/api/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        const data = await response.json();
        if (!data.clientSecret) throw new Error(data.error || 'Payment setup failed');

        const paymentIntentId = data.paymentIntentId;

        const confirmResult = await stripe.confirmPayment({
          elements,
          clientSecret: data.clientSecret,
          confirmParams: {
            return_url: window.location.origin + '/checkout',
            payment_method_data: {
              billing_details: {
                name: name || undefined,
                email: email || undefined
              }
            }
          },
          redirect: 'if_required'
        });

        if (confirmResult.error) {
          if (errorEl) {
            errorEl.textContent = confirmResult.error.message;
            errorEl.classList.remove('hidden');
          }
          submitBtn.disabled = false;
          if (spinnerEl) spinnerEl.classList.add('hidden');
          if (btnText) btnText.textContent = submitBtn.dataset.paytext || 'Pay';
          return;
        }

        const confirmResponse = await fetch('/api/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId, email, billingName: name })
        });

        const confirmData = await confirmResponse.json();

        if (confirmData.success && confirmData.redirectUrl) {
          firePurchaseBrowser();
          window.location.href = confirmData.redirectUrl;
        } else {
          throw new Error(confirmData.error || 'Payment confirmation failed');
        }
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message;
          errorEl.classList.remove('hidden');
        }
        submitBtn.disabled = false;
        if (spinnerEl) spinnerEl.classList.add('hidden');
        if (btnText) btnText.textContent = submitBtn.dataset.paytext || 'Pay';
      }
    });
  }
}

async function handle3DSReturn() {
  const params = new URLSearchParams(window.location.search);
  const piId = params.get('payment_intent');
  const status = params.get('redirect_status');
  if (!piId || !status) return false;

  window.history.replaceState({}, document.title, window.location.pathname);

  if (status === 'succeeded') {
    try {
      const resp = await fetch('/api/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: piId })
      });
      const data = await resp.json();
      if (data.success && data.redirectUrl) {
        firePurchaseBrowser();
        window.location.href = data.redirectUrl;
      }
    } catch (_) {}
  }
  return true;
}

async function boot() {
  const handled = await handle3DSReturn();
  if (!handled) {
    initCheckout();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
