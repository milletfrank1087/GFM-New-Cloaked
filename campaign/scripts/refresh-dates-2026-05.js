#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const TODAY_ISO = '2026-05-19';
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose') || DRY_RUN;

const CAMPAIGNS_DIR = path.join(__dirname, '..', 'campaigns');

function log(...args) {
  if (VERBOSE) console.log('[refresh-dates]', ...args);
}

function detectLanguage(filename) {
  const base = path.basename(filename);
  if (base.startsWith('glioblastoma-serafina') || base.startsWith('leucemia-serafina')) return 'it';
  if (base.startsWith('glioblastoma-mariana') || base.startsWith('leucemia-mariana')) return 'pt';
  if (base.startsWith('glioblastome-chloe') || base.startsWith('leucemie-chloe')) return 'fr';
  if (base.startsWith('glioblastoma-sofia') || base.startsWith('leukemia-sofia')) return 'el';
  if (base.startsWith('glejak-natalia') || base.startsWith('bialaczka-natalia')) return 'pl';
  if (base.startsWith('glioblastoma-lucia') || base.startsWith('leucemia-lucia')) return 'es';
  if (base.startsWith('glioblastoma-emily') || base.startsWith('leukemia-emily')) return 'en';
  return null;
}

function detectDisease(filename) {
  const base = path.basename(filename);
  if (base.startsWith('glioblastom') || base.startsWith('glejak')) return 'gbm';
  return 'leu';
}

const BODY_REPLACEMENTS = {
  it: {
    gbm: [
      ['Il 20 ottobre', 'Il 24 dicembre'],
      ['nell’ottobre 2025', 'nel dicembre 2025'],
      ['il 5 novembre 2025', 'il 10 gennaio 2026'],
      ['5 novembre 2025', '10 gennaio 2026'],
      ['La RM di controllo di gennaio 2026', 'La RM di controllo di marzo 2026']
    ],
    leu: [
      ['nel novembre 2025', 'nel gennaio 2026'],
      ['Il 15 novembre', 'Il 20 gennaio'],
      ['fine aprile', 'fine giugno']
    ]
  },
  pt: {
    gbm: [
      ['No dia 20 de outubro', 'No dia 24 de dezembro'],
      ['20 de outubro', '24 de dezembro'],
      ['em outubro de 2025', 'em dezembro de 2025'],
      ['outubro de 2025', 'dezembro de 2025'],
      ['no dia 5 de novembro de 2025', 'no dia 10 de janeiro de 2026'],
      ['5 de novembro de 2025', '10 de janeiro de 2026'],
      ['controlo de janeiro de 2026', 'controlo de março de 2026']
    ],
    leu: [
      ['em novembro de 2025', 'em janeiro de 2026'],
      ['15 de novembro', '20 de janeiro'],
      ['final de abril', 'final de junho'],
      ['fim de abril', 'fim de junho']
    ]
  },
  fr: {
    gbm: [
      ['Le 20 octobre', 'Le 24 décembre'],
      ['en octobre 2025', 'en décembre 2025'],
      ['le 5 novembre 2025', 'le 10 janvier 2026'],
      ['5 novembre 2025', '10 janvier 2026'],
      ['contrôle de janvier 2026', 'contrôle de mars 2026']
    ],
    leu: [
      ['en novembre 2025', 'en janvier 2026'],
      ['Le 15 novembre', 'Le 20 janvier'],
      ['fin avril', 'fin juin']
    ]
  },
  el: {
    gbm: [
      ['τον Οκτώβριο του 2025', 'τον Δεκέμβριο του 2025'],
      ['Στις 20 Οκτωβρίου', 'Στις 24 Δεκεμβρίου'],
      ['στις 5 Νοεμβρίου 2025', 'στις 10 Ιανουαρίου 2026'],
      ['5 Νοεμβρίου 2025', '10 Ιανουαρίου 2026'],
      ['ελέγχου τον Ιανουάριο 2026', 'ελέγχου τον Μάρτιο 2026']
    ],
    leu: [
      ['τον Νοέμβριο του 2025', 'τον Ιανουάριο του 2026'],
      ['Στις 15 Νοεμβρίου', 'Στις 20 Ιανουαρίου'],
      ['τέλη Απριλίου', 'τέλη Ιουνίου']
    ]
  },
  pl: {
    gbm: [
      ['20 października', '24 grudnia'],
      ['w październiku 2025', 'w grudniu 2025'],
      ['5 listopada 2025', '10 stycznia 2026'],
      ['Kontrolny MRI ze stycznia 2026', 'Kontrolny MRI z marca 2026']
    ],
    leu: [
      ['w listopadzie 2025', 'w styczniu 2026'],
      ['15 listopada', '20 stycznia'],
      ['koniec kwietnia', 'koniec czerwca']
    ]
  },
  es: {
    gbm: [
      ['El 20 de octubre', 'El 24 de diciembre'],
      ['en octubre de 2025', 'en diciembre de 2025'],
      ['el 5 de noviembre de 2025', 'el 10 de enero de 2026'],
      ['5 de noviembre de 2025', '10 de enero de 2026'],
      ['RM de control de enero de 2026', 'RM de control de marzo de 2026']
    ],
    leu: [
      ['en noviembre de 2025', 'en enero de 2026'],
      ['15 de noviembre', '20 de enero'],
      ['finales de abril', 'finales de junio']
    ]
  },
  en: {
    gbm: [
      ['On October 20th', 'On December 24th'],
      ['in October 2025', 'in December 2025'],
      ['on November 5, 2025', 'on January 10, 2026'],
      ['November 5, 2025', 'January 10, 2026'],
      ['follow-up MRI in January 2026', 'follow-up MRI in March 2026']
    ],
    leu: [
      ['in November 2025', 'in January 2026'],
      ['On November 15th', 'On January 20th'],
      ['end of April', 'end of June'],
      ['late April', 'late June']
    ]
  }
};

const CHROME_REPLACEMENTS = {
  it: { createdDate: '10 Apr 2026', updateDates: { gbm: ['14 Mag 2026', '9 Mag 2026', '25 Apr 2026', '10 Apr 2026'], leu: ['12 Mag 2026', '5 Mag 2026', '25 Apr 2026', '10 Apr 2026'] } },
  pt: { createdDate: '10 Abr 2026', updateDates: { gbm: ['14 Mai 2026', '9 Mai 2026', '25 Abr 2026', '10 Abr 2026'], leu: ['12 Mai 2026', '5 Mai 2026', '25 Abr 2026', '10 Abr 2026'] } },
  fr: { createdDate: '10 Avr 2026', updateDates: { gbm: ['14 Mai 2026', '9 Mai 2026', '25 Avr 2026', '10 Avr 2026'], leu: ['12 Mai 2026', '5 Mai 2026', '25 Avr 2026', '10 Avr 2026'] } },
  el: { createdDate: '10 Απρ 2026', updateDates: { gbm: ['14 Μαϊ 2026', '9 Μαϊ 2026', '25 Απρ 2026', '10 Απρ 2026'], leu: ['12 Μαϊ 2026', '5 Μαϊ 2026', '25 Απρ 2026', '10 Απρ 2026'] } },
  pl: { createdDate: '10 Kwi 2026', updateDates: { gbm: ['14 Maj 2026', '9 Maj 2026', '25 Kwi 2026', '10 Kwi 2026'], leu: ['12 Maj 2026', '5 Maj 2026', '25 Kwi 2026', '10 Kwi 2026'] } },
  es: { createdDate: '10 Abr 2026', updateDates: { gbm: ['14 May 2026', '9 May 2026', '25 Abr 2026', '10 Abr 2026'], leu: ['12 May 2026', '5 May 2026', '25 Abr 2026', '10 Abr 2026'] } },
  en: { createdDate: '10 Apr 2026', updateDates: { gbm: ['14 May 2026', '9 May 2026', '25 Apr 2026', '10 Apr 2026'], leu: ['12 May 2026', '5 May 2026', '25 Apr 2026', '10 Apr 2026'] } }
};

const RECENT_DONOR_TIME_BY_LANG = {
  it: ['8 minuti fa', '23 minuti fa', '47 minuti fa'],
  pt: ['8 minutos atrás', '23 minutos atrás', '47 minutos atrás'],
  fr: ['il y a 8 min', 'il y a 23 min', 'il y a 47 min'],
  el: ['πριν 8 λεπτά', 'πριν 23 λεπτά', 'πριν 47 λεπτά'],
  pl: ['8 min temu', '23 min temu', '47 min temu'],
  es: ['hace 8 minutos', 'hace 23 minutos', 'hace 47 minutos'],
  en: ['8 min ago', '23 min ago', '47 min ago']
};

function refreshFile(filePath) {
  const lang = detectLanguage(filePath);
  const disease = detectDisease(filePath);
  if (!lang) { log(`SKIP unknown language: ${filePath}`); return null; }

  const raw = fs.readFileSync(filePath, 'utf8');
  let json;
  try { json = JSON.parse(raw); } catch (e) { console.error(`FAIL parse ${filePath}: ${e.message}`); return null; }

  let textContent = JSON.stringify(json);
  const bodyMap = BODY_REPLACEMENTS[lang][disease];
  let bodyHits = 0;
  const sentinels = [];
  bodyMap.forEach(([oldStr, newStr], idx) => {
    const token = `\u0001SENT${idx}\u0001`;
    const before = textContent;
    textContent = textContent.split(oldStr).join(token);
    if (textContent !== before) { bodyHits++; sentinels.push([token, newStr]); }
  });
  for (const [token, newStr] of sentinels) {
    textContent = textContent.split(token).join(newStr);
  }
  json = JSON.parse(textContent);

  const chrome = CHROME_REPLACEMENTS[lang];
  if (json.organizer?.createdDate) json.organizer.createdDate = chrome.createdDate;
  json.daysLeft = 35;

  const updateDates = chrome.updateDates[disease];
  if (Array.isArray(json.updates)) {
    json.updates.forEach((u, idx) => {
      if (updateDates[idx]) u.date = updateDates[idx];
      u.isNew = idx === 0;
    });
  }

  if (typeof json.raised === 'number') json.raised = Math.round(json.raised * 1.20 / 10) * 10;
  if (typeof json.donorCount === 'number') json.donorCount = Math.round(json.donorCount * 1.20);

  const newTimes = RECENT_DONOR_TIME_BY_LANG[lang];
  if (Array.isArray(json.recentDonors) && newTimes) {
    for (let i = 0; i < Math.min(3, json.recentDonors.length); i++) {
      if (newTimes[i]) json.recentDonors[i].time = newTimes[i];
    }
  }

  const out = JSON.stringify(json, null, 2) + '\n';
  if (DRY_RUN) {
    log(`DRY ${path.basename(filePath)}: lang=${lang} disease=${disease} bodyHits=${bodyHits} raised=${json.raised} donorCount=${json.donorCount}`);
  } else {
    fs.writeFileSync(filePath, out, 'utf8');
    log(`WROTE ${path.basename(filePath)}: lang=${lang} disease=${disease} bodyHits=${bodyHits} raised=${json.raised} donorCount=${json.donorCount} daysLeft=${json.daysLeft}`);
  }
  return { file: filePath, lang, disease, bodyHits };
}

function main() {
  console.log(`[refresh-dates-2026-05] today=${TODAY_ISO} dryRun=${DRY_RUN}`);
  const results = [];
  for (const sub of ['glioblastoma', 'leukemia']) {
    const dir = path.join(CAMPAIGNS_DIR, sub);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const r = refreshFile(path.join(dir, file));
      if (r) results.push(r);
    }
  }
  console.log(`[refresh-dates-2026-05] processed ${results.length} campaign files (${DRY_RUN ? 'dry-run' : 'written'})`);
}

main();
