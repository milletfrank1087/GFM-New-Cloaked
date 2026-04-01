/**
 * Counters Module
 * Handles animated counters and progress bars
 */

function initCounters() {
  const counters = document.querySelectorAll('.counter');
  const progressBars = document.querySelectorAll('.progress-bar');
  
  const hasCurrency = typeof currency !== 'undefined' && currency.loaded;
  const currencySymbol = hasCurrency ? currency.getSymbol() : '€';
  const symbolAfter = hasCurrency ? currency.isAfter() : false;
  
  function formatCounter(value, isRaised) {
    const num = Math.floor(value).toLocaleString();
    if (!isRaised) return num;
    return symbolAfter ? `${num}${currencySymbol}` : `${currencySymbol}${num}`;
  }
  
  const animateCounter = (counter) => {
    const target = parseInt(counter.dataset.target) || 0;
    if (target === 0) return;
    
    const duration = 2000;
    const step = target / (duration / 16);
    let current = 0;
    const isRaised = counter.closest('[data-stat="raised"]');
    
    const updateCounter = () => {
      current += step;
      if (current < target) {
        counter.textContent = formatCounter(current, isRaised);
        requestAnimationFrame(updateCounter);
      } else {
        counter.textContent = formatCounter(target, isRaised);
      }
    };
    updateCounter();
  };
  
  // Animate progress bar width
  const animateProgressBar = (bar) => {
    const target = parseInt(bar.dataset.target) || 0;
    bar.style.width = target + '%';
  };
  
  // Intersection observer for counters
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  
  // Intersection observer for progress bars
  const progressObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateProgressBar(entry.target);
        progressObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  
  // Observe all counters and progress bars
  counters.forEach(counter => counterObserver.observe(counter));
  progressBars.forEach(bar => progressObserver.observe(bar));
}
