/**
 * Donors Module
 * Handles loading and displaying donor information
 */

function initDonors() {
  const donorsList = document.getElementById('donors-list');
  const loadMoreDonorsBtn = document.getElementById('load-more-donors');
  
  if (!loadMoreDonorsBtn) return;
  
  let hasLoadedMore = false;
  
  loadMoreDonorsBtn.addEventListener('click', function() {
    if (hasLoadedMore) return;
    
    const remainingDonors = window.remainingDonors || [];
    const hasCurrency = typeof currency !== 'undefined' && currency.loaded;
    const fmtAmount = (amt) => hasCurrency ? currency.format(amt, false) : `€${parseFloat(amt).toLocaleString()}`;
    const data = (typeof window.campaignData === 'function') ? window.campaignData() : null;
    const totalDonorCount = data ? data.donorCount : 0;
    
    if (remainingDonors.length > 0 && donorsList) {
      remainingDonors.forEach(donor => {
        const donorEl = document.createElement('div');
        donorEl.className = 'bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow';
        donorEl.innerHTML = `
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-full bg-gradient-to-br ${donor.color} flex items-center justify-center text-white font-bold flex-shrink-0">${donor.initials}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-1">
                <span class="font-semibold text-gfm-dark truncate">${donor.name}</span>
                <span class="font-bold text-gfm-green flex-shrink-0">${fmtAmount(donor.amount)}</span>
              </div>
              <p class="text-sm text-gfm-gray">${donor.time}</p>
              ${donor.message ? `<p class="text-gfm-gray mt-2 text-sm italic truncate">"${donor.message}"</p>` : ''}
            </div>
          </div>
        `;
        donorsList.appendChild(donorEl);
      });
    }
    
    hasLoadedMore = true;
    
    const shownCount = 10 + (remainingDonors?.length || 0);
    const moreCount = totalDonorCount - shownCount;
    const moreText = (typeof i18n !== 'undefined' && i18n.loaded) ? i18n.t('common.donors.andMore', { count: moreCount.toLocaleString() }) : `...and ${moreCount.toLocaleString()} more donors`;
    
    if (moreCount > 0) {
      loadMoreDonorsBtn.innerHTML = `<span class="text-gfm-gray">${moreText}</span>`;
      loadMoreDonorsBtn.disabled = true;
      loadMoreDonorsBtn.classList.remove('hover:border-gfm-green', 'hover:text-gfm-green');
      loadMoreDonorsBtn.classList.add('cursor-default', 'opacity-70');
    } else {
      loadMoreDonorsBtn.style.display = 'none';
    }
  });
}
