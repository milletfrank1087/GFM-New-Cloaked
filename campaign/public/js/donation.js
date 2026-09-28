let selectedAmount = 50;
let donationType = 'one-time';
let inCheckoutPhase = false;
let isRedirecting = false;

function isMonthlyDonation() {
  return donationType === 'monthly';
}

function cadenceValue() {
  return isMonthlyDonation() ? 'monthly' : 'once';
}

function formatSelectedAmount() {
  if (typeof currency !== 'undefined' && currency.loaded && typeof currency.format === 'function') {
    return currency.format(selectedAmount, false);
  }
  return String(selectedAmount);
}

function translate(key, params) {
  if (typeof t === 'function') return t(key, params || {});
  if (typeof i18n !== 'undefined' && typeof i18n.t === 'function') return i18n.t(key, params || {});
  return key;
}

function logCadenceChoice(reason) {
  const payload = {
    eventType: 'cadence_selected',
    amount: selectedAmount,
    details: cadenceValue() + (reason ? ` (${reason})` : ''),
    clientLocation: (typeof Tracking !== 'undefined' && Tracking.getClientLocation)
      ? Tracking.getClientLocation()
      : null
  };
  try {
    fetch('/api/track/payment-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (_) {}
}

function refreshCadenceUi() {
  const monthly = isMonthlyDonation();

  document.querySelectorAll('.cadence-card').forEach((card) => {
    const on = card.dataset.type === donationType;
    card.classList.toggle('active', on);
    card.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  document.querySelectorAll('.amount-cadence').forEach((el) => {
    el.textContent = monthly ? translate('donation.modal.perMonthShort') : '';
    el.classList.toggle('hidden', !monthly);
  });

  const continueLabel = document.getElementById('continue-btn-label');
  if (continueLabel) {
    const amt = formatSelectedAmount();
    continueLabel.textContent = monthly
      ? translate('donation.modal.continueMonthly', { amount: amt })
      : translate('donation.modal.continueOnce', { amount: amt });
  }

  const emailLabel = document.getElementById('modal-email-label');
  if (emailLabel) {
    emailLabel.textContent = monthly
      ? translate('donation.modal.emailLabelMonthly')
      : translate('donation.modal.emailLabel');
  }
  const emailHelp = document.getElementById('modal-email-help');
  if (emailHelp) {
    emailHelp.textContent = monthly
      ? translate('donation.modal.emailHelpMonthly')
      : translate('donation.modal.emailHelp');
  }
  const emailInput = document.getElementById('modal-donor-email');
  if (emailInput) emailInput.required = monthly;

  const impact = document.getElementById('cadence-impact');
  if (impact) {
    impact.textContent = monthly
      ? translate('donation.modal.monthlyImpact', { amount: formatSelectedAmount() })
      : translate('donation.modal.onceImpact');
  }
}

function initDonation() {
  applyPresetAmounts();
  initDonationTypeToggle();
  initAmountButtons();
  initCustomAmountInput();
  initTipSelect();
  initPhaseNavigation();
  initAbandonmentTracking();
  handleDonatedReturn();
  refreshCadenceUi();
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
      const cadenceHint = `<span class="amount-cadence">${isMonthlyDonation() ? translate('donation.modal.perMonthShort') : ''}</span>`;
      btn.innerHTML = position === 'after'
        ? `${amt.toLocaleString()}<span data-currency-symbol>${symbol}</span>${cadenceHint}`
        : `<span data-currency-symbol>${symbol}</span>${amt.toLocaleString()}${cadenceHint}`;

      btn.classList.remove('active', 'border-gfm-green', 'bg-gfm-green-light', 'text-gfm-green');
      if (amt === defaultAmt) {
        btn.classList.add('active', 'border-gfm-green', 'bg-gfm-green-light', 'text-gfm-green');
      }
    }
  });

  selectedAmount = defaultAmt || presets[2] || 50;
  refreshCadenceUi();

  const symbolBefore = document.querySelector('.currency-symbol-before');
  const symbolAfterEl = document.querySelector('.currency-symbol-after');
  const customInput = document.getElementById('modal-custom-amount');
  // Room for the symbol grows with its length ("$" vs "CA$" / "zł"): 1rem inset + ~0.9rem per bold char + gap.
  const symbolRoom = `${(1.5 + symbol.length * 0.9).toFixed(2)}rem`;
  if (position === 'after' && symbolBefore && symbolAfterEl && customInput) {
    symbolBefore.classList.add('hidden');
    symbolAfterEl.textContent = symbol;
    symbolAfterEl.classList.remove('hidden');
    customInput.classList.remove('pl-10');
    customInput.classList.add('pl-4');
    customInput.style.paddingRight = symbolRoom;
  } else if (customInput) {
    customInput.style.paddingLeft = symbolRoom;
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
  const cards = document.querySelectorAll('.cadence-card');
  cards.forEach((btn) => {
    btn.addEventListener('click', () => {
      donationType = btn.dataset.type;
      refreshCadenceUi();
      logCadenceChoice('toggle');
    });
  });
  window.addEventListener('languageChanged', refreshCadenceUi);
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
      refreshCadenceUi();

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
        refreshCadenceUi();
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

  if (isMonthlyDonation() && (!donorEmail || !donorEmail.includes('@'))) {
    isRedirecting = false;
    hideRedirectOverlay();
    if (continueBtn) continueBtn.disabled = false;
    showNotification(translate('donation.messages.emailRequired') || 'Please enter your email so we can send a receipt and you can cancel anytime.', 'error');
    return;
  }

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
      ref_code: td.ref_code || null,
      cadence: cadenceValue(),
      donationType: donationType
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
      sessionStorage.setItem('_purchase_amount', String(selectedAmount + tipAmount));
      sessionStorage.setItem('_purchase_currency', (typeof currency !== 'undefined' && currency.config) ? currency.config.code : 'EUR');
    } catch (e) {}
  }
  tracking.cadence = cadenceValue();
  tracking.donationType = donationType;

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
      // assign (not replace): keeps the campaign in history so Back from checkout returns here
      // instead of closing Facebook/Instagram's in-app browser.
      window.location.assign(data.redirectUrl);
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

// Back from checkout restores this page from the bfcache mid-redirect: clear the overlay/lock.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  isRedirecting = false;
  inCheckoutPhase = false;
  hideRedirectOverlay();
  const btn = document.getElementById('continue-to-payment-btn');
  if (btn) btn.disabled = false;
});

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
      Tracking.trackInitiateCheckout({
        value: selectedAmount,
        contentType: 'donation',
        contentName: isMonthlyDonation() ? 'Monthly Donation' : 'One-time Donation'
      });
      }

      const donorEmailNow = document.getElementById('modal-donor-email')?.value?.trim() || '';
      if (isMonthlyDonation() && (!donorEmailNow || !donorEmailNow.includes('@'))) {
        showNotification(translate('donation.messages.emailRequired') || 'Please enter your email so we can send a receipt and you can cancel anytime.', 'error');
        return;
      }

      inCheckoutPhase = true;
      logCadenceChoice('continue');
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

  const cadenceCards = document.querySelectorAll('.cadence-card');
  cadenceCards.forEach((b) => {
    const on = b.dataset.type === 'one-time';
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  const continueBtn = document.getElementById('continue-to-payment-btn');
  if (continueBtn) continueBtn.disabled = false;
  refreshCadenceUi();
}

window.resetDonationModal = resetDonationModal;
window.getSelectedAmount = () => selectedAmount;
window.getDonationType = () => donationType;
