#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickCent(rand, allowed) {
  return allowed[Math.floor(rand() * allowed.length)];
}

function jitter(rand, base, pct) {
  const delta = (rand() * 2 - 1) * pct;
  return Math.max(0, base * (1 + delta));
}

function roundIrregular(value, rand) {
  const allowedCents = [7, 9, 17, 19, 27, 29, 37, 39, 47, 49, 57, 59, 67, 69, 77, 79, 87, 89, 97, 99];
  if (value < 10) {
    const dollars = Math.max(1, Math.round(value));
    const tens = Math.floor(rand() * 9);
    const cents = pickCent(rand, allowedCents);
    return dollars - 1 + (tens / 10) + (cents / 1000);
  }
  if (value < 100) {
    const whole = Math.max(1, Math.round(value - 0.5));
    return whole - 1 + (pickCent(rand, allowedCents) / 100);
  }
  if (value < 250) {
    const whole = Math.max(1, Math.round(value));
    return whole - 1 + (pickCent(rand, allowedCents) / 100);
  }
  const whole = Math.round(value / 5) * 5;
  const cents = rand() < 0.5 ? 0 : (pickCent(rand, allowedCents) / 100);
  return Math.max(1, whole - (cents > 0 ? 1 : 0)) + cents;
}

function generateVector(seedStr) {
  const seed = fnv1a(`${seedStr}::pricing::v1`);
  const rand = mulberry32(seed);
  const targets = [4.5, 6.5, 8.5, 10, 12, 15, 18, 21, 25, 28, 32, 36, 40, 45, 50, 60, 68, 78, 90, 105, 150, 200, 260, 480];
  const jittered = targets.map(t => jitter(rand, t, 0.20));
  const rounded = jittered.map(v => Number(roundIrregular(v, rand).toFixed(2)));
  const seen = new Set();
  for (let i = 0; i < rounded.length; i++) {
    let v = rounded[i];
    let attempts = 0;
    while (seen.has(v) && attempts < 20) {
      v = Number(roundIrregular(jitter(rand, targets[i], 0.25), rand).toFixed(2));
      attempts++;
    }
    rounded[i] = v;
    seen.add(v);
  }
  return rounded.sort((a, b) => a - b);
}

function rewriteConfigPrices(configPath, prices) {
  const src = fs.readFileSync(configPath, 'utf8');
  const productBlockMatch = src.match(/products:\s*\[([\s\S]*?)\n\s*\],?\s*\n\}/);
  if (!productBlockMatch) {
    throw new Error(`Could not locate products array in ${configPath}`);
  }
  const productBlock = productBlockMatch[1];
  const productEntries = [];
  const entryRegex = /\{\s*[\s\S]*?\}/g;
  let m;
  while ((m = entryRegex.exec(productBlock)) !== null) {
    productEntries.push({ index: m.index, text: m[0] });
  }
  if (productEntries.length !== prices.length) {
    throw new Error(`${configPath}: found ${productEntries.length} products, need ${prices.length}`);
  }
  let updatedBlock = productBlock;
  for (let i = productEntries.length - 1; i >= 0; i--) {
    const entry = productEntries[i];
    const replaced = entry.text.replace(/price:\s*[\d.]+/, `price: ${prices[i].toFixed(2)}`);
    updatedBlock = updatedBlock.slice(0, entry.index) + replaced + updatedBlock.slice(entry.index + entry.text.length);
  }
  const updated = src.replace(productBlock, updatedBlock);
  fs.writeFileSync(configPath, updated, 'utf8');
}

function main() {
  const storesDir = path.resolve(__dirname, '..', 'stores');
  const stores = fs.readdirSync(storesDir).filter(name => {
    const cfg = path.join(storesDir, name, 'config.js');
    return fs.existsSync(cfg);
  });

  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const onlyStore = process.argv.find(a => a.startsWith('--store='));
  const filter = onlyStore ? onlyStore.split('=')[1] : null;

  for (const storeId of stores) {
    if (filter && storeId !== filter) continue;
    const cfg = path.join(storesDir, storeId, 'config.js');
    const prices = generateVector(storeId);
    console.log(`[${storeId}] generated ${prices.length} prices: ${prices.join(', ')}`);
    if (!dryRun) {
      rewriteConfigPrices(cfg, prices);
      console.log(`[${storeId}] wrote ${cfg}`);
    }
  }

  if (dryRun) console.log('(dry-run — no files written)');
}

if (require.main === module) {
  try { main(); } catch (err) { console.error(err.message); process.exit(1); }
}

module.exports = { generateVector, rewriteConfigPrices };
