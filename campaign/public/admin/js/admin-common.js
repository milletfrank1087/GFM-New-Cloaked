// Auth guard
fetch('/api/admin/check').then(r => { if (!r.ok) window.location.href = '/admin/login.html'; });

// Sidebar toggle
document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('-translate-x-full');
  document.getElementById('sidebar-overlay').classList.toggle('hidden');
});

function closeSidebar() {
  document.getElementById('sidebar').classList.add('-translate-x-full');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

function logout() {
  fetch('/api/admin/logout', { method: 'POST' }).then(() => window.location.href = '/admin/login.html');
}
