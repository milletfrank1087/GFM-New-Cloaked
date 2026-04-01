/**
 * FAQ Module
 * Handles FAQ accordion functionality with i18n support
 */

function initFaq() {
  const faqList = document.getElementById('faq-list');
  
  // Load FAQ questions from translations
  if (faqList && typeof i18n !== 'undefined' && i18n.translations.faq) {
    const questions = i18n.translations.faq.questions || [];
    
    faqList.innerHTML = questions.map((faq, index) => `
      <div class="faq-item bg-white rounded-xl border border-gray-200 overflow-hidden" data-aos="fade-up" data-aos-delay="${100 + (index * 50)}">
        <button class="faq-trigger w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors">
          <span class="font-semibold text-gfm-dark pr-4">${faq.q}</span>
          <svg class="w-5 h-5 text-gfm-gray flex-shrink-0 transform transition-transform duration-300 faq-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        <div class="faq-content hidden px-5 pb-4">
          <p class="text-gfm-gray leading-relaxed">${faq.a}</p>
        </div>
      </div>
    `).join('');
  }
  
  // Initialize accordion functionality
  const faqItems = document.querySelectorAll('.faq-item');
  
  faqItems.forEach(item => {
    const trigger = item.querySelector('.faq-trigger');
    const content = item.querySelector('.faq-content');
    const icon = item.querySelector('.faq-icon');
    
    if (trigger && content) {
      trigger.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        
        // Close all FAQ items
        faqItems.forEach(i => {
          i.classList.remove('active');
          const c = i.querySelector('.faq-content');
          const ic = i.querySelector('.faq-icon');
          if (c) c.classList.add('hidden');
          if (ic) ic.classList.remove('rotate-180');
        });
        
        // Open clicked item if it wasn't active
        if (!isActive) {
          item.classList.add('active');
          content.classList.remove('hidden');
          if (icon) icon.classList.add('rotate-180');
        }
      });
    }
  });
}
