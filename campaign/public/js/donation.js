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
  const trackedReturn = typeof Tracking !== 'undefined' && typeof Tracking.getCompletedReturn === 'function'
    ? Tracking.getCompletedReturn()
    : null;
  if (params.get('status') === 'complete' || trackedReturn) {
    const urlEid = trackedReturn?.eventId || params.get('eid');
    const urlAmt = trackedReturn?.amount || parseFloat(params.get('amt') || '0');
    const urlCur = trackedReturn?.currency || params.get('cur');
    const cleanUrl = new URL(window.location.href);
    ['status', 'eid', 'amt', 'cur'].forEach((key) => {
      cleanUrl.searchParams.delete(key);
    });
    window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);

    if (typeof Tracking !== 'undefined') {
      try {
        let eventId = urlEid || sessionStorage.getItem('_purchase_event_id');
        let amount = urlAmt > 0 ? urlAmt : parseFloat(sessionStorage.getItem('_purchase_amount') || '0');
        let currencyCode = urlCur || sessionStorage.getItem('_purchase_currency') || 'EUR';

        if (eventId && amount > 0) {
          Tracking.trackPurchase({
            value: amount,
            currency: currencyCode,
            contentName: 'One-time Donation',
            contentType: 'product'
          }, eventId);
        } else {
          console.warn('[Purchase] Missing eventId or amount on return; browser pixel skipped');
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
  let clientLocationPayload = null;
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

    if (donorEmail && typeof Tracking.setUserEmail === 'function') {
      try { await Tracking.setUserEmail(donorEmail); } catch (_) {}
    }

    clientLocationPayload = typeof Tracking.getClientLocation === 'function'
      ? Tracking.getClientLocation()
      : null;

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
        tracking,
        clientLocation: clientLocationPayload
      })
    });

    const data = await response.json();

    if (data.redirectUrl) {
      if (typeof warmStoreConnection === 'function') {
        warmStoreConnection(data.redirectUrl);
      }
      advanceOverlayStep(2);
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
