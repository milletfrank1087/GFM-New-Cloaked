/**
 * Legal Modals Module
 * Handles Terms of Service, Privacy Policy, Cookie Policy, and Refund Policy modals
 * Uses i18n translations from legal.json
 */

function initLegalModals() {
  const legalModal = document.getElementById('legal-modal');
  const legalModalContent = document.querySelector('.legal-modal-content');
  const legalModalTitle = document.getElementById('legal-modal-title');
  const legalModalBody = document.getElementById('legal-modal-body');
  
  if (!legalModal) return;
  
  function buildLegalContent(type) {
    const legal = i18n.translations.legal;
    if (!legal || !legal[type]) return null;
    
    const data = legal[type];
    const lastUpdated = legal.lastUpdated || '';
    
    let html = `<div class="space-y-4 text-gfm-gray text-sm leading-relaxed">`;
    html += `<p class="text-gfm-dark font-semibold">${lastUpdated}</p>`;
    
    if (data.sections && Array.isArray(data.sections)) {
      data.sections.forEach(section => {
        html += `<h4 class="text-gfm-dark font-semibold mt-6">${section.heading}</h4>`;
        html += `<p>${section.content}</p>`;
      });
    }
    
    html += `</div>`;
    
    return {
      title: data.title,
      content: html
    };
  }
  
  document.querySelectorAll('.legal-modal-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalType = btn.dataset.modal;
      const content = buildLegalContent(modalType);
      
      if (content && legalModalTitle && legalModalBody) {
        legalModalTitle.textContent = content.title;
        legalModalBody.innerHTML = content.content;
        
        legalModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        setTimeout(() => {
          legalModalContent.classList.remove('scale-95', 'opacity-0');
          legalModalContent.classList.add('scale-100', 'opacity-100');
        }, 10);
      }
    });
  });
  
  document.querySelectorAll('.close-legal-modal, .legal-modal-overlay').forEach(btn => {
    btn.addEventListener('click', closeLegalModal);
  });
}

function closeLegalModal() {
  const legalModal = document.getElementById('legal-modal');
  const legalModalContent = document.querySelector('.legal-modal-content');
  
  if (!legalModal || !legalModalContent) return;
  
  legalModalContent.classList.remove('scale-100', 'opacity-100');
  legalModalContent.classList.add('scale-95', 'opacity-0');
  
  setTimeout(() => {
    legalModal.classList.add('hidden');
    document.body.style.overflow = '';
  }, 200);
}
