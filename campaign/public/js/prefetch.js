let lastWarmTime = 0;
const WARM_COOLDOWN = 8000;

const STRIPE_ORIGINS = [
  { href: 'https://js.stripe.com', cors: true },
  { href: 'https://m.stripe.com', cors: false }
];

function warmStripeConnections() {
  const now = Date.now();
  if (now - lastWarmTime < WARM_COOLDOWN) return;
  lastWarmTime = now;

  document.querySelectorAll('link[data-speed-hint]').forEach(el => el.remove());

  STRIPE_ORIGINS.forEach(({ href, cors }) => {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.setAttribute('data-speed-hint', '1');
    if (cors) link.crossOrigin = 'anonymous';
    document.head.appendChild(link);

    const dns = document.createElement('link');
    dns.rel = 'dns-prefetch';
    dns.href = href;
    dns.setAttribute('data-speed-hint', '1');
    document.head.appendChild(dns);
  });
}

function warmStoreConnection(storeBaseUrl) {
  if (!storeBaseUrl) return;
  try {
    const origin = new URL(storeBaseUrl).origin;
    fetch(origin + '/', { mode: 'no-cors', credentials: 'omit' }).catch(() => {});
  } catch (_) {}
}

function initPrefetchListeners() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('.amount-btn, #modal-custom-amount, #modal-tip-select')) {
      warmStripeConnections();
    }
  });

  document.addEventListener('focus', (e) => {
    if (e.target.matches('#modal-custom-amount, #modal-donor-email, #modal-tip-select')) {
      warmStripeConnections();
    }
  }, true);

  const confirmBtn = document.getElementById('continue-to-payment-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('mouseenter', warmStripeConnections);
    confirmBtn.addEventListener('touchstart', warmStripeConnections, { passive: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPrefetchListeners);
} else {
  initPrefetchListeners();
}

function showRedirectOverlay() {
  const existing = document.getElementById('redirect-overlay');
  if (existing) existing.remove();

  const t = (key, fallback) => (typeof i18n !== 'undefined' && i18n.loaded) ? i18n.t(key) : fallback;

  const steps = [
    t('donation.redirect.step1', 'Securing your donation...'),
    t('donation.redirect.step2', 'Connecting to payment...'),
    t('donation.redirect.step3', 'Almost ready...')
  ];

  const overlay = document.createElement('div');
  overlay.id = 'redirect-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,0.97);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:99999;opacity:0;transition:opacity 0.25s ease';
  overlay.innerHTML = `
    <div style="text-align:center;max-width:320px;padding:24px">
      <div style="width:56px;height:56px;border-radius:50%;background:#e8f8f0;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00b964" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      </div>
      <div style="width:100%;max-width:220px;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin:0 auto 16px">
        <div id="redirect-progress-bar" style="width:15%;height:100%;background:linear-gradient(90deg,#00b964,#02a95c);border-radius:3px;transition:width 0.6s ease"></div>
      </div>
      <p id="redirect-step-text" style="font-size:16px;font-weight:700;color:#333;margin:0 0 6px;font-family:Inter,system-ui,sans-serif">${steps[0]}</p>
      <p style="font-size:13px;color:#767676;margin:0;font-family:Inter,system-ui,sans-serif">${t('donation.redirect.subtitle', 'Redirecting to secure payment page')}</p>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  setTimeout(() => advanceOverlayStep(1), 800);
}

function advanceOverlayStep(step) {
  const bar = document.getElementById('redirect-progress-bar');
  const text = document.getElementById('redirect-step-text');
  if (!bar || !text) return;

  const t = (key, fallback) => (typeof i18n !== 'undefined' && i18n.loaded) ? i18n.t(key) : fallback;
  const config = [
    { width: '15%', label: t('donation.redirect.step1', 'Securing your donation...') },
    { width: '55%', label: t('donation.redirect.step2', 'Connecting to payment...') },
    { width: '90%', label: t('donation.redirect.step3', 'Almost ready...') }
  ];

  if (step < config.length) {
    bar.style.width = config[step].width;
    text.textContent = config[step].label;
  }
}

window.warmStripeConnections = warmStripeConnections;
window.warmStoreConnection = warmStoreConnection;
window.showRedirectOverlay = showRedirectOverlay;
window.advanceOverlayStep = advanceOverlayStep;
