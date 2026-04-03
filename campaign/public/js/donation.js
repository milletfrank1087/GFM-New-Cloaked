let selectedAmount = 50;
let donationType = 'one-time';
let inCheckoutPhase = false;
let isRedirecting = false;

function initDonation() {
  applyPresetAmounts();
  initDonationTypeToggle();
  initAmountButtons();
  initCustomAmountInput();
  initTipSelect();
  initPhaseNavigation();
  initAbandonmentTracking();
  handleDonatedReturn();
}

function handleDonatedReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('status') === 'complete') {
    window.history.replaceState({}, '', window.location.pathname);

    if (typeof Tracking !== 'undefined') {
      try {
        const storedEventId = sessionStorage.getItem('_purchase_event_id');
        const storedAmount = parseFloat(sessionStorage.getItem('_purchase_amount') || '0');
        const storedCurrency = sessionStorage.getItem('_purchase_currency') || 'EUR';

        if (storedEventId && storedAmount > 0) {
          Tracking.trackPurchase({
            value: storedAmount,
            currency: storedCurrency,
            contentName: 'One-time Donation',
            contentType: 'product'
          }, storedEventId);
        }

        sessionStorage.removeItem('_purchase_event_id');
        sessionStorage.removeItem('_purchase_amount');
        sessionStorage.removeItem('_purchase_currency');
      } catch (e) {}
    }

    setTimeout(() => {
      showThankYouOverlay();
    }, 300);
  }
}

function applyPresetAmounts() {
  if (typeof currency === 'undefined' || !currency.loaded) return;
  const presets = currency.config.presetAmounts;
  const defaultAmt = currency.config.defaultAmount;
  if (!presets || !presets.length) return;

  const symbol = currency.getSymbol();
  const position = currency.config.position;
  const amountBtns = document.querySelectorAll('.amount-btn');

  amountBtns.forEach((btn, i) => {
    if (i < presets.length) {
      const amt = presets[i];
      btn.dataset.amount = amt;
      btn.innerHTML = position === 'after'
        ? `${amt.toLocaleString()}<span data-currency-symbol>${symbol}</span>`
        : `<span data-currency-symbol>${symbol}</span>${amt.toLocaleString()}`;

      btn.classList.remove('active', 'border-gfm-green', 'bg-gfm-green-light', 'text-gfm-green');
      if (amt === defaultAmt) {
        btn.classList.add('active', 'border-gfm-green', 'bg-gfm-green-light', 'text-gfm-green');
      }
    }
  });

  selectedAmount = defaultAmt || presets[2] || 50;

  const symbolBefore = document.querySelector('.currency-symbol-before');
  const symbolAfterEl = document.querySelector('.currency-symbol-after');
  const customInput = document.getElementById('modal-custom-amount');
  if (position === 'after' && symbolBefore && symbolAfterEl && customInput) {
    symbolBefore.classList.add('hidden');
    symbolAfterEl.textContent = symbol;
    symbolAfterEl.classList.remove('hidden');
    customInput.classList.remove('pl-10');
    customInput.classList.add('pl-4', 'pr-10');
  }
}

function initAbandonmentTracking() {
  window.addEventListener('beforeunload', () => {
    if (inCheckoutPhase && !isRedirecting && typeof Tracking !== 'undefined') {
      const blob = new Blob([JSON.stringify({
        eventType: 'checkout_abandon',
        amount: selectedAmount,
        details: 'Page unload',
        clientLocation: Tracking.getClientLocation ? Tracking.getClientLocation() : null
      })], { type: 'application/json' });
      navigator.sendBeacon('/api/track/payment-event', blob);
    }
  });
}

function initDonationTypeToggle() {
  const donationTypeBtns = document.querySelectorAll('.donation-type-btn');
  donationTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      donationTypeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      donationType = btn.dataset.type;
    });
  });
}

function initAmountButtons() {
  const amountBtns = document.querySelectorAll('.amount-btn');
  amountBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const container = btn.closest('.modal-content') || document;
      container.querySelectorAll('.amount-btn').forEach(b => {
        b.classList.remove('active', 'border-gfm-green', 'bg-gfm-green-light', 'text-gfm-green');
      });
      btn.classList.add('active', 'border-gfm-green', 'bg-gfm-green-light', 'text-gfm-green');
      selectedAmount = parseInt(btn.dataset.amount);

      const customInput = container.querySelector('#modal-custom-amount');
      if (customInput) customInput.value = '';
    });
  });
}

function initCustomAmountInput() {
  const customInputs = document.querySelectorAll('#modal-custom-amount');
  customInputs.forEach(input => {
    input.addEventListener('input', () => {
      if (input.value) {
        const container = input.closest('.modal-content') || document;
        container.querySelectorAll('.amount-btn').forEach(b => {
          b.classList.remove('active', 'border-gfm-green', 'bg-gfm-green-light', 'text-gfm-green');
        });
        selectedAmount = parseInt(input.value) || 0;
      }
    });
  });
}

function initTipSelect() {
  const tipSelect = document.getElementById('modal-tip-select');
  if (tipSelect) {
    tipSelect.addEventListener('change', () => {
      if (typeof updateTotalDisplay === 'function') {
        updateTotalDisplay();
      }
    });
  }
}

function getTipAmount() {
  const tipSelect = document.getElementById('modal-tip-select');
  if (!tipSelect) return 0;
  const tipPercent = parseInt(tipSelect.value) || 0;
  return Math.round(selectedAmount * tipPercent / 100 * 100) / 100;
}

async function initDonationRedirect() {
  if (isRedirecting) return;

  const continueBtn = document.getElementById('continue-to-payment-btn');
  if (continueBtn) {
    continueBtn.disabled = true;
  }

  isRedirecting = true;
  showRedirectOverlay();

  const tipAmount = getTipAmount();
  const isAnonymous = document.getElementById('modal-anonymous')?.checked || false;
  const donorEmail = document.getElementById('modal-donor-email')?.value?.trim() || null;

  const tracking = {};
  if (typeof Tracking !== 'undefined') {
    const td = Tracking.getTrackingData();
    Object.assign(tracking, {
      fbp: td.fbp || null,
      fbc: td.fbc || null,
      ttp: td.ttp || null,
      ttclid: td.ttclid || null,
      fbclid: td.fbclid || null,
      sourceUrl: td.sourceUrl || window.location.href,
      referrer: td.referrer || document.referrer || null,
      utm_source: td.utm_source || null,
      utm_medium: td.utm_medium || null,
      utm_campaign: td.utm_campaign || null,
      utm_content: td.utm_content || null,
      utm_term: td.utm_term || null,
      ref_code: td.ref_code || null
    });

    const purchaseEventId = Tracking.generateEventId('Purchase');
    tracking.eventId = purchaseEventId;
    try {
      sessionStorage.setItem('_purchase_event_id', purchaseEventId);
      sessionStorage.setItem('_purchase_amount', String(selectedAmount));
      sessionStorage.setItem('_purchase_currency', (typeof currency !== 'undefined' && currency.config) ? currency.config.code : 'EUR');
    } catch (e) {}
  }

  try {
    const response = await fetch('/api/init-donation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: selectedAmount,
        tip: tipAmount,
        isAnonymous,
        donorEmail,
        tracking
      })
    });

    const data = await response.json();

    if (data.redirectUrl) {
      window.location.replace(data.redirectUrl);
    } else {
      throw new Error(data.error || 'Failed to initialize donation');
    }
  } catch (error) {
    isRedirecting = false;
    hideRedirectOverlay();
    if (continueBtn) {
      continueBtn.disabled = false;
    }
    showNotification(error.message || 'Something went wrong. Please try again.', 'error');
  }
}

function showRedirectOverlay() {
  const existing = document.getElementById('redirect-overlay');
  if (existing) existing.remove();

  const t = (key, fallback) => (typeof i18n !== 'undefined' && i18n.loaded) ? i18n.t(key) : fallback;

  const overlay = document.createElement('div');
  overlay.id = 'redirect-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,0.97);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:99999;opacity:0;transition:opacity 0.25s ease';
  overlay.innerHTML = `
    <div style="text-align:center;max-width:320px;padding:24px">
      <div style="width:56px;height:56px;border-radius:50%;background:#e8f8f0;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00b964" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      </div>
      <div style="width:36px;height:36px;border:3px solid #e5e7eb;border-top-color:#00b964;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px"></div>
      <p style="font-size:16px;font-weight:700;color:#333;margin:0 0 6px;font-family:Inter,system-ui,sans-serif">${t('donation.redirect.title', 'Preparing your payment...')}</p>
      <p style="font-size:13px;color:#767676;margin:0;font-family:Inter,system-ui,sans-serif">${t('donation.redirect.subtitle', 'Redirecting to secure payment page')}</p>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });
}

function hideRedirectOverlay() {
  const overlay = document.getElementById('redirect-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 250);
  }
}

function initPhaseNavigation() {
  const continueBtn = document.getElementById('continue-to-payment-btn');

  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      if (selectedAmount < 1) {
        showNotification('Please select or enter a donation amount', 'error');
        return;
      }

      if (typeof Tracking !== 'undefined') {
        Tracking.trackInitiateCheckout({ value: selectedAmount, contentType: 'donation' });
      }

      inCheckoutPhase = true;
      initDonationRedirect();
    });
  }
}

function resetDonationModal() {
  const phase1 = document.getElementById('modal-phase-1');
  const phase2 = document.getElementById('modal-phase-2');
  const successPhase = document.getElementById('modal-phase-success');
  const closeBtn = document.querySelector('.close-modal');

  if (phase1) phase1.classList.remove('hidden');
  if (phase2) phase2.classList.add('hidden');
  if (successPhase) successPhase.classList.add('hidden');
  if (closeBtn) closeBtn.classList.remove('hidden');

  inCheckoutPhase = false;
  isRedirecting = false;
  const defaultAmt = (typeof currency !== 'undefined' && currency.config.defaultAmount) || 50;
  selectedAmount = defaultAmt;
  donationType = 'one-time';

  const amountBtns = document.querySelectorAll('.amount-btn');
  amountBtns.forEach(b => {
    b.classList.remove('active', 'border-gfm-green', 'bg-gfm-green-light', 'text-gfm-green');
    if (parseInt(b.dataset.amount) === defaultAmt) {
      b.classList.add('active', 'border-gfm-green', 'bg-gfm-green-light', 'text-gfm-green');
    }
  });

  const customInput = document.getElementById('modal-custom-amount');
  if (customInput) customInput.value = '';

  const emailInput = document.getElementById('modal-donor-email');
  if (emailInput) emailInput.value = '';

  const tipSelect = document.getElementById('modal-tip-select');
  if (tipSelect) tipSelect.value = '15';

  const anonymousCheckbox = document.getElementById('modal-anonymous');
  if (anonymousCheckbox) anonymousCheckbox.checked = false;

  const donationTypeBtns = document.querySelectorAll('.donation-type-btn');
  donationTypeBtns.forEach(b => {
    b.classList.remove('active');
    if (b.dataset.type === 'one-time') b.classList.add('active');
  });

  const continueBtn = document.getElementById('continue-to-payment-btn');
  if (continueBtn) continueBtn.disabled = false;
}

window.resetDonationModal = resetDonationModal;
window.getSelectedAmount = () => selectedAmount;
window.getDonationType = () => donationType;
