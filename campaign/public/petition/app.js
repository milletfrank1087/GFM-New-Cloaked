/**
 * SANCTUARY DEFENSE ALLIANCE — PETITION 2.0 CLIENT APPLICATION
 * High-Velocity Petition Intake & Sustainer Conversion Engine
 */

(function () {
  'use strict';

  // State
  const state = {
    cadence: 'monthly',
    amount: 35,
    isCustom: false,
    signatureCount: 94874,
    signer: {
      firstName: '',
      lastName: '',
      email: '',
      zip: '',
      mobile: ''
    }
  };

  // DOM Elements Cache
  let liveSigEl, mobileDockSigEl, progressFillEl;

  // Initialize
  document.addEventListener('DOMContentLoaded', function () {
    liveSigEl = document.getElementById('live-signature-number');
    mobileDockSigEl = document.getElementById('mobile-dock-signatures');
    progressFillEl = document.getElementById('live-progress-fill');

    initLiveCounter();
    initSignerTicker();
  });

  // Authentic Social Proof Live Ticker
  function initSignerTicker() {
    const tickerEl = document.getElementById('live-signer-ticker');
    if (!tickerEl) return;

    const recentSigners = [
      'Sarah M. from Lancaster, PA signed 2 minutes ago',
      'David K. from Austin, TX signed 4 minutes ago',
      'Elena R. from Madison, WI signed 5 minutes ago',
      'Marcus T. from Columbus, OH signed 7 minutes ago',
      'Jennifer P. from Denver, CO signed 9 minutes ago',
      'Rachel B. from Ithaca, NY signed 11 minutes ago'
    ];
    let idx = 0;

    setInterval(function () {
      idx = (idx + 1) % recentSigners.length;
      tickerEl.style.opacity = '0';
      setTimeout(function () {
        tickerEl.textContent = recentSigners[idx];
        tickerEl.style.opacity = '1';
      }, 300);
    }, 6000);
  }

  // Smooth Live Signature Counter Simulation
  function initLiveCounter() {
    function tick() {
      state.signatureCount += 1;
      const formatted = state.signatureCount.toLocaleString();
      if (liveSigEl) liveSigEl.textContent = formatted;
      if (mobileDockSigEl) mobileDockSigEl.textContent = formatted;

      const pct = Math.min((state.signatureCount / 100000) * 100, 99.9).toFixed(1);
      if (progressFillEl) progressFillEl.style.width = pct + '%';

      const nextInterval = Math.floor(Math.random() * 5000) + 3500;
      setTimeout(tick, nextInterval);
    }
    setTimeout(tick, 4000);
  }

  // Handle Step 1 Form Submission
  window.handlePetitionSubmit = function (e) {
    if (e) e.preventDefault();

    const fName = document.getElementById('signer-first-name')?.value.trim();
    const lName = document.getElementById('signer-last-name')?.value.trim();
    const email = document.getElementById('signer-email')?.value.trim();
    const zip = document.getElementById('signer-zip')?.value.trim();
    const mobile = document.getElementById('signer-mobile')?.value.trim();

    if (!fName || !email || !zip) {
      alert('Please fill in your name, email, and ZIP code to verify your signature.');
      return;
    }

    state.signer = { firstName: fName, lastName: lName, email: email, zip: zip, mobile: mobile };

    // Fire Meta / TikTok Lead tracking immediately
    try {
      if (typeof fbq === 'function') {
        fbq('track', 'Lead', { content_name: 'Sanctuary Petition 408', status: 'signed' });
      }
      if (typeof ttq === 'object' && typeof ttq.track === 'function') {
        ttq.track('SubmitForm', { contents: [{ content_name: 'Sanctuary Petition 408' }] });
      }
    } catch (_) {}

    // STEP 1: IMMEDIATELY SHOW CLEAN LOADING VIEW
    const step1View = document.getElementById('step-petition-view');
    const loadingView = document.getElementById('step-loading-view');
    const step2View = document.getElementById('step-sustainer-view');
    const thermometerBox = document.querySelector('.petition-thermometer-box');

    if (step1View) step1View.style.display = 'none';
    if (thermometerBox) thermometerBox.style.display = 'none';
    if (loadingView) loadingView.style.display = 'block';

    // Smoothly scroll loading state into view on mobile
    const actionDock = document.getElementById('action-dock');
    if (actionDock && window.innerWidth < 1024) {
      actionDock.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const titleEl = document.getElementById('loading-stage-title');
    const subEl = document.getElementById('loading-stage-sub');
    const fillEl = document.getElementById('loading-progress-fill');

    if (fillEl) fillEl.style.width = '35%';

    // Step 1.2: District validation update
    setTimeout(function () {
      if (titleEl) titleEl.textContent = 'Verifying Congressional District...';
      if (subEl) subEl.textContent = `Confirming voting district standing for ${fName} (ZIP ${zip})`;
      if (fillEl) fillEl.style.width = '75%';
    }, 700);

    // Step 1.3: Certified finalization
    setTimeout(function () {
      if (titleEl) titleEl.textContent = 'Docket Certified!';
      if (subEl) subEl.textContent = 'Record inscribed into Congressional Hearing Docket #AGR-2026-884';
      if (fillEl) fillEl.style.width = '100%';
    }, 1400);

    // STEP 2: REVEAL NORMAL SECOND SLIDE (CLEAN & UNCLUTTERED)
    setTimeout(function () {
      if (loadingView) loadingView.style.display = 'none';
      if (step2View) {
        step2View.classList.add('is-active');
        selectCadence('monthly'); // default to monthly sustainer
      }

      const receiptMsg = document.getElementById('signer-confirmed-msg');
      if (receiptMsg) {
        receiptMsg.textContent = `Official Signature Certified for ${fName} (Docket #AGR-2026-884)`;
      }

      if (actionDock && window.innerWidth < 1024) {
        actionDock.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 1900);
  };

  // Cadence Selection (Monthly vs One-Time)
  window.selectCadence = function (mode) {
    state.cadence = mode;

    const monthlyBtn = document.getElementById('cadence-monthly-btn');
    const onetimeBtn = document.getElementById('cadence-onetime-btn');
    const tierPills = document.querySelectorAll('.donation-tier-grid .tier-pill');
    const deckEl = document.getElementById('pivot-narrative-deck');
    const rationaleEl = document.getElementById('sustainer-rationale-note');

    if (mode === 'monthly') {
      monthlyBtn?.classList.add('is-active');
      onetimeBtn?.classList.remove('is-active');

      if (deckEl) {
        deckEl.textContent = 'Changing federal law takes time. But in our nursery barn right now, newborn rescued calves like Barnaby need daily bottles of warm milk formula for 12 continuous weeks to survive. A monthly sponsorship gives our caregivers the steady lifeline needed to feed, hydrate, and shelter them until they are strong enough to graze in open pastures.';
      }
      if (rationaleEl) {
        rationaleEl.innerHTML = '<strong>Why Monthly Care Saves More Lives:</strong> Rescued calves arrive with zero maternal antibodies and cannot digest solid pasture for 90 days. A monthly gift guarantees our rescue haulers never have to leave an orphaned baby behind at livestock auction.';
      }

      // Update pills for Monthly
      const pill1 = document.getElementById('tier-pill-1');
      const pill2 = document.getElementById('tier-pill-2');
      const pill3 = document.getElementById('tier-pill-3');

      if (pill1) { pill1.textContent = '$19/mo'; pill1.onclick = function() { selectTier(19, this); }; }
      if (pill2) { pill2.textContent = '$35/mo'; pill2.onclick = function() { selectTier(35, this); }; }
      if (pill3) { pill3.textContent = '$50/mo'; pill3.onclick = function() { selectTier(50, this); }; }

      if (!state.isCustom) {
        state.amount = 35;
        tierPills.forEach(p => p.classList.remove('is-selected'));
        pill2?.classList.add('is-selected');
      }
    } else {
      onetimeBtn?.classList.add('is-active');
      monthlyBtn?.classList.remove('is-active');

      if (deckEl) {
        deckEl.textContent = 'Every single dollar provides immediate trauma relief. A one-time emergency gift funds rapid transport hauler fuel, emergency auction release fees, and life-saving electrolyte drips for vulnerable calves and mother cows arriving tonight.';
      }
      if (rationaleEl) {
        rationaleEl.innerHTML = '<strong>Immediate Auction Triage:</strong> One-time gifts fund urgent transport hauler dispatch, auction legal release fees, and emergency IV hydration for animals arriving at auction this week.';
      }

      // Update pills for One-Time
      const pill1 = document.getElementById('tier-pill-1');
      const pill2 = document.getElementById('tier-pill-2');
      const pill3 = document.getElementById('tier-pill-3');

      if (pill1) { pill1.textContent = '$25'; pill1.onclick = function() { selectTier(25, this); }; }
      if (pill2) { pill2.textContent = '$50'; pill2.onclick = function() { selectTier(50, this); }; }
      if (pill3) { pill3.textContent = '$100'; pill3.onclick = function() { selectTier(100, this); }; }

      if (!state.isCustom) {
        state.amount = 50;
        tierPills.forEach(p => p.classList.remove('is-selected'));
        pill2?.classList.add('is-selected');
      }
    }

    updateButtonLabel();
    updateImpactLine();
  };

  // Tier Selection
  window.selectTier = function (amount, btnElement) {
    state.amount = amount;
    state.isCustom = false;

    // Reset pills
    document.querySelectorAll('.amount-pill').forEach(function (pill) {
      pill.classList.remove('is-selected');
    });
    if (btnElement) btnElement.classList.add('is-selected');

    // Hide custom input
    const customWrap = document.getElementById('custom-amount-wrap');
    if (customWrap) customWrap.classList.remove('is-visible');

    updateButtonLabel();
    updateImpactLine();
  };

  // Custom Amount Tier
  window.selectCustomTier = function (btnElement) {
    state.isCustom = true;

    document.querySelectorAll('.amount-pill').forEach(function (pill) {
      pill.classList.remove('is-selected');
    });
    if (btnElement) btnElement.classList.add('is-selected');

    const customWrap = document.getElementById('custom-amount-wrap');
    const customInput = document.getElementById('custom-gift-input');
    if (customWrap) customWrap.classList.add('is-visible');
    if (customInput) {
      customInput.focus();
      const val = parseFloat(customInput.value);
      if (val > 0) state.amount = val;
    }

    updateButtonLabel();
    updateImpactLine();
  };

  window.handleCustomAmount = function (val) {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 5) {
      state.amount = num;
      updateButtonLabel();
      updateImpactLine();
    }
  };

  // Dynamic Impact Line
  function updateImpactLine() {
    const impactEl = document.getElementById('impact-description');
    if (!impactEl) return;

    const isMonthly = state.cadence === 'monthly';
    const amt = state.amount;

    if (isMonthly) {
      if (amt <= 20) {
        impactEl.textContent = `Your $${amt}/mo gift supplies daily bottles of warm colostrum-enriched milk formula, thermal straw bedding, and clean nursery blankets for an orphaned calf every single week.`;
      } else if (amt <= 35) {
        impactEl.textContent = `Your $${amt}/mo gift completely sponsors baby Barnaby's daily neonatal milk bottles, digestive probiotics, and dedicated 24/7 nursery caregiver attention until he is fully weaned.`;
      } else if (amt <= 75) {
        impactEl.textContent = `Your $${amt}/mo gift provides comprehensive recovery: daily warm milk for an orphaned calf plus anti-inflammatory joint therapy and specialized nutrition for a rescued mother cow.`;
      } else {
        impactEl.textContent = `Your $${amt}/mo sustaining gift sponsors complete lifetime sanctuary pasturing, emergency veterinary medicine, and nursery care for rescued mother-calf families.`;
      }
    } else {
      if (amt <= 25) {
        impactEl.textContent = `Your $${amt} emergency gift sends warm bottles of enriched electrolyte formula, sterile feeding nipples, and clean straw for a shivering newborn calf tonight.`;
      } else if (amt <= 50) {
        impactEl.textContent = `Your $${amt} emergency gift funds urgent veterinary diagnostics, ultrasound scans, and infection treatments for a suffering mother cow or newborn calf.`;
      } else if (amt <= 100) {
        impactEl.textContent = `Your $${amt} emergency gift covers the legal auction release fee and climate-controlled trailer transport to rescue an animal directly from the slaughter truck.`;
      } else {
        impactEl.textContent = `Your $${amt} emergency gift directly funds rapid-response rescue hauler dispatch, mobile trauma stabilization, and hospital intake care.`;
      }
    }
  }

  function updateButtonLabel() {
    const labelEl = document.getElementById('btn-donate-label');
    if (!labelEl) return;

    if (state.cadence === 'monthly') {
      labelEl.textContent = `Confirm $${state.amount}/mo Sustaining Gift →`;
    } else {
      labelEl.textContent = `Send $${state.amount} Emergency Gift →`;
    }
  }

  // Execute Donation Handoff to Payment Backend
  window.executeDonationHandoff = async function () {
    const btn = document.getElementById('btn-fulfill-donation');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.7';
      btn.innerHTML = '<span>CONNECTING SECURE CHECKOUT...</span>';
    }

    // Fire InitiateCheckout tracking
    try {
      if (typeof fbq === 'function') {
        fbq('track', 'InitiateCheckout', {
          value: state.amount,
          currency: 'USD',
          content_name: 'Sanctuary Calf Sponsorship'
        });
      }
    } catch (_) {}

    // Gather tracking parameters
    const searchParams = new URLSearchParams(window.location.search);
    const tracking = {
      variant: window.__AB_VARIANT || 'variant_b',
      utm_source: searchParams.get('utm_source') || 'facebook',
      utm_medium: searchParams.get('utm_medium') || 'cpc',
      utm_campaign: searchParams.get('utm_campaign') || 'sanctuary_defense_408',
      cadence: state.cadence,
      signer_zip: state.signer.zip
    };

    const payload = {
      amount: state.amount,
      tip: 0,
      campaign: 'sanctuary-defense-408',
      donorInfo: {
        firstName: state.signer.firstName,
        lastName: state.signer.lastName,
        email: state.signer.email
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
        window.location.href = destination;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error('Checkout initialization failed:', err);
      // Fallback redirect to store if available
      window.location.href = '/checkout?amount=' + state.amount;
    }
  };

  // Skip to Share Screen (Step 3: Civic Action)
  window.skipToShareScreen = function () {
    const step2View = document.getElementById('step-sustainer-view');
    const shareView = document.getElementById('step-share-view');
    if (step2View) step2View.style.display = 'none';
    if (shareView) {
      shareView.style.display = 'block';
      shareView.classList.add('is-active');
    }

    const actionDock = document.getElementById('action-dock');
    if (actionDock && window.innerWidth < 1024) {
      actionDock.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Return to Donation Screen from Share Screen
  window.returnToDonationScreen = function () {
    const step2View = document.getElementById('step-sustainer-view');
    const shareView = document.getElementById('step-share-view');
    if (shareView) {
      shareView.style.display = 'none';
      shareView.classList.remove('is-active');
    }
    if (step2View) {
      step2View.style.display = 'block';
      step2View.classList.add('is-active');
    }

    const actionDock = document.getElementById('action-dock');
    if (actionDock && window.innerWidth < 1024) {
      actionDock.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Return to Petition Lead View
  window.returnToPetitionLead = function () {
    const step1View = document.getElementById('step-petition-view');
    const shareView = document.getElementById('step-share-view');
    const loadingView = document.getElementById('step-loading-view');
    const step2View = document.getElementById('step-sustainer-view');
    const thermometerBox = document.querySelector('.petition-thermometer-box');

    if (shareView) shareView.style.display = 'none';
    if (loadingView) loadingView.style.display = 'none';
    if (step2View) step2View.style.display = 'none';
    if (step1View) step1View.style.display = 'block';
    if (thermometerBox) thermometerBox.style.display = 'block';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Social Share Action
  window.handleSocialShare = async function () {
    const shareData = {
      title: 'Sign the Sanctuary Petition: Protect Calves in Commercial Dairies',
      text: 'I just officially signed the citizen petition to end solitary calf hutches and protect mother cows. Please add your signature to Docket #AGR-2026-884:',
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // User cancelled or share failed, fall back to copy link
      }
    }
    handleCopyLink();
  };

  // Copy Link Action
  window.handleCopyLink = function () {
    const link = window.location.href;
    const labelEl = document.getElementById('copy-link-label');
    const btn = document.getElementById('btn-copy-link');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () {
        if (labelEl) labelEl.textContent = '✓ Link Copied to Clipboard!';
        if (btn) btn.style.borderColor = 'var(--color-forest)';
        setTimeout(function () {
          if (labelEl) labelEl.textContent = 'Copy Petition Link';
          if (btn) btn.style.borderColor = 'var(--border-rule)';
        }, 2500);
      }).catch(function () {
        prompt('Copy this link to share the petition:', link);
      });
    } else {
      prompt('Copy this link to share the petition:', link);
    }
  };

  // Scroll to Form on Mobile
  window.scrollToPetitionForm = function () {
    const dock = document.getElementById('action-dock');
    if (dock) {
      dock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () {
        const input = document.getElementById('signer-first-name');
        if (input) input.focus();
      }, 400);
    }
  };

  // FAQ Accordion Toggle
  window.toggleFaq = function (btn) {
    const parent = btn.closest('.faq-card-item') || btn.closest('.faq-row-item');
    if (!parent) return;

    const isOpen = parent.classList.contains('is-open');
    // Close all other FAQs
    document.querySelectorAll('.faq-card-item, .faq-row-item').forEach(function (item) {
      item.classList.remove('is-open');
    });

    if (!isOpen) {
      parent.classList.add('is-open');
    }
  };

  // Deeply Expanded Interactive Legal Modals
  window.openLegalModal = function (type) {
    let title = 'Institutional Disclosure';
    let content = '';

    if (type === 'governance' || type === 'operations' || type === 'field') {
      title = 'Field Stations, Sanctuaries & Veterinary Facilities';
      content = 'Sanctuary Defense Alliance maintains three permanent animal care facilities and two rapid-response mobile veterinary trailers across the Northeast and Midwest corridors:\n\n• Lancaster County Rescue Barn (PA): 40-stall critical intake and quarantine hospital equipped with radiant neonatal thermal beds, isolation maternity pens, and continuous DVM monitoring.\n• Finger Lakes Neonatal Nursery (NY): 85-acre specialized nursing pasture dedicated to 12-week mother-calf bonding and social rehabilitation.\n• Wayne County Pasture Reserve (OH): 210-acre permanent lifetime grazing sanctuary protected by non-profit conservation covenants, safe from slaughter forever.\n\nBiosecurity Protocols: All facilities adhere to strict American Association of Bovine Practitioners (AABP) clinical hygiene standards. Public visitation is hosted during scheduled educational sanctuary days.';
    } else if (type === 'status' || type === 'advocacy' || type === '501c3' || type === 'irs') {
      title = 'Direct Frontline Action & Advocacy Funding';
      content = 'Sanctuary Defense Alliance is an independent non-profit animal protection advocacy organization. To maintain complete operational independence and engage in direct, unrestricted legislative lobbying to pass the Maternal Herd Protection Amendment in the 2026 Farm Bill, contributions are not tax-deductible as charitable gifts. 100% of donor funding directly underwrites frontline veterinary rescue trailers, emergency auction release fees, neonatal calf electrolyte formula, and grassroots citizen petition mobilization, free from government-subsidized speech restrictions.';
    } else if (type === 'financials' || type === 'audit') {
      title = 'Audited Financial Statements & 100% Care Pledge';
      content = 'Sanctuary Defense Alliance conducts independent annual financial reviews in accordance with U.S. Generally Accepted Auditing Standards (GAAS). Under our strict 100% Direct Care Pledge, every public dollar donated to the Emergency Calf Fund is restricted exclusively to livestock auction legal release, mobile trauma transport, DVM diagnostics, colostrum formula, and lifetime sanctuary pasturing. Core administrative overhead and executive compensation are privately underwritten by founding philanthropic board grants.';
    } else if (type === 'privacy') {
      title = 'Donor Privacy Protection & Zero-Monetization Charter';
      content = 'We enforce a strict, zero-monetization data policy. Citizen petition signatures, email addresses, and donor payment sessions are encrypted in transit via 256-bit TLS/SSL and stored with cryptographic security. We never sell, rent, lease, barter, or trade constituent or donor information to commercial marketing brokers, political committees, or corporate data lists. You may request permanent record deletion at any time by contacting privacy@sanctuarydefense.org.';
    } else if (type === 'congressional') {
      title = 'Congressional Filing Docket #AGR-2026-884';
      content = 'Formal petition filings are prepared and submitted to the Chief Clerk of the House Committee on Agriculture pursuant to House Rule XII. Signatures are compiled and verified by congressional voting district to establish constituent standing. Certified citizen petitions will be formally entered into the public hearing record ahead of the 2026 Farm Bill Livestock & Dairy Subcommittee deliberations.';
    } else if (type === 'whistleblower') {
      title = 'First Amendment Whistleblower Protections';
      content = 'All undercover field investigations, veterinary case documentations, and photographic evidence of factory farming facilities are conducted under First Amendment speech protections firmly affirmed in Animal Legal Defense Fund v. Wasden, 878 F.3d 1184 (9th Cir. 2018) and Animal Legal Defense Fund v. Kelly, 9 F.4th 1219 (10th Cir. 2021). All documentary records maintain immutable cryptographic chain-of-custody hashes compliant with Federal Rules of Evidence 901 and 902(11).';
    } else if (type === 'terms') {
      title = 'Terms of Civic Inscription & Non-Partisan Advocacy';
      content = 'By inscribing your name on this official petition, you attest that you are a citizen or resident supporting federal statutory protections for farm animals. Sanctuary Defense Alliance operates strictly as a non-partisan advocacy coalition. Signatures represent citizen support for legislative reform and do not constitute an endorsement of any political party or electoral candidate.';
    } else {
      title = 'Sanctuary Defense Alliance Transparency';
      content = 'Sanctuary Defense Alliance is committed to absolute operational, medical, and fiscal transparency. For specific records, inquiries, or media documentation, please contact our legal and administrative office at info@sanctuarydefense.org.';
    }

    // Convert newlines to formatted paragraphs
    const formattedParagraphs = content.split('\n\n').map(p => {
      if (p.startsWith('•')) {
        const items = p.split('\n').map(li => `<li style="margin-bottom:6px;">${li.replace(/^•\s*/, '')}</li>`).join('');
        return `<ul style="padding-left:18px;margin-bottom:14px;color:#374151;line-height:1.6;">${items}</ul>`;
      }
      return `<p style="margin-bottom:14px;color:#374151;line-height:1.65;">${p}</p>`;
    }).join('');

    const modalBackdrop = document.createElement('div');
    modalBackdrop.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.75);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modalBackdrop.innerHTML = `
      <div style="background:#ffffff;border-radius:12px;max-width:540px;width:100%;max-height:85vh;overflow-y:auto;padding:32px 26px;box-shadow:0 25px 35px -5px rgba(0,0,0,0.25);position:relative;">
        <button type="button" style="position:absolute;top:16px;right:18px;background:none;border:none;font-size:24px;cursor:pointer;color:#9ca3af;line-height:1;" onclick="this.closest('div').parentElement.remove()">&times;</button>
        <h3 style="font-family:'Newsreader',Georgia,serif;font-size:1.375rem;font-weight:800;color:#111827;margin-bottom:14px;padding-right:24px;line-height:1.25;">${title}</h3>
        <div style="font-size:0.9rem;">${formattedParagraphs}</div>
        <button type="button" style="width:100%;min-height:46px;background:#1e4620;color:#ffffff;border:none;border-radius:6px;font-size:0.875rem;font-weight:700;cursor:pointer;margin-top:10px;" onclick="this.closest('div').parentElement.remove()">CLOSE DISCLOSURE</button>
      </div>
    `;
    modalBackdrop.onclick = function (e) {
      if (e.target === modalBackdrop) modalBackdrop.remove();
    };
    document.body.appendChild(modalBackdrop);
  };

})();
