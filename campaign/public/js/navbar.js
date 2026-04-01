/**
 * Navbar Module
 * Handles navbar scroll effects and mobile donate bar visibility
 */

function initNavbar() {
  const navbar = document.getElementById('navbar');
  const mobileDonateBar = document.getElementById('mobile-donate-bar');
  
  if (!navbar) return;
  
  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    // Add shadow and background on scroll
    if (currentScroll > 50) {
      navbar.classList.add('navbar-scrolled');
    } else {
      navbar.classList.remove('navbar-scrolled');
    }
    
    // Show/hide mobile donate bar
    if (mobileDonateBar && currentScroll > 400) {
      mobileDonateBar.classList.add('mobile-donate-visible');
    } else if (mobileDonateBar) {
      mobileDonateBar.classList.remove('mobile-donate-visible');
    }
  });
}
