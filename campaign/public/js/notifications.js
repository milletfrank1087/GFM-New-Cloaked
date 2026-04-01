/**
 * Notifications Module
 * Handles toast notifications for user feedback
 */

function showNotification(message, type = 'info') {
  // Remove existing notification
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification fixed top-24 right-4 z-[60] px-6 py-4 rounded-xl shadow-lg transform translate-x-full transition-transform duration-300 flex items-center gap-3 max-w-[90vw] ${
    type === 'success' ? 'bg-gfm-green text-white' : 
    type === 'error' ? 'bg-red-500 text-white' : 
    'bg-gray-800 text-white'
  }`;
  
  // Icon based on type
  const icon = type === 'success' 
    ? '<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
    : '<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
  
  notification.innerHTML = `${icon}<span class="truncate">${message}</span>`;
  document.body.appendChild(notification);
  
  // Animate in
  requestAnimationFrame(() => notification.classList.remove('translate-x-full'));
  
  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    notification.classList.add('translate-x-full');
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}
