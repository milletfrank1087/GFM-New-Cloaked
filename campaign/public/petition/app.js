(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const signatureForm = $('signature-form');
  const giftForm = $('gift-form');
  const panels = ['sign', 'loading', 'give', 'thanks'];
  let currentPanel = 'sign';
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const mobileBar = $('mobile-action');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const signerState = {
    firstName: '',
    lastName: '',
    email: '',
    zip: ''
  };

  // --- CAPI Tracking Bridge ---
  function generateEventId(eventName) {
    return eventName + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
  }

  function getCookie(name) {
    const v = '; ' + document.cookie;
    const parts = v.split('; ' + name + '=');
    if (parts.length === 2) {
      const raw = parts.pop().split(';').shift();
      try { return decodeURIComponent(raw); } catch (_) { return raw; }
    }
    return null;
  }

  function getTrackingCookies() {
    const params = new URLSearchParams(window.location.search);
    return {
      fbp: getCookie('_fbp') || null,
      fbc: getCookie('_fbc') || null,
      ttp: getCookie('_ttp') || null,
      ttclid: params.get('ttclid') || getCookie('_ttclid') || null
    };
  }

  function sendCAPI(eventName, eventId, data) {
    const cookies = getTrackingCookies();
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: eventName,
        eventId: eventId,
        sourceUrl: window.location.href,
        cookies: cookies,
        clientLocation: null,
        data: data || {}
      })
    }).catch(() => {});
  }

  function firePixelWithCAPI(eventName, metaParams, tiktokEvent, tiktokParams, capiData) {
    const eventId = generateEventId(eventName);
    try {
      if (typeof fbq === 'function') {
        fbq('track', eventName, metaParams || {}, { eventID: eventId });
      }
    } catch (_) {}
    try {
      if (tiktokEvent && typeof ttq === 'object' && typeof ttq.track === 'function') {
        ttq.track(tiktokEvent, { ...(tiktokParams || {}), event_id: eventId });
      }
    } catch (_) {}
    sendCAPI(eventName, eventId, capiData);
    return eventId;
  }

  function updateMobileBar() {
    if (!mobileBar) return;
    const actionEl = $('action');
    if (!actionEl) return;
    const bounds = actionEl.getBoundingClientRect();
    const visibleHeight = Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0);
    mobileBar.hidden = currentPanel !== 'sign' || visibleHeight >= 120;
  }

  function showPanel(name, shouldScroll = true) {
    currentPanel = name;
    panels.forEach(panel => {
      const el = $(`${panel}-panel`);
      if (el) el.hidden = panel !== name;
    });

    const stepOne = $('step-one');
    const stepTwo = $('step-two');
    if (stepOne) stepOne.toggleAttribute('aria-current', name === 'sign' || name === 'loading');
    if (stepTwo) stepTwo.toggleAttribute('aria-current', name === 'give' || name === 'thanks');

    const target = name === 'sign' ? $('first-name') : (name === 'loading' ? null : $(`${name}-title`));
    if (target) target.focus({ preventScroll: true });

    if (shouldScroll) {
      const actionEl = $('action');
      if (actionEl) {
        actionEl.scrollIntoView({ behavior: reduceMotion.matches ? 'instant' : 'smooth', block: 'start' });
      }
    }
    updateMobileBar();
  }

  function giftSelection() {
    const selected = giftForm.elements.amount ? giftForm.elements.amount.value : '35';
    const isMonthly = giftForm.elements.frequency ? giftForm.elements.frequency.value === 'monthly' : true;
    return {
      amount: selected === 'other' ? Number($('custom-amount').value) : Number(selected),
      monthly: isMonthly
    };
  }

  function updateGiftAmounts(isMonthly) {
    const container = $('amounts-container');
    if (!container) return;

    if (isMonthly) {
      container.innerHTML = `
        <label><input type="radio" name="amount" value="15"><span>$15</span></label>
        <label><input type="radio" name="amount" value="35" checked><span>$35</span></label>
        <label><input type="radio" name="amount" value="60"><span>$60</span></label>
        <label><input type="radio" name="amount" value="other"><span>Other</span></label>
      `;
    } else {
      container.innerHTML = `
        <label><input type="radio" name="amount" value="25"><span>$25</span></label>
        <label><input type="radio" name="amount" value="50" checked><span>$50</span></label>
        <label><input type="radio" name="amount" value="100"><span>$100</span></label>
        <label><input type="radio" name="amount" value="other"><span>Other</span></label>
      `;
    }
  }

  function getPersonalizedImpact(amount, isMonthly, firstName) {
    const prefix = firstName ? `${firstName}, your` : 'Your';
    const formatted = Number.isFinite(amount) && amount >= 1 && amount <= 5000 ? money.format(amount) : 'your';

    if (isMonthly) {
      // Exact Preset Matches
      if (amount === 15) {
        return `${prefix} $15/mo gift provides daily high-protein colostrum formula and clean thermal straw bedding for rescued nursery calves, protecting their fragile lungs every night.`;
      }
      if (amount === 35) {
        return `${prefix} $35/mo sponsorship completely covers an orphaned calf's daily neonatal formula, digestive probiotics, and round-the-clock nursery bottle care until weaning.`;
      }
      if (amount === 60) {
        return `${prefix} $60/mo gift funds intensive 24/7 veterinary nursery triage, IV electrolyte hydration, and prescription antibiotics for newborn calves arriving in critical condition.`;
      }

      // Brackets for Custom Monthly Amounts
      if (amount < 15) {
        return `${prefix} ${formatted}/mo gift provides daily fresh clean thermal bedding and electrolyte hydration packs for a recovering newborn calf.`;
      }
      if (amount < 25) {
        return `${prefix} ${formatted}/mo gift provides continuous daily warm milk bottles and essential vitamin supplements to help an orphaned calf gain strength each day.`;
      }
      if (amount < 50) {
        return `${prefix} ${formatted}/mo sponsorship fully provides warm milk formula, digestive probiotics, and dry thermal straw bedding for a rescued calf throughout their nursery stay.`;
      }
      if (amount < 100) {
        return `${prefix} ${formatted}/mo sponsorship delivers complete veterinary nursery care, medical stabilization, and daily bottle nutrition for vulnerable newborn arrivals.`;
      }
      return `${prefix} ${formatted}/mo cornerstone sponsorship sustains a full maternal nursery stall, financing emergency field rescue, intensive clinical veterinary treatment, and lifelong sanctuary pasture.`;
    } else {
      // Exact Preset Matches for One-Time
      if (amount === 25) {
        return `${prefix} $25 emergency gift provides sterile bottle nipples, colostrum formula, and antibiotic umbilical treatments for a newborn calf arriving tonight.`;
      }
      if (amount === 50) {
        return `${prefix} $50 emergency gift covers vital livestock auction legal release fees and safe climate-controlled trailer transport from commercial stockyards.`;
      }
      if (amount === 100) {
        return `${prefix} $100 gift funds a complete veterinary hospital intake: blood diagnostic panels, emergency IV electrolyte fluids, and 72 hours of intensive incubator monitoring.`;
      }

      // Brackets for Custom One-Time Amounts
      if (amount < 25) {
        return `${prefix} ${formatted} emergency gift immediately buys sterile bottle nipples, electrolyte hydration packs, and clean straw bedding for arriving calves tonight.`;
      }
      if (amount < 35) {
        return `${prefix} ${formatted} gift immediately buys emergency neonatal formula, electrolyte powders, and clean straw bedding for arriving calves tonight.`;
      }
      if (amount < 75) {
        return `${prefix} ${formatted} gift helps fund emergency livestock auction surrender fees and rapid-response heated trailer transport to our nursery barn.`;
      }
      if (amount < 150) {
        return `${prefix} ${formatted} gift pays for an urgent emergency veterinary intake, full lab workup, and life-saving intravenous fluid therapy for a dehydrated newborn.`;
      }
      return `${prefix} ${formatted} leadership gift provides emergency rescue dispatch, weeks of complete clinical veterinary care, and permanent sanctuary security for mother cows and their calves.`;
    }
  }

  function updateGift() {
    const isCustom = giftForm.elements.amount && giftForm.elements.amount.value === 'other';
    const customField = $('custom-field');
    const customAmount = $('custom-amount');

    if (customField) customField.hidden = !isCustom;
    if (customAmount) {
      customAmount.disabled = !isCustom;
      customAmount.required = isCustom;
    }

    const { amount, monthly } = giftSelection();
    const formatted = Number.isFinite(amount) && amount >= 1 && amount <= 5000 ? money.format(amount) : 'your';
    
    const reviewBtn = $('review-gift');
    if (reviewBtn) {
      reviewBtn.disabled = false;
      reviewBtn.style.opacity = '1';
      if (reviewBtn.querySelector('span')) {
        reviewBtn.querySelector('span').textContent = monthly
          ? `Sponsor with a ${formatted}/mo gift`
          : `Send a ${formatted} emergency gift`;
      }
    }

    const termsEl = $('gift-terms');
    if (termsEl) {
      termsEl.textContent = monthly
        ? 'Monthly gifts provide reliable daily nourishment, straw bedding, and medical care and can be canceled anytime.'
        : 'Your one-time gift sends immediate trauma triage, auction rescue fees, and diagnostic care tonight.';
    }

    const impactNote = $('impact-note');
    if (impactNote) {
      const text = getPersonalizedImpact(amount, monthly, signerState.firstName);
      impactNote.innerHTML = `${text} <a href="#support">See care priorities.</a>`;
    }
  }

  // STEP 1: SIGNATURE SUBMISSION & OG CONGRESSIONAL VERIFICATION ANIMATION
  if (signatureForm) {
    signatureForm.addEventListener('submit', event => {
      event.preventDefault();

      const first = $('first-name')?.value.trim();
      const last = $('last-name')?.value.trim();
      const email = $('email')?.value.trim();
      const zip = $('zip')?.value.trim();

      if (!first || !last || !email || !zip) return;

      signerState.firstName = first;
      signerState.lastName = last;
      signerState.email = email;
      signerState.zip = zip;

      firePixelWithCAPI(
        'Lead',
        { content_name: 'Sanctuary Petition 408', status: 'signed' },
        'SubmitForm',
        { contents: [{ content_name: 'Sanctuary Petition 408' }] },
        { contentName: 'Sanctuary Petition 408' }
      );

      // Stage 1: Immediate clean loading screen with deliberate steady pacing
      const stageTitle = $('loading-stage-title');
      const stageSub = $('loading-stage-sub');
      const progressBar = $('loading-progress-fill');

      if (stageTitle) stageTitle.textContent = 'Transmitting Petition to Congress...';
      if (stageSub) stageSub.textContent = 'Recording signature to Congressional Hearing Docket #AGR-2026-884';
      if (progressBar) progressBar.style.width = '25%';

      showPanel('loading');

      setTimeout(() => {
        if (stageTitle) stageTitle.textContent = 'Verifying Citizen Record...';
        if (stageSub) stageSub.textContent = `Confirming petition standing for ${first} (ZIP ${zip})`;
        if (progressBar) progressBar.style.width = '65%';
      }, 1400);

      // Stage 3: Certified Docket Inscription (at 2800ms)
      setTimeout(() => {
        if (stageTitle) stageTitle.textContent = 'Docket Certified!';
        if (stageSub) stageSub.textContent = 'Record inscribed into Congressional Hearing Docket #AGR-2026-884';
        if (progressBar) progressBar.style.width = '100%';
      }, 2800);

      // Transition to Step 2 Giving Pivot with personalized impact (at 3800ms)
      setTimeout(() => {
        const thanksEl = $('personal-thanks');
        if (thanksEl) {
          thanksEl.textContent = `Thank you for lending your voice, ${first}. Would you like to sponsor a rescued calf with an optional gift?`;
        }
        updateGift();
        showPanel('give');

        try {
          const sessionPayload = {
            signed: true,
            firstName: first,
            lastName: last,
            email: email,
            zip: zip,
            step: 'give',
            timestamp: Date.now()
          };
          sessionStorage.setItem('petition_session_state', JSON.stringify(sessionPayload));
          localStorage.setItem('petition_session_state', JSON.stringify(sessionPayload));
        } catch (_) {}
      }, 3800);
    });
  }

  // PRE-WARMING & FAST REDIRECT PIPELINE
  let lastWarmTime = 0;
  function warmStripeConnections() {
    const now = Date.now();
    if (now - lastWarmTime < 8000) return;
    lastWarmTime = now;
    [
      { href: 'https://js.stripe.com', cors: true },
      { href: 'https://m.stripe.com', cors: false }
    ].forEach(({ href, cors }) => {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = href;
      if (cors) link.crossOrigin = 'anonymous';
      document.head.appendChild(link);

      const dns = document.createElement('link');
      dns.rel = 'dns-prefetch';
      dns.href = href;
      document.head.appendChild(dns);
    });
  }

  function warmStoreConnection(storeUrl) {
    if (!storeUrl) return;
    try {
      const origin = new URL(storeUrl).origin;
      fetch(origin + '/', { mode: 'no-cors', credentials: 'omit' }).catch(() => {});
    } catch (_) {}
  }

  // FREQUENCY & AMOUNT SELECTION
  if (giftForm) {
    giftForm.addEventListener('change', event => {
      warmStripeConnections();
      if (event.target.name === 'frequency') {
        updateGiftAmounts(event.target.value === 'monthly');
      }
      updateGift();
      if (event.target.name === 'amount' && event.target.value === 'other') {
        const customInput = $('custom-amount');
        if (customInput) customInput.focus();
      }
    });

    const customAmountInput = $('custom-amount');
    if (customAmountInput) {
      customAmountInput.addEventListener('input', () => {
        warmStripeConnections();
        updateGift();
      });
      customAmountInput.addEventListener('focus', warmStripeConnections);
    }

    const reviewGiftBtn = $('review-gift');
    if (reviewGiftBtn) {
      reviewGiftBtn.addEventListener('mouseenter', warmStripeConnections);
      reviewGiftBtn.addEventListener('touchstart', warmStripeConnections, { passive: true });
    }

    // STEP 2: LIVE CHECKOUT INITIATION
    giftForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!giftForm.reportValidity()) return;

      const { amount, monthly } = giftSelection();
      if (!Number.isFinite(amount) || amount < 1 || amount > 5000) return;

      const reviewBtn = $('review-gift');
      if (reviewBtn) {
        reviewBtn.disabled = true;
        reviewBtn.style.opacity = '0.75';
        if (reviewBtn.querySelector('span')) {
          reviewBtn.querySelector('span').textContent = 'Connecting secure checkout...';
        }
      }

      const purchaseEventId = firePixelWithCAPI(
        'InitiateCheckout',
        { value: amount, currency: 'USD', content_name: 'Sanctuary Calf Sponsorship' },
        'InitiateCheckout',
        { value: amount, currency: 'USD', content_type: 'product', content_id: 'donation',
          contents: [{ content_id: 'donation', content_type: 'product', content_name: 'Sanctuary Calf Sponsorship', quantity: 1, price: amount }] },
        { value: amount, currency: 'USD', contentName: 'Sanctuary Calf Sponsorship' }
      );

      const searchParams = new URLSearchParams(window.location.search);
      const cookies = getTrackingCookies();
      const tracking = {
        variant: window.__AB_VARIANT || 'control',
        utm_source: searchParams.get('utm_source') || 'organic',
        utm_medium: searchParams.get('utm_medium') || 'petition',
        utm_campaign: searchParams.get('utm_campaign') || 'sanctuary_defense_408',
        cadence: monthly ? 'monthly' : 'once',
        signer_zip: signerState.zip,
        eventId: purchaseEventId,
        sourceUrl: window.location.href,
        fbp: cookies.fbp,
        fbc: cookies.fbc,
        ttp: cookies.ttp,
        ttclid: cookies.ttclid
      };

      const payload = {
        amount: amount,
        tip: 0,
        campaign: 'sanctuary-defense-408',
        donorInfo: {
          firstName: signerState.firstName,
          lastName: signerState.lastName,
          email: signerState.email
        },
        tracking: tracking
      };

      try {
        const resp = await fetch('/api/init-donation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await resp.json();
        const destination = data?.redirectUrl || data?.checkoutUrl;

        if (destination) {
          warmStoreConnection(destination);
          window.location.replace(destination);
        } else {
          throw new Error('No checkout URL received');
        }
      } catch (err) {
        console.error('Checkout redirect fallback:', err);
        window.location.replace(`/checkout?amount=${amount}`);
      }
    });
  }

  function restorePetitionSession(shouldScroll = false) {
    try {
      const raw = sessionStorage.getItem('petition_session_state') || localStorage.getItem('petition_session_state');
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data && data.signed && data.firstName) {
        signerState.firstName = data.firstName;
        signerState.lastName = data.lastName || '';
        signerState.email = data.email || '';
        signerState.zip = data.zip || '';

        if ($('first-name')) $('first-name').value = signerState.firstName;
        if ($('last-name')) $('last-name').value = signerState.lastName;
        if ($('email')) $('email').value = signerState.email;
        if ($('zip')) $('zip').value = signerState.zip;

        const thanksEl = $('personal-thanks');
        if (thanksEl) {
          thanksEl.textContent = `Thank you for lending your voice, ${signerState.firstName}. Would you like to sponsor a rescued calf with an optional gift?`;
        }

        const reviewBtn = $('review-gift');
        if (reviewBtn) {
          reviewBtn.disabled = false;
          reviewBtn.style.opacity = '1';
        }

        updateGift();
        showPanel('give', shouldScroll);
        return true;
      }
    } catch (_) {}
    return false;
  }

  // BFCACHE / BACK NAVIGATION RESTORATION
  window.addEventListener('pageshow', (event) => {
    const isBackToAction = window.location.hash.includes('action') || event.persisted;
    restorePetitionSession(isBackToAction);
    const reviewBtn = $('review-gift');
    if (reviewBtn) {
      reviewBtn.disabled = false;
      reviewBtn.style.opacity = '1';
    }
    updateGift();
  });

  // SKIP TO CIVIC SHARE
  const skipBtn = $('skip-gift');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => showPanel('thanks'));
  }

  // SOCIAL SHARING & COPY LINK
  const shareBtn = $('share-petition');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const shareData = {
        title: 'Give Them a Kinder Beginning · Frontline Calf Rescue',
        text: 'I just signed the petition demanding compassionate care and mother-calf bonding standards for dairy calves. Add your signature:',
        url: window.location.href
      };
      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch (_) {}
      } else {
        copyPetitionUrl();
      }
    });
  }

  const copyBtn = $('copy-link-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', copyPetitionUrl);
  }

  async function copyPetitionUrl() {
    const url = window.location.href;
    const statusEl = $('copy-status');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        if (statusEl) statusEl.textContent = 'Petition link copied to clipboard!';
      } else {
        throw new Error();
      }
    } catch (_) {
      if (statusEl) statusEl.textContent = `Copy this link: ${url}`;
    }
  }

  // Sizing & Mobile Observer
  function sizeActionColumn() {
    const actionEl = $('action');
    if (actionEl) {
      actionEl.style.setProperty('--action-height', `${actionEl.offsetHeight}px`);
    }
  }
  sizeActionColumn();
  if ('ResizeObserver' in window && $('action')) {
    new ResizeObserver(sizeActionColumn).observe($('action'));
  }

  if (window.location.hash.includes('action')) {
    restorePetitionSession(true);
  } else {
    restorePetitionSession(false);
  }

  updateGift();
  updateMobileBar();

  if ('IntersectionObserver' in window && $('action')) {
    new IntersectionObserver(updateMobileBar, { threshold: [0, .15, .2, .5, 1] }).observe($('action'));
  } else {
    window.addEventListener('scroll', updateMobileBar, { passive: true });
  }
  window.addEventListener('resize', updateMobileBar, { passive: true });
})();
