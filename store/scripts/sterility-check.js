#!/usr/bin/env node
'use strict';

/**
 * Sterility check — fails the boot/CI if forbidden operator-identifying terms
 * appear outside an explicit allowlist of donor-facing locations.
 *
 * Forbidden terms cluster the store with the campaign infrastructure when
 * leaked to logs, error messages, or operator surfaces a Stripe analyst might
 * see during a manual review.
 *
 * Run with: `node scripts/sterility-check.js` (from store/).
 * Wired to `prestart` in package.json so Railway boot fails on regressions.
 */

const fs = require('fs');
const path = require('path');

const STORE_ROOT = path.resolve(__dirname, '..');

const FORBIDDEN = [
  /\bgfm\b/i,
  /\bcloaked\b/i,
  /\bfundrais/i,
];

const DONOR_FACING_TERMS = [
  /\bdonation/i,
  /\bdonate\b/i,
  /\bdonor\b/i,
];

const SCAN_EXTENSIONS = new Set(['.js', '.ejs', '.json', '.md', '.html', '.css', '.txt']);

const SKIP_DIRS = new Set(['node_modules', '.git', 'public', '.well-known', 'scripts']);
const SKIP_FILENAMES = new Set(['.env', '.env.local', '.env.development', '.env.production']);

const ALLOWLIST = [
  /^lib[\\/]locale\.js$/,
  /^lib[\\/]email\.js$/,
  /^lib[\\/]stripe-errors\.js$/,
  /^lib[\\/]campaign-routing\.js$/,
  /^routes[\\/]stripe\.js$/,
  /^routes[\\/]paypal\.js$/,
  /^routes[\\/]token\.js$/,
  /^stores[\\/][^\\/]+[\\/]views[\\/]pages[\\/]checkout-donor\.ejs$/,
  /^stores[\\/][^\\/]+[\\/]views[\\/]pages[\\/]checkout-sanctuary\.ejs$/,
  /^views[\\/]pages[\\/]checkout-sanctuary\.ejs$/,
  /^views[\\/]pages[\\/]checkout-donor-v2\.ejs$/,
];

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.');
}

function isAllowed(relPath) {
  return ALLOWLIST.some(re => re.test(relPath));
}

function walk(dir, hits) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) walk(path.join(dir, entry.name), hits);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIP_FILENAMES.has(entry.name)) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (ext && !SCAN_EXTENSIONS.has(ext)) continue;
    if (entry.name.endsWith('.min.js') || entry.name.endsWith('.min.css')) continue;
    if (entry.name === 'package-lock.json') continue;

    const abs = path.join(dir, entry.name);
    const rel = path.relative(STORE_ROOT, abs);
    const allowed = isAllowed(rel);

    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch (_) { continue; }
    if (!content) continue;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const re of FORBIDDEN) {
        if (re.test(line)) {
          hits.push({ severity: 'hard', file: rel, lineNo: i + 1, line: line.trim().slice(0, 200), match: String(re) });
        }
      }

      if (!allowed) {
        for (const re of DONOR_FACING_TERMS) {
          if (re.test(line)) {
            hits.push({ severity: 'soft', file: rel, lineNo: i + 1, line: line.trim().slice(0, 200), match: String(re) });
          }
        }
      }
    }
  }
}

function main() {
  const hits = [];
  walk(STORE_ROOT, hits);

  const hard = hits.filter(h => h.severity === 'hard');
  const soft = hits.filter(h => h.severity === 'soft');

  if (hard.length === 0 && soft.length === 0) {
    console.log('[sterility] PASS — no forbidden terms found.');
    return 0;
  }

  if (hard.length > 0) {
    console.error(`\n[sterility] FAIL — ${hard.length} forbidden term(s) outside allowlist:`);
    for (const h of hard) {
      console.error(`  ${h.file}:${h.lineNo}  match=${h.match}`);
      console.error(`    > ${h.line}`);
    }
  }

  if (soft.length > 0) {
    console.error(`\n[sterility] WARN — ${soft.length} donor-facing term(s) outside the known donor surface (lib/locale.js, lib/stripe-errors.js, routes/{stripe,paypal,token}.js, checkout-donor.ejs):`);
    for (const h of soft) {
      console.error(`  ${h.file}:${h.lineNo}  match=${h.match}`);
      console.error(`    > ${h.line}`);
    }
    console.error('\nIf a NEW location must use donor terminology, update ALLOWLIST in store/scripts/sterility-check.js with an explicit allowlist entry.');
  }

  if (hard.length > 0) return 1;
  if (process.env.STERILITY_STRICT === '1' && soft.length > 0) return 1;
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main };
