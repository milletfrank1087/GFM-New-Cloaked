/**
 * Modal Module
 * Handles donation modal open/close functionality
 */

let donationModal, modalContent;

function initModal() {
  donationModal = document.getElementById('donation-modal');
  modalContent = document.querySelector('.modal-content');
  
  const openModalBtns = document.querySelectorAll('.open-donate-modal, #open-donate-modal');
  openModalBtns.forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
  }));
  
  const closeModalBtns = document.querySelectorAll('.close-modal, .modal-overlay');
  closeModalBtns.forEach(btn => btn.addEventListener('click', closeModal));
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (donationModal && !donationModal.classList.contains('hidden')) {
        closeModal();
      }
      const legalModal = document.getElementById('legal-modal');
      if (legalModal && !legalModal.classList.contains('hidden')) {
        closeLegalModal();
      }
    }
  });
  
  initSuccessPhaseButtons();
}

async function openModal() {
  if (!donationModal || !modalContent) return;
  
  if (typeof resetDonationModal === 'function') {
    resetDonationModal();
  }
  
  if (typeof Tracking !== 'undefined') {
    Tracking.trackAddToCart({ contentType: 'donation' });
  }
  
  donationModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  
  setTimeout(() => {
    modalContent.classList.remove('scale-95', 'opacity-0');
    modalContent.classList.add('scale-100', 'opacity-100');
  }, 10);
  
  if (typeof preloadPaymentPhase === 'function') {
    preloadPaymentPhase();
  }
}

let paymentCompleted = false;

function setPaymentCompleted(value) {
  paymentCompleted = value;
}

function closeModal() {
  if (!donationModal || !modalContent) return;
  
  const phase2 = document.getElementById('modal-phase-2');
  const isInPaymentPhase = phase2 && !phase2.classList.contains('hidden');
  
  if (isInPaymentPhase && !paymentCompleted && typeof Tracking !== 'undefined') {
    const amountEl = document.querySelector('.amount-btn.active');
    const customAmountEl = document.getElementById('modal-custom-amount');
    let amount = 50;
    if (customAmountEl && customAmountEl.value) {
      amount = parseFloat(customAmountEl.value);
    } else if (amountEl) {
      amount = parseFloat(amountEl.dataset.amount);
    }
    Tracking.trackPaymentEvent('modal_close', { amount: amount });
  }
  
  paymentCompleted = false;
  
  modalContent.classList.remove('scale-100', 'opacity-100');
  modalContent.classList.add('scale-95', 'opacity-0');
  
  setTimeout(() => {
    donationModal.classList.add('hidden');
    document.body.style.overflow = '';
    
    if (typeof resetDonationModal === 'function') {
      resetDonationModal();
    }
    
    const successPhase = document.getElementById('modal-phase-success');
    if (successPhase) successPhase.classList.add('hidden');
    
    const confettiContainer = document.getElementById('success-confetti-container');
    if (confettiContainer) confettiContainer.innerHTML = '';
  }, 200);
}

function fmtCurrencyModal(amount) {
  return (typeof currency !== 'undefined' && currency.loaded) ? currency.format(amount, true) : `€${parseFloat(amount).toFixed(2)}`;
}

let currentRefCode = null;

function showSuccessPhase(donationAmount, refCode) {
  const phase1 = document.getElementById('modal-phase-1');
  const phase2 = document.getElementById('modal-phase-2');
  const successPhase = document.getElementById('modal-phase-success');
  const closeBtn = document.querySelector('.close-modal');
  
  if (!successPhase) return;
  
  if (phase1) phase1.classList.add('hidden');
  if (phase2) phase2.classList.add('hidden');
  if (closeBtn) closeBtn.classList.add('hidden');
  successPhase.classList.remove('hidden');
  
  const amountDisplay = document.getElementById('success-amount-display');
  if (amountDisplay) {
    amountDisplay.textContent = fmtCurrencyModal(donationAmount);
  }
  
  currentRefCode = refCode || null;
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = currentRefCode ? baseUrl + '?ref=' + currentRefCode : baseUrl;
  
  const urlInput = document.getElementById('success-campaign-url');
  if (urlInput) {
    urlInput.value = shareUrl;
  }
  
  const referralBanner = document.getElementById('success-referral-banner');
  if (referralBanner) {
    if (currentRefCode) {
      referralBanner.classList.remove('hidden');
    } else {
      referralBanner.classList.add('hidden');
    }
  }
  
  if (typeof i18n !== 'undefined' && i18n.loaded) {
    i18n.applyTranslations();
  }
  
  spawnConfetti();
}

function spawnConfetti() {
  const container = document.getElementById('success-confetti-container');
  if (!container) return;
  container.innerHTML = '';
  
  const colors = ['#00b964', '#02a95c', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#34d399', '#fb923c'];
  const pieceCount = 40;
  
  for (let i = 0; i < pieceCount; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.left = Math.random() * 100 + '%';
    piece.style.top = -10 + Math.random() * 20 + '%';
    piece.style.width = (4 + Math.random() * 6) + 'px';
    piece.style.height = (4 + Math.random() * 6) + 'px';
    piece.style.animationDelay = (Math.random() * 0.8) + 's';
    piece.style.animationDuration = (1.8 + Math.random() * 1.5) + 's';
    
    if (Math.random() > 0.5) {
      piece.style.borderRadius = '50%';
    }
    
    container.appendChild(piece);
  }
}

function getShareUrl() {
  const base = window.location.origin + window.location.pathname;
  return currentRefCode ? base + '?ref=' + currentRefCode : base;
}

function initSuccessPhaseButtons() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#success-share-facebook, #success-share-twitter, #success-share-whatsapp, #success-copy-link, #success-copy-url-btn, #success-close-btn');
    if (!btn) return;
    
    e.preventDefault();
    const shareUrl = getShareUrl();
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(
      (typeof i18n !== 'undefined' && i18n.loaded)
        ? i18n.t('donation.success.shareText')
        : 'I just donated to this fundraiser! Please help too:'
    );
    
    if (btn.id === 'success-share-facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, 'facebook-share', 'width=580,height=400');
    } else if (btn.id === 'success-share-twitter') {
      window.open(`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`, 'twitter-share', 'width=580,height=400');
    } else if (btn.id === 'success-share-whatsapp') {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const whatsappUrl = isMobile
        ? `whatsapp://send?text=${encodedText}%20${encodedUrl}`
        : `https://web.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`;
      window.open(whatsappUrl, '_blank');
    } else if (btn.id === 'success-copy-link' || btn.id === 'success-copy-url-btn') {
      navigator.clipboard.writeText(shareUrl).then(() => {
        const originalText = btn.textContent;
        const copiedLabel = (typeof i18n !== 'undefined' && i18n.loaded)
          ? i18n.t('donation.success.copied')
          : 'Copied!';
        btn.textContent = copiedLabel;
        btn.classList.add('bg-gfm-green', 'text-white');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('bg-gfm-green', 'text-white');
        }, 2000);
      }).catch(() => {
        showNotification('Failed to copy link', 'error');
      });
    } else if (btn.id === 'success-close-btn') {
      closeModal();
    }
  });
}

window.setPaymentCompleted = setPaymentCompleted;
window.showSuccessPhase = showSuccessPhase;
