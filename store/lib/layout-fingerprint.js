'use strict';

const VARIANTS = {
  'haven-prints': {
    bodyClass: 'font-inter min-h-screen flex flex-col text-gray-800 antialiased',
    headerClass: 'bg-white border-b border-gray-100 sticky top-0 z-50',
    navClass: 'nav-drawer',
    navId: 'nav-drawer',
    overlayClass: 'nav-overlay',
    overlayId: 'nav-overlay',
    fontStack: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
    descriptionFallback: 'Home decor, wall art prints and interior furnishing resources',
    style: variantA,
  },
  'digitelon': {
    bodyClass: 'font-inter min-h-screen flex flex-col text-slate-800 leading-relaxed',
    headerClass: 'bg-white border-b border-slate-100 sticky top-0 z-40 shadow-sm',
    navClass: 'side-panel',
    navId: 'side-panel',
    overlayClass: 'panel-scrim',
    overlayId: 'panel-scrim',
    fontStack: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
    descriptionFallback: 'Digital tools and creative assets for modern makers.',
    style: variantB,
  },
  'zenflow-tools': {
    bodyClass: 'font-inter min-h-screen flex flex-col text-zinc-800 subpixel-antialiased',
    headerClass: 'bg-white border-b border-zinc-100 sticky top-0 z-50',
    navClass: 'menu-drawer',
    navId: 'menu-drawer',
    overlayClass: 'menu-backdrop',
    overlayId: 'menu-backdrop',
    fontStack: ['Inter', '"Helvetica Neue"', 'Arial', 'sans-serif'],
    descriptionFallback: 'Productivity templates and workflow assets for modern teams.',
    style: variantC,
  },
  'nova-essentials': {
    bodyClass: 'font-inter min-h-screen flex flex-col text-stone-800 antialiased',
    headerClass: 'bg-white border-b border-stone-200 sticky top-0 z-50',
    navClass: 'drawer-pane',
    navId: 'drawer-pane',
    overlayClass: 'drawer-shade',
    overlayId: 'drawer-shade',
    fontStack: ['Inter', 'Helvetica', 'Arial', 'sans-serif'],
    descriptionFallback: 'Calm planners and home organisation tools.',
    style: variantD,
  },
  'alzworks-digital': {
    bodyClass: 'font-inter min-h-screen flex flex-col text-gray-700',
    headerClass: 'bg-white/95 border-b border-gray-200 sticky top-0 z-50 backdrop-blur-sm',
    navClass: 'rail-panel',
    navId: 'rail-panel',
    overlayClass: 'rail-veil',
    overlayId: 'rail-veil',
    fontStack: ['Inter', '"Segoe UI"', 'Roboto', 'sans-serif'],
    descriptionFallback: 'Digital marketing tools, creative kits and brand assets for modern teams.',
    style: variantE,
  },
};

function variantA(colors) {
  const p = colors.primary || '#00b964';
  const a = colors.accent || '#02a95c';
  const b = colors.bg || '#ffffff';
  return `:root { --color-primary: ${p}; --color-accent: ${a}; --color-bg: ${b}; }
    .btn-primary { background-color: var(--color-primary); }
    .btn-primary:hover { filter: brightness(1.08); }
    .text-primary { color: var(--color-primary); }
    .bg-primary { background-color: var(--color-primary); }
    .border-primary { border-color: var(--color-primary); }
    .ring-primary { --tw-ring-color: var(--color-primary); }
    .bg-primary-50 { background-color: color-mix(in srgb, var(--color-primary) 8%, white); }
    .bg-primary-100 { background-color: color-mix(in srgb, var(--color-primary) 15%, white); }
    .text-accent { color: var(--color-accent); }
    .bg-accent { background-color: var(--color-accent); }
    body { background-color: var(--color-bg); }
    ::selection { background-color: var(--color-primary); color: white; }
    input:focus, textarea:focus, select:focus { border-color: var(--color-primary) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 12%, transparent); outline: none; }
    .nav-drawer { transform: translateX(100%); transition: transform 0.25s cubic-bezier(0.4,0,0.2,1); }
    .nav-drawer.open { transform: translateX(0); }
    .nav-overlay { opacity: 0; pointer-events: none; transition: opacity 0.25s ease; }
    .nav-overlay.open { opacity: 1; pointer-events: auto; }
    html { scroll-behavior: smooth; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }`;
}

function variantB(colors) {
  const p = colors.primary || '#6366f1';
  const a = colors.accent || '#4f46e5';
  const b = colors.bg || '#ffffff';
  return `:root {
      --brand-fg: ${p};
      --brand-alt: ${a};
      --brand-bg: ${b};
      --brand-mute: color-mix(in srgb, ${p} 60%, #94a3b8);
    }
    body { background-color: var(--brand-bg); }
    ::selection { background-color: var(--brand-fg); color: #fff; }
    .bg-primary { background-color: var(--brand-fg); }
    .bg-accent { background-color: var(--brand-alt); }
    .bg-primary-50 { background-color: color-mix(in srgb, var(--brand-fg) 7%, white); }
    .bg-primary-100 { background-color: color-mix(in srgb, var(--brand-fg) 14%, white); }
    .text-primary { color: var(--brand-fg); }
    .text-accent { color: var(--brand-alt); }
    .border-primary { border-color: var(--brand-fg); }
    .ring-primary { --tw-ring-color: var(--brand-fg); }
    .btn-primary { background-color: var(--brand-fg); transition: background-color 0.18s ease-in-out, transform 0.18s ease-in-out; }
    .btn-primary:hover { background-color: var(--brand-alt); transform: translateY(-1px); }
    input:focus, textarea:focus, select:focus {
      border-color: var(--brand-fg) !important;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-fg) 14%, transparent);
      outline: none;
    }
    .side-panel { transform: translateX(100%); transition: transform 0.22s ease-in-out; }
    .side-panel.open { transform: translateX(0); }
    .panel-scrim { opacity: 0; pointer-events: none; transition: opacity 0.22s ease-in-out; }
    .panel-scrim.open { opacity: 1; pointer-events: auto; }
    html { scroll-behavior: smooth; }
    .dgt-anchor { scroll-margin-top: 72px; }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      .btn-primary { transition: none; }
    }`;
}

function variantC(colors) {
  const p = colors.primary || '#0ea5e9';
  const a = colors.accent || '#0284c7';
  const b = colors.bg || '#ffffff';
  return `:root { --c-key: ${p}; --c-sub: ${a}; --c-page: ${b}; }
    @keyframes zf-pulse {
      0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c-key) 35%, transparent); }
      50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--c-key) 0%, transparent); }
    }
    html { scroll-behavior: smooth; }
    body { background-color: var(--c-page); }
    ::selection { background-color: var(--c-key); color: #fff; }
    .btn-primary, .bg-primary { background-color: var(--c-key); }
    .btn-primary:hover { background-color: var(--c-sub); }
    .text-primary { color: var(--c-key); }
    .text-accent { color: var(--c-sub); }
    .border-primary { border-color: var(--c-key); }
    .ring-primary { --tw-ring-color: var(--c-key); }
    .bg-primary-50 { background-color: color-mix(in srgb, var(--c-key) 6%, white); }
    .bg-primary-100 { background-color: color-mix(in srgb, var(--c-key) 12%, white); }
    .btn-primary.pulse { animation: zf-pulse 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite; }
    input:focus, textarea:focus, select:focus { border-color: var(--c-key) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-key) 16%, transparent); outline: none; }
    .menu-drawer { transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    .menu-drawer.open { transform: translateX(0); }
    .menu-backdrop { opacity: 0; pointer-events: none; transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    .menu-backdrop.open { opacity: 1; pointer-events: auto; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } .btn-primary.pulse { animation: none; } }`;
}

function variantD(colors) {
  const p = colors.primary || '#d97706';
  const a = colors.accent || '#b45309';
  const b = colors.bg || '#fffaf3';
  return `:root {
      --tone-main: ${p};
      --tone-sec: ${a};
      --tone-base: ${b};
      --tone-soft: color-mix(in srgb, ${p} 10%, #fff);
      --tone-line: color-mix(in srgb, ${p} 22%, #e7e5e4);
    }
    body { background-color: var(--tone-base); }
    .bg-primary { background-color: var(--tone-main); }
    .text-primary { color: var(--tone-main); }
    .text-accent { color: var(--tone-sec); }
    .border-primary { border-color: var(--tone-main); }
    .ring-primary { --tw-ring-color: var(--tone-main); }
    .bg-primary-50 { background-color: var(--tone-soft); }
    .bg-primary-100 { background-color: color-mix(in srgb, var(--tone-main) 18%, white); }
    .btn-primary { background-color: var(--tone-main); transition: background-color 0.22s cubic-bezier(0.2, 0, 0.2, 1); }
    .btn-primary:hover { background-color: var(--tone-sec); }
    ::selection { background-color: var(--tone-main); color: #fff; }
    .nv-card { border: 1px solid var(--tone-line); }
    input:focus, textarea:focus, select:focus { border-color: var(--tone-main) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--tone-main) 13%, transparent); outline: none; }
    .drawer-pane { transform: translateX(100%); transition: transform 0.22s cubic-bezier(0.2, 0, 0.2, 1); }
    .drawer-pane.open { transform: translateX(0); }
    .drawer-shade { opacity: 0; pointer-events: none; transition: opacity 0.22s cubic-bezier(0.2, 0, 0.2, 1); }
    .drawer-shade.open { opacity: 1; pointer-events: auto; }
    html { scroll-behavior: smooth; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } .btn-primary { transition: none; } }`;
}

function variantE(colors) {
  const p = colors.primary || '#5b6cff';
  const a = colors.accent || '#4253e6';
  const b = colors.bg || '#ffffff';
  return `:root { --hue-main: ${p}; --hue-alt: ${a}; --hue-back: ${b}; }
    body { background-color: var(--hue-back); }
    .glass-panel { backdrop-filter: blur(8px) saturate(140%); -webkit-backdrop-filter: blur(8px) saturate(140%); background-color: rgba(255, 255, 255, 0.78); }
    .bg-primary { background-color: var(--hue-main); }
    .bg-accent { background-color: var(--hue-alt); }
    .text-primary { color: var(--hue-main); }
    .text-accent { color: var(--hue-alt); }
    .border-primary { border-color: var(--hue-main); }
    .ring-primary { --tw-ring-color: var(--hue-main); }
    .bg-primary-50 { background-color: color-mix(in srgb, var(--hue-main) 6%, white); }
    .bg-primary-100 { background-color: color-mix(in srgb, var(--hue-main) 13%, white); }
    .btn-primary { background-color: var(--hue-main); transition: background-color 0.18s ease, box-shadow 0.18s ease; }
    .btn-primary:hover { background-color: var(--hue-alt); box-shadow: 0 8px 18px -8px color-mix(in srgb, var(--hue-main) 60%, transparent); }
    ::selection { background-color: var(--hue-main); color: #fff; }
    input:focus, textarea:focus, select:focus { border-color: var(--hue-main) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--hue-main) 15%, transparent); outline: none; }
    .rail-panel { transform: translateX(100%); transition: transform 0.18s ease; }
    .rail-panel.open { transform: translateX(0); }
    .rail-veil { opacity: 0; pointer-events: none; transition: opacity 0.18s ease; }
    .rail-veil.open { opacity: 1; pointer-events: auto; }
    html { scroll-behavior: smooth; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } .btn-primary { transition: none; } }`;
}

function buildStyleBlock(variant, store) {
  const colors = store && store.colors ? store.colors : {};
  return variant.style(colors);
}

function buildHead(variant, store, pageTitle) {
  const title = pageTitle ? `${pageTitle} | ${store.name}` : store.name;
  const desc = store.tagline || `${store.name} — ${variant.descriptionFallback}`;
  const fontFamily = variant.fontStack.join(', ');
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = { theme: { extend: { fontFamily: { inter: [${variant.fontStack.map(f => JSON.stringify(f.replace(/"/g, ''))).join(', ')}] } } } }
  </script>
  <style>${buildStyleBlock(variant, store)}</style>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function getLayoutFingerprint(storeId) {
  const variant = VARIANTS[storeId];
  if (!variant) {
    throw new Error(`No layout fingerprint defined for store '${storeId}'. Add one in lib/layout-fingerprint.js.`);
  }
  return {
    bodyClass: variant.bodyClass,
    headerClass: variant.headerClass,
    navClass: variant.navClass,
    navId: variant.navId,
    overlayClass: variant.overlayClass,
    overlayId: variant.overlayId,
    head: (store, pageTitle) => buildHead(variant, store, pageTitle),
    styleBlock: (store) => buildStyleBlock(variant, store),
  };
}

module.exports = { getLayoutFingerprint, VARIANTS };
