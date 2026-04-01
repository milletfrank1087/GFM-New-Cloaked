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

function showThankYouOverlay() {
  const existing = document.getElementById('thank-you-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'thank-you-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity 0.3s ease';

  const t = (key, fallback) => (typeof i18n !== 'undefined' && i18n.loaded) ? i18n.t(key) : fallback;

  const titleText = t('donation.success.title', 'Thank You!');
  const subtitleText = t('donation.success.subtitle', 'Your generosity makes a real difference');
  const impactText = t('donation.success.impactMessage', 'Your donation has been processed successfully and will directly help this campaign reach its goal.');
  const closeText = t('donation.success.close', 'Done');
  const shareTitle = t('donation.success.shareTitle', 'Share to multiply your impact');

  const shareUrl = window.location.origin + window.location.pathname;

  overlay.innerHTML = `
    <div style="background:white;border-radius:24px;padding:0;max-width:440px;width:calc(100% - 40px);margin:20px;box-shadow:0 25px 60px rgba(0,0,0,0.2);transform:scale(0.95);opacity:0;transition:all 0.35s cubic-bezier(0.34,1.56,0.64,1);overflow:hidden" id="thank-you-card">
      <div style="background:linear-gradient(135deg,#00b964,#02a95c);padding:32px 28px 28px;text-align:center;position:relative;overflow:hidden">
        <div style="position:absolute;inset:0;opacity:0.1;background:radial-gradient(circle at 20% 50%,white 0%,transparent 50%),radial-gradient(circle at 80% 20%,white 0%,transparent 40%)"></div>
        <div style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;position:relative">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <h2 style="font-size:26px;font-weight:800;color:white;margin:0 0 6px;font-family:Inter,system-ui,sans-serif;letter-spacing:-0.3px">${titleText}</h2>
        <p style="color:rgba(255,255,255,0.85);margin:0;font-size:14px;font-family:Inter,system-ui,sans-serif">${subtitleText}</p>
      </div>
      <div style="padding:24px 28px 28px">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:flex-start;gap:12px">
          <div style="width:36px;height:36px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          </div>
          <p style="color:#15803d;margin:0;font-size:13px;line-height:1.5;font-family:Inter,system-ui,sans-serif">${impactText}</p>
        </div>
        <p style="color:#6b7280;font-size:12px;text-align:center;margin:0 0 12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;font-family:Inter,system-ui,sans-serif">${shareTitle}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:#1877f2;color:white;border-radius:10px;font-size:13px;font-weight:600;text-decoration:none;font-family:Inter,system-ui,sans-serif;transition:opacity 0.2s" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/></svg>
            Facebook
          </a>
          <a href="https://wa.me/?text=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:#25d366;color:white;border-radius:10px;font-size:13px;font-weight:600;text-decoration:none;font-family:Inter,system-ui,sans-serif;transition:opacity 0.2s" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
            WhatsApp
          </a>
        </div>
        <button onclick="document.getElementById('thank-you-overlay').remove()" style="width:100%;background:white;color:#00b964;border:2px solid #00b964;padding:13px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:Inter,system-ui,sans-serif;transition:all 0.2s" onmouseover="this.style.background='#00b964';this.style.color='white'" onmouseout="this.style.background='white';this.style.color='#00b964'">${closeText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    const card = document.getElementById('thank-you-card');
    if (card) {
      card.style.transform = 'scale(1)';
      card.style.opacity = '1';
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
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
    const cookies = Tracking.getCookies ? Tracking.getCookies() : {};
    Object.assign(tracking, {
      fbp: cookies.fbp || null,
      fbc: cookies.fbc || null,
      ttp: cookies.ttp || null,
      ttclid: cookies.ttclid || null,
      sourceUrl: window.location.href,
      referrer: document.referrer || null
    });

    const urlParams = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'].forEach(p => {
      if (urlParams.get(p)) tracking[p] = urlParams.get(p);
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
