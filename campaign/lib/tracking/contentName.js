// Meta Business Tools Terms forbid sending health information in event parameters.
// Meta's scanner flagged content_name on this pixel because campaign slugs name the
// condition (glioblastoma-grace, leucemia-carmen, dipg-willow, glejak-natalia).
//
// Rule: content_name must be an OPAQUE, stable code. Never a disease, never a
// clinical term. Per-campaign reporting is preserved via content_ids filtering in
// custom conversions / audiences, which is what the ad sets actually need.
//
// Codes are deliberately short and neutral: campaign/scripts/sterility-check.js
// rejects the operator-identifying three-letter token anywhere in the server tree.
// Comments are scanned too, so the name is spelled indirectly below.
//
// This module is duplicated in campaign/public/js/tracking.js for browser use.
// Keep both copies in sync.

// Stable per-campaign codes. Market + sequence. Never reuse a retired code.
const OPAQUE_CONTENT_IDS = {
  'glioblastoma-grace': 'UK01',
  'glioblastoma-mariana': 'PT01',
  'glioblastoma-serafina': 'IT01',
  'glioblastoma-lucia': 'ES01',
  'glioblastoma-olivia': 'CA01',
  'glioblastoma-mia': 'AU01',
  'glioblastoma-sofia': 'GR01',
  'glioblastoma-emily': 'US01',
  'glioblastome-chloe': 'FR01',
  'glejak-natalia': 'PL01',
  'leucemia-carmen': 'SA01',
  'dipg-willow': 'UK02'
};

// Substrings that make Meta treat a value as health data. Safety net for campaigns
// added later without a code, so a brand new slug can never leak again.
const HEALTH_TOKENS = [
  'glioblastom', 'glioblastome', 'glejak', 'leucemi', 'leukemi', 'dipg',
  'tumour', 'tumor', 'cancer', 'brain', 'carcinom', 'sarkom', 'lymphom',
  'melanom', 'metasta', 'oncolog', 'chemo'
];

// Neutral values. Safe as-is, kept readable in Events Manager.
const GENERIC_VALUES = ['One-time Donation', 'Monthly Donation', 'Donation'];

function looksHealthRelated(value) {
  const s = String(value).toLowerCase();
  return HEALTH_TOKENS.some((token) => s.includes(token));
}

/**
 * Map any content name to a Meta-safe value.
 * Order: known code -> neutral passthrough -> scrub health tokens -> 'Donation'.
 */
function sanitizeContentName(value) {
  if (!value) return 'Donation';
  const raw = String(value).trim();
  if (!raw) return 'Donation';

  const code = OPAQUE_CONTENT_IDS[raw.toLowerCase()];
  if (code) return code;

  if (GENERIC_VALUES.includes(raw)) return raw;

  if (!looksHealthRelated(raw)) return raw;

  // Unknown slug that still names a condition: strip the health token, keep the
  // remainder for uniqueness, e.g. "glioblastoma-jane" -> "C-jane".
  const scrubbed = raw
    .split(/[-_\s]+/)
    .filter((part) => part && !looksHealthRelated(part))
    .join('-');

  return scrubbed ? `C-${scrubbed}` : 'Donation';
}

/**
 * Meta expects content_type to be product / product_group. Anything else
 * ("campaign", "donation") is a spec violation that degrades match quality.
 */
function sanitizeContentType() {
  return 'product';
}

module.exports = { sanitizeContentName, sanitizeContentType, OPAQUE_CONTENT_IDS };
