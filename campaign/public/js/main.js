/**
 * Main Entry Point
 * Orchestrates initialization of all modules after components are loaded
 */

async function initApp() {
  AOS.init({
    duration: 800,
    easing: 'ease-out-cubic',
    once: true,
    offset: 50
  });

  if (typeof loadCampaignData === 'function') {
    const data = await loadCampaignData();
    if (data && typeof renderCampaign === 'function') {
      renderCampaign(data);
    }
  }

  initGallery();
  initNavbar();
  initDonors();
  initDonation();
  initFaq();
  initCounters();
  initModal();
  initLegalModals();
  initReadMore();
  initMisc();

  console.log('🚀 HopeRise initialized');
  console.log('💳 Payment integration ready');
}
