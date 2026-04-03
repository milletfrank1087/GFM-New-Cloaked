const { generateVisitorId, isLocalIP } = require('./logger');

const visitors = new Map();

function getOrCreateVisitor(ip, location) {
  const isLocal = isLocalIP(ip);

  if (visitors.has(ip)) {
    const visitor = visitors.get(ip);
    visitor.eventCount++;
    if (location?.city && location.city !== 'Unknown' && visitor.city === 'Local') {
      visitor.city = location.city;
      visitor.country = location.countryCode || location.country || visitor.country;
    }
    return { visitor, isNew: false };
  }

  const visitor = {
    id: generateVisitorId(ip),
    ip: ip,
    city: isLocal ? 'Local' : (location?.city || 'Unknown'),
    country: isLocal ? 'DEV' : (location?.countryCode || location?.country || '??'),
    firstSeen: Date.now(),
    eventCount: 1
  };
  visitors.set(ip, visitor);

  if (visitors.size > 1000) {
    const oldest = [...visitors.entries()]
      .sort((a, b) => a[1].firstSeen - b[1].firstSeen)[0];
    visitors.delete(oldest[0]);
  }

  return { visitor, isNew: true };
}

module.exports = { visitors, getOrCreateVisitor };
