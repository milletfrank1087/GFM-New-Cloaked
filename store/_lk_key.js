const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const dir = path.join(__dirname, 'stores/larkwell-home/public/img/products');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));

const MIN_LIGHT = 232;
const MAX_SAT = 16;
const HALO_LIGHT = 222;

function isBg(d, o) {
  const r = d[o], g = d[o + 1], b = d[o + 2];
  const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
  return mn >= MIN_LIGHT && mx - mn <= MAX_SAT;
}
function isLightish(d, o, thr) {
  const r = d[o], g = d[o + 1], b = d[o + 2];
  const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
  return mn >= thr && mx - mn <= MAX_SAT;
}

for (const f of files) {
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
  const { width: w, height: h, data: d } = png;
  const N = w * h;
  const removed = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  const push = (p) => {
    if (!removed[p] && isBg(d, p * 4)) {
      removed[p] = 1;
      d[p * 4 + 3] = 0;
      stack[sp++] = p;
    }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w, y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  let carved = 0;
  for (let pass = 0; pass < 2; pass++) {
    const toCut = [];
    for (let p = 0; p < N; p++) {
      if (removed[p]) continue;
      if (!isLightish(d, p * 4, HALO_LIGHT)) continue;
      const x = p % w, y = (p - x) / w;
      if ((x > 0 && removed[p - 1]) || (x < w - 1 && removed[p + 1]) ||
          (y > 0 && removed[p - w]) || (y < h - 1 && removed[p + w])) {
        toCut.push(p);
      }
    }
    for (const p of toCut) { removed[p] = 1; d[p * 4 + 3] = 0; carved++; }
  }
  const removedCount = removed.reduce((a, v) => a + v, 0);
  fs.writeFileSync(path.join(dir, f), PNG.sync.write(png));
  console.log(`${f}  transparent=${((removedCount / N) * 100).toFixed(1)}%  halo-carved=${carved}`);
}
console.log('done', files.length, 'images');
