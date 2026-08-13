fetch('/api/admin/check').then(r => { if (!r.ok) window.location.href = '/admin/login.html'; });

(function injectSidebar() {
  const page = window.location.pathname;
  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>' },
    { href: '/admin/profit.html', label: 'Profit', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' },
    { href: '/admin/stores.html', label: 'Stores', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>' },
    { href: '/admin/customers.html', label: 'Customers', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>' },
    { href: '/admin/transactions.html', label: 'Transactions', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>' }
  ];

  function isActive(href) {
    if (href === '/admin') return page === '/admin' || page === '/admin/' || page === '/admin/index.html';
    return page === href;
  }

  var navHtml = navItems.map(function(item) {
    var active = isActive(item.href);
    var cls = active
      ? 'flex items-center gap-3 px-4 py-3 rounded-xl bg-gfm-green-light text-gfm-green font-medium'
      : 'flex items-center gap-3 px-4 py-3 rounded-xl text-gfm-gray hover:bg-gray-100 transition-colors';
    return '<a href="' + item.href + '" class="' + cls + '" data-mobile-nav="true"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' + item.icon + '</svg>' + item.label + '</a>';
  }).join('');

  var sidebarHtml = '<div class="p-6 border-b border-gray-100"><div class="flex items-center gap-3">'
    + '<div class="w-10 h-10 bg-gfm-green rounded-full flex items-center justify-center">'
    + '<svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
    + '</div><span class="font-bold text-gfm-dark">HopeRise</span></div></div>'
    + '<nav class="p-4 space-y-1">' + navHtml + '</nav>'
    + '<div class="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100">'
    + '<button onclick="logout()" class="flex items-center gap-3 px-4 py-3 rounded-xl text-gfm-gray hover:bg-gray-100 transition-colors w-full">'
    + '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>'
    + 'Logout</button></div>';

  var sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.innerHTML = sidebarHtml;
})();

document.getElementById('mobile-menu-btn')?.addEventListener('click', function() {
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  var open = sidebar.classList.contains('-translate-x-full');
  sidebar.classList.toggle('-translate-x-full', !open);
  overlay.classList.toggle('hidden', !open);
  this.setAttribute('aria-expanded', String(open));
});

document.querySelectorAll('[data-mobile-nav="true"]').forEach(function(link) {
  link.addEventListener('click', closeSidebar);
});

document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') closeSidebar();
});

function closeSidebar() {
  document.getElementById('sidebar').classList.add('-translate-x-full');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

function logout() {
  fetch('/api/admin/logout', { method: 'POST' }).then(function() { window.location.href = '/admin/login.html'; });
}
