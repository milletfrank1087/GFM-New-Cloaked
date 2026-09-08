const stripeKey = document.getElementById('stripe-key')?.value;
if (!stripeKey) throw new Error('Stripe key missing');

const stripeLocale = document.getElementById('payment-locale')?.value || 'auto';
const stripe = Stripe(stripeKey, { locale: stripeLocale });

const paymentAmountUnits = parseInt(document.getElementById('payment-amount')?.value || '0', 10);
const paymentCurrency = (document.getElementById('payment-currency')?.value || 'eur').toLowerCase();
const paymentDecimals = parseInt(document.getElementById('payment-decimals')?.value || '2', 10);
const paymentDivisor = Math.pow(10, paymentDecimals);
const paymentValueMajor = paymentAmountUnits / paymentDivisor;
const paymentPixelId = document.getElementById('payment-pixel-id')?.value || null;
const localizedEmailError = document.getElementById('locale-email-error')?.value || 'Please enter a valid email address.';
const cadenceType = document.getElementById('cadence-type')?.value || 'onetime';
const isSubscriptionMode = cadenceType === 'monthly';

let elements, paymentElement;
let addPaymentInfoFired = false;
let consecutiveServerFailures = 0;
let lockedUntilEpochMs = 0;
const MAX_CONSECUTIVE_FAILURES = 3;
const LONG_LOCK_MS = 60 * 1000;

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

function showError(errorEl, message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function resetSubmitUI(submitBtn, spinnerEl, btnText) {
  if (submitBtn) submitBtn.disabled = false;
  if (spinnerEl) spinnerEl.classList.add('hidden');
  if (btnText) btnText.textContent = submitBtn?.dataset?.paytext || 'Pay';
}

function lockSubmit(submitBtn, untilEpochMs) {
  lockedUntilEpochMs = untilEpochMs;
  if (submitBtn) submitBtn.disabled = true;
  setTimeout(function () {
    if (Date.now() >= lockedUntilEpochMs && submitBtn) submitBtn.disabled = false;
  }, Math.max(0, untilEpochMs - Date.now()) + 100);
}

async function initCheckout() {
  const submitBtn = document.getElementById('submit-payment');
  const errorEl = document.getElementById('payment-error');
  const spinnerEl = document.getElementById('payment-spinner');
  const btnText = document.getElementById('btn-text');
  const emailInput = document.getElementById('billing-email');
  const nameInput = document.getElementById('billing-name');
  const loadingEl = document.getElementById('payment-loading');

  const brandPrimaryColor = document.getElementById('payment-brand-color')?.value || '#00b964';

  try {
    elements = stripe.elements({
      mode: isSubscriptionMode ? 'subscription' : 'payment',
      amount: paymentAmountUnits,
      currency: paymentCurrency,
      locale: stripeLocale,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: brandPrimaryColor,
          borderRadius: '8px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          spacingUnit: '4px'
        },
        rules: {
          '.Input': { border: '1px solid #e5e7eb', boxShadow: 'none', padding: '10px 12px' },
          '.Input:focus': { border: `1px solid ${brandPrimaryColor}`, boxShadow: `0 0 0 3px ${brandPrimaryColor}18` },
          '.Tab': { border: '1px solid #e5e7eb', boxShadow: 'none' },
          '.Tab--selected': { border: `1px solid ${brandPrimaryColor}`, boxShadow: `0 0 0 1px ${brandPrimaryColor}` }
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

    window.updateCheckoutAmount = function(newTotalAmount, newTipAmount) {
      const decimals = parseInt(document.getElementById('payment-decimals')?.value || '2', 10);
      const multiplier = Math.pow(10, decimals);
      const newUnits = Math.round(newTotalAmount * multiplier);
      
      const paymentAmountEl = document.getElementById('payment-amount');
      if (paymentAmountEl) paymentAmountEl.value = newUnits;

      const tipEl = document.getElementById('selected-tip-amount');
      if (tipEl) tipEl.value = (typeof newTipAmount === 'number' ? newTipAmount : parseFloat(newTipAmount || 0)).toFixed(decimals);

      if (elements) {
        try {
          elements.update({ amount: newUnits });
        } catch (e) {
          console.warn('elements.update warning:', e);
        }
      }
    };

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

      if (Date.now() < lockedUntilEpochMs) {
        const wait = Math.ceil((lockedUntilEpochMs - Date.now()) / 1000);
        showError(errorEl, (submitBtn.dataset.lockedmsg || 'Please wait a moment before trying again.') + ' (' + wait + 's)');
        return;
      }

      submitBtn.disabled = true;
      if (spinnerEl) spinnerEl.classList.remove('hidden');
      if (btnText) btnText.textContent = submitBtn.dataset.processing || 'Processing...';
      if (errorEl) errorEl.classList.add('hidden');

      const submitResult = await elements.submit();
      if (submitResult.error) {
        showError(errorEl, submitResult.error.message);
        resetSubmitUI(submitBtn, spinnerEl, btnText);
        return;
      }

      const tipInput = document.getElementById('selected-tip-amount');
      const tipVal = tipInput && !isNaN(parseFloat(tipInput.value)) ? parseFloat(tipInput.value) : undefined;

      try {
        const response = await fetch('/api/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tipVal !== undefined ? { tip: tipVal } : {})
        });

        const data = await response.json();
        const isSubscription = data.isSubscription || false;
        const subscriptionId = data.subscriptionId || null;
        if (!data.clientSecret) {
          consecutiveServerFailures += 1;
          const friendly = data.error || 'Payment setup failed';
          if (data.errorClass === 'operator') {
            const lockSec = Math.max(30, Math.min(300, data.retryAfterSeconds || 60));
            lockSubmit(submitBtn, Date.now() + lockSec * 1000);
            showError(errorEl, friendly);
            resetSubmitUI(submitBtn, spinnerEl, btnText);
            submitBtn.disabled = true;
            return;
          }
          if (consecutiveServerFailures >= MAX_CONSECUTIVE_FAILURES) {
            lockSubmit(submitBtn, Date.now() + LONG_LOCK_MS);
            showError(errorEl, submitBtn.dataset.toomany || 'We are having trouble processing payments right now. Please try again in a minute or use a different payment method.');
            resetSubmitUI(submitBtn, spinnerEl, btnText);
            submitBtn.disabled = true;
            return;
          }
          throw new Error(friendly);
        }
        consecutiveServerFailures = 0;

        let paymentIntentId = data.paymentIntentId || null;

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
          showError(errorEl, confirmResult.error.message);
          resetSubmitUI(submitBtn, spinnerEl, btnText);
          return;
        }

        if (!paymentIntentId && confirmResult.paymentIntent) {
          paymentIntentId = confirmResult.paymentIntent.id;
        }

        const confirmResponse = await fetch('/api/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId, email, billingName: name, isSubscription, subscriptionId })
        });

        const confirmData = await confirmResponse.json();

        console.log('[checkout] confirmData:', JSON.stringify(confirmData));
        console.log('[checkout] showSuccessScreen available:', typeof window.showSuccessScreen);
        if (confirmData.success) {
          firePurchaseBrowser();
          if (typeof window.showSuccessScreen === 'function') {
            console.log('[checkout] Calling showSuccessScreen');
            window.showSuccessScreen(confirmData);
          } else if (confirmData.redirectUrl) {
            console.log('[checkout] Redirecting to:', confirmData.redirectUrl);
            window.location.href = confirmData.redirectUrl;
          }
        } else {
          throw new Error(confirmData.error || 'Payment confirmation failed');
        }
      } catch (err) {
        showError(errorEl, err.message);
        resetSubmitUI(submitBtn, spinnerEl, btnText);
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
      if (data.success) {
        firePurchaseBrowser();
        if (typeof window.showSuccessScreen === 'function') {
          window.showSuccessScreen(data);
        } else if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        }
        return true;
      }
    } catch (_) {}
    return true;
  }

  return false;
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
