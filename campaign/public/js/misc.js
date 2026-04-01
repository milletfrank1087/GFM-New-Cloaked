/**
 * Misc Module
 * Handles miscellaneous features: share buttons, copy link, smooth scroll, recent donations, read more
 */

function initMisc() {
  initShareButtons();
  initCopyLink();
  initSmoothScroll();
  initRecentDonations();
}

// Share buttons functionality
function initShareButtons() {
  const pageUrl = encodeURIComponent(window.location.href);
  const pageTitle = encodeURIComponent(document.title);
  const shareText = encodeURIComponent('Help support this fundraiser! Every donation makes a difference.');
  
  // Facebook share
  document.querySelectorAll('[data-share="facebook"], button:has(svg path[d*="M9 8h-3v4h3v12"])').forEach(btn => {
    if (btn.textContent.includes('Facebook') || btn.textContent.includes('Share')) {
      btn.addEventListener('click', (e) => {
        // Only handle if it's a Facebook button (has Facebook in text or is blue)
        if (btn.classList.contains('bg-[#1877f2]') || btn.textContent.trim() === 'Facebook') {
          e.preventDefault();
          window.open(
            `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`,
            'facebook-share',
            'width=580,height=400'
          );
        }
      });
    }
  });
  
  // Twitter/X share
  document.querySelectorAll('button').forEach(btn => {
    if (btn.textContent.includes('Tweet') || btn.textContent.includes('Twitter')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(
          `https://twitter.com/intent/tweet?url=${pageUrl}&text=${shareText}`,
          'twitter-share',
          'width=580,height=400'
        );
      });
    }
  });
  
  // WhatsApp share
  document.querySelectorAll('button').forEach(btn => {
    if (btn.textContent.includes('WhatsApp')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const whatsappUrl = isMobile 
          ? `whatsapp://send?text=${shareText}%20${pageUrl}`
          : `https://web.whatsapp.com/send?text=${shareText}%20${pageUrl}`;
        window.open(whatsappUrl, '_blank');
      });
    }
  });
  
  // Generic Share buttons (in story section - opens native share or copies link)
  document.querySelectorAll('button').forEach(btn => {
    // Only target the Share buttons that are NOT Facebook (blue background)
    if (btn.textContent.trim() === 'Share' && !btn.classList.contains('bg-[#1877f2]')) {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        // Try native share API first (mobile)
        if (navigator.share) {
          try {
            await navigator.share({
              title: document.title,
              text: 'Help support this fundraiser! Every donation makes a difference.',
              url: window.location.href
            });
          } catch (err) {
            // User cancelled or error - fall back to copy
            copyToClipboard();
          }
        } else {
          // Desktop - copy link
          copyToClipboard();
        }
      });
    }
  });
}

function copyToClipboard() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    showNotification('Link copied to clipboard!', 'success');
  }).catch(() => {
    showNotification('Failed to copy link', 'error');
  });
}

// Copy link to clipboard (dedicated buttons)
function initCopyLink() {
  const copyButtons = document.querySelectorAll('#copy-link-btn, #mobile-copy-link, button');
  
  copyButtons.forEach(btn => {
    if (btn.textContent.includes('Copy Link') || btn.id === 'copy-link-btn' || btn.id === 'mobile-copy-link') {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        copyToClipboard();
      });
    }
  });
}

// Smooth scroll for anchor links
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      
      // Skip modal links
      if (href === '#donation-modal') return;
      
      e.preventDefault();
      const target = document.querySelector(href);
      
      if (target) {
        const offset = 100; // Account for fixed navbar
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: targetPosition, behavior: 'smooth' });
      }
    });
  });
  
  // Mobile donate bar scroll to donate section
  document.querySelectorAll('.scroll-to-donate').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const donateSection = document.getElementById('donate-inline');
      if (donateSection) {
        const offset = 80;
        const targetPosition = donateSection.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: targetPosition, behavior: 'smooth' });
      }
    });
  });
}

// Recent donation rotation in sidebar
function initRecentDonations() {
  let currentDonorIndex = 0;
  const recentDonationEl = document.getElementById('recent-donation');
  const recentDonationMobileEl = document.getElementById('recent-donation-inline');
  
  const hasCurrency = typeof currency !== 'undefined' && currency.loaded;
  const fmtAmount = (amt) => hasCurrency ? currency.format(amt, false) : `€${parseFloat(amt).toLocaleString()}`;
  const donatedText = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('common.sidebar.donated') : 'donated';
  
  function updateRecentDonation() {
    const data = (typeof window.campaignData === 'function') ? window.campaignData() : null;
    const recentDonors = data?.recentDonors || [];
    
    if (recentDonors.length === 0) return;
    
    const donor = recentDonors[currentDonorIndex];
    const formatted = fmtAmount(donor.amount);
    
    if (recentDonationEl) {
      recentDonationEl.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-gradient-to-br ${donor.color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0">${donor.initials}</div>
        <div class="flex-1 min-w-0">
          <p class="font-medium text-sm truncate">${donor.name} ${donatedText} <span class="text-gfm-green font-bold">${formatted}</span></p>
          <p class="text-xs text-gfm-gray">${donor.time}</p>
        </div>
      `;
    }
    
    if (recentDonationMobileEl) {
      recentDonationMobileEl.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-gradient-to-br ${donor.color} flex items-center justify-center text-white text-xs font-bold">${donor.initials}</div>
        <div class="flex-1">
          <p class="text-sm"><span class="font-medium">${donor.name}</span> ${donatedText} <span class="text-gfm-green font-bold">${formatted}</span></p>
          <p class="text-xs text-gfm-gray">${donor.time}</p>
        </div>
      `;
    }
    
    currentDonorIndex = (currentDonorIndex + 1) % recentDonors.length;
  }
  
  // Initial update after a short delay to allow campaign data to load
  setTimeout(updateRecentDonation, 500);
  
  // Rotate every 8 seconds
  setInterval(updateRecentDonation, 8000);
}

// Read More toggle for mobile story
function initReadMore() {
  const readMoreBtn = document.getElementById('read-more-btn');
  const storyFull = document.getElementById('story-full');
  const readMoreText = document.getElementById('read-more-text');
  const readMoreIcon = document.getElementById('read-more-icon');
  
  if (!readMoreBtn || !storyFull) return;
  
  let isExpanded = false;
  
  readMoreBtn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    
    if (isExpanded) {
      storyFull.classList.remove('hidden');
      storyFull.classList.add('block');
      readMoreText.textContent = 'Show less';
      readMoreIcon.classList.add('rotate-180');
    } else {
      storyFull.classList.add('hidden');
      storyFull.classList.remove('block');
      readMoreText.textContent = 'Read full story';
      readMoreIcon.classList.remove('rotate-180');
    }
  });
}
