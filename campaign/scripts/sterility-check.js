#!/usr/bin/env node
'use strict';

/**
 * Sterility check for the campaign server — fails boot/CI if forbidden
 * operator-identifying terms appear anywhere in the campaign tree.
 *
 * Unlike the store-side check, this one does NOT block donor terminology
 * ("donor", "donation", "campaign", "fundraising") — those are legitimate
 * content on a donor-facing fundraising site. The hard blocks are limited
 * to terms that ONLY make sense to the operator behind the multi-account
 * methodology (`gfm`, `cloaked`) and to a few known-bad literal strings
 * that have been observed leaking in the past.
 *
 * Run: `node scripts/sterility-check.js` (from campaign/).
 * Wired to `prestart` in campaign/package.json so Railway boot fails
 * on regressions.
 */

const fs = require('fs');
const path = require('path');

const CAMPAIGN_ROOT = path.resolve(__dirname, '..');

const FORBIDDEN = [
  /\bgfm\b/i,
  /\bcloaked\b/i,
];

const KNOWN_BAD_LITERALS = [
  'gfm-cloaked-jwt-secret-2024',
];

const SCAN_EXTENSIONS = new Set(['.js', '.ejs', '.json', '.md', '.html', '.css', '.txt']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'scripts', 'public']);
const SKIP_FILENAMES = new Set(['.env', '.env.local', '.env.development', '.env.production']);

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.');
}

function walk(dir, hits) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
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
    const rel = path.relative(CAMPAIGN_ROOT, abs);

    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch (_) { continue; }
    if (!content) continue;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const re of FORBIDDEN) {
        if (re.test(line)) {
          hits.push({ file: rel, lineNo: i + 1, line: line.trim().slice(0, 200), match: String(re) });
        }
      }

      for (const literal of KNOWN_BAD_LITERALS) {
        if (line.indexOf(literal) !== -1) {
          hits.push({ file: rel, lineNo: i + 1, line: line.trim().slice(0, 200), match: literal });
        }
      }
    }
  }
}

function main() {
  const hits = [];
  walk(CAMPAIGN_ROOT, hits);

  if (hits.length === 0) {
    console.log('[sterility] PASS — no forbidden operator-identifying terms found.');
    return 0;
  }

  console.error(`\n[sterility] FAIL — ${hits.length} forbidden term(s) found:`);
  for (const h of hits) {
    console.error(`  ${h.file}:${h.lineNo}  match=${h.match}`);
    console.error(`    > ${h.line}`);
  }
  console.error('\nThese are operator-identifying literals that must never reach a production deploy.');
  console.error('If a finding is a false positive (extremely rare for gfm/cloaked), edit FORBIDDEN/KNOWN_BAD_LITERALS in campaign/scripts/sterility-check.js with an explicit reason.');
  return 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main };
