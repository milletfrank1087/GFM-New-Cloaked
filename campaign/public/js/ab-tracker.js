/**
 * HopeRise A/B Test Engagement & Micro-Conversion Tracker
 * Captures Average Stay Time, Scroll Depth, and Checkout Intent
 */
(function() {
  const startTime = Date.now();
  let maxScrollPct = 0;
  const sentDepths = new Set();
  let hasSentFinal = false;

  function getVariant() {
    if (window.__AB_VARIANT) return window.__AB_VARIANT;
    const match = document.cookie.match(/(?:^|;\s*)_ab_variant=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : 'control';
  }

  function sendEvent(eventName, data) {
    const payload = JSON.stringify({
      variant: getVariant(),
      eventName: eventName,
      data: data || {},
      timestamp: Date.now()
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/ab/event', blob);
    } else {
      fetch('/api/ab/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function() {});
    }
  }

  function checkScroll() {
    const docEl = document.documentElement;
    const body = document.body;
    const scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop || 0;
    const scrollHeight = Math.max(docEl.scrollHeight, body.scrollHeight) - window.innerHeight;
    
    if (scrollHeight <= 0) return;
    const currentPct = Math.min(100, Math.round((scrollTop / scrollHeight) * 100));
    
    if (currentPct > maxScrollPct) {
      maxScrollPct = currentPct;
    }

    [25, 50, 75, 100].forEach(function(threshold) {
      if (maxScrollPct >= threshold && !sentDepths.has(threshold)) {
        sentDepths.add(threshold);
        sendEvent('scroll_depth', { depth: threshold });
      }
    });
  }

  function reportStayTime() {
    if (hasSentFinal) return;
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    if (elapsedSec >= 1) {
      sendEvent('stay_time', { seconds: elapsedSec, maxScroll: maxScrollPct });
    }
  }

  // Window Listeners
  window.addEventListener('scroll', checkScroll, { passive: true });
  
  window.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      reportStayTime();
    }
  });

  window.addEventListener('beforeunload', function() {
    reportStayTime();
    hasSentFinal = true;
  });

  // Track Checkout Modal Open Click
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button, a');
    if (!btn) return;
    const text = (btn.textContent || '').toLowerCase();
    const isDonate = text.includes('donate') || btn.id?.includes('donate') || btn.classList?.contains('donate-btn');
    if (isDonate) {
      sendEvent('checkout_open', { target: btn.id || 'donate_btn' });
    }
  }, { passive: true });

  // Initial Check
  setTimeout(checkScroll, 1000);
})();
