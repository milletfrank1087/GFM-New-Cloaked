const gradientColors = [
  'from-blue-400 to-blue-500',
  'from-violet-400 to-violet-500',
  'from-rose-400 to-rose-500',
  'from-amber-400 to-amber-500',
  'from-emerald-400 to-emerald-500',
  'from-cyan-400 to-cyan-500',
  'from-pink-400 to-pink-500',
  'from-indigo-400 to-indigo-500',
];

function getRandomGradient() {
  return gradientColors[Math.floor(Math.random() * gradientColors.length)];
}

function getInitials(name) {
  if (!name || name === 'Anonymous') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
}

module.exports = { getRandomGradient, getInitials, formatTimeAgo };
