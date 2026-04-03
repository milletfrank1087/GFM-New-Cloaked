window.showThankYouOverlay = function showThankYouOverlay() {
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
};
