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
  'optimisystems': {
    bodyClass: 'font-inter min-h-screen flex flex-col text-stone-700',
    headerClass: 'bg-white/92 border-b border-stone-100 sticky top-0 z-40 backdrop-blur',
    navClass: 'opt-menu-pane',
    navId: 'opt-menu-pane',
    overlayClass: 'opt-menu-veil',
    overlayId: 'opt-menu-veil',
    fontStack: ['Inter', '"SF Pro Display"', 'BlinkMacSystemFont', '-apple-system', 'sans-serif'],
    descriptionFallback: 'Lead generation toolkits, ad creative and sales playbooks for installer agencies.',
    style: variantF,
  },
  'precious-couture': {
    bodyClass: 'font-inter min-h-screen flex flex-col text-stone-700 selection:bg-rose-100 tracking-normal',
    headerClass: 'bg-white/90 border-b border-stone-100 sticky top-0 z-30 backdrop-blur-sm',
    navClass: 'pc-menu-pane',
    navId: 'pc-menu-pane',
    overlayClass: 'pc-menu-veil',
    overlayId: 'pc-menu-veil',
    fontStack: ['Inter', '"Avenir Next"', '"Segoe UI"', 'sans-serif'],
    descriptionFallback: 'Sewing patterns, styling guides and lookbooks for the modern women\u2019s wardrobe.',
    style: variantG,
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

function variantF(colors) {
  const p = colors.primary || '#0f9d58';
  const a = colors.accent || '#0b7a44';
  const b = colors.bg || '#fafafa';
  return `@keyframes opt-slide-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideIn { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes opt-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
    @keyframes opt-pulse-ring { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, ${p} 45%, transparent); } 70% { box-shadow: 0 0 0 14px color-mix(in srgb, ${p} 0%, transparent); } 100% { box-shadow: 0 0 0 0 transparent; } }
    @keyframes opt-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
    @keyframes opt-sheen { 0% { background-position: -160% 0; } 100% { background-position: 260% 0; } }
    @keyframes opt-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    input:focus, textarea:focus, select:focus { border-color: ${p} !important; box-shadow: 0 0 0 4px color-mix(in srgb, ${p} 11%, transparent); outline: 0; }
    :root { --opt-key: ${p}; --opt-mark: ${a}; --opt-canvas: ${b}; --opt-rest: color-mix(in srgb, ${p} 9%, white); --opt-line: color-mix(in srgb, ${p} 18%, #e7e1d6); --opt-ink: #20160c; --opt-sky: #cf9b56; }
    body { background-color: var(--opt-canvas); }
    ::selection { background-color: var(--opt-key); color: #fff; }
    .text-primary { color: var(--opt-key); }
    .text-accent { color: var(--opt-mark); }
    .bg-primary { background-color: var(--opt-key); }
    .bg-accent { background-color: var(--opt-mark); }
    .bg-primary-50 { background-color: var(--opt-rest); }
    .bg-primary-100 { background-color: color-mix(in srgb, var(--opt-key) 16%, white); }
    .border-primary { border-color: var(--opt-key); }
    .ring-primary { --tw-ring-color: var(--opt-key); }
    .btn-primary { background-color: var(--opt-key); transition: filter 0.16s linear, transform 0.16s ease-out, box-shadow 0.18s ease; }
    .btn-primary:hover { filter: brightness(1.06); transform: translateY(-1px); box-shadow: 0 12px 26px -14px color-mix(in srgb, ${p} 72%, transparent); }
    .opt-fade { animation: opt-slide-in 0.32s cubic-bezier(0.32, 0.72, 0.36, 1.04); }
    .opt-card { border: 1px solid var(--opt-line); }
    .opt-lift { transition: transform 0.22s cubic-bezier(0.32, 0.72, 0.36, 1.04), box-shadow 0.22s ease, border-color 0.22s ease; }
    .opt-lift:hover { transform: translateY(-3px); box-shadow: 0 20px 44px -26px color-mix(in srgb, var(--opt-ink) 60%, transparent); border-color: color-mix(in srgb, var(--opt-key) 45%, var(--opt-line)); }
    .opt-grad-text { background: linear-gradient(118deg, var(--opt-key), color-mix(in srgb, var(--opt-key) 50%, var(--opt-sky))); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .opt-mesh { background-image: radial-gradient(58% 60% at 86% 6%, color-mix(in srgb, var(--opt-key) 16%, transparent) 0%, transparent 60%), radial-gradient(48% 52% at 8% 0%, color-mix(in srgb, var(--opt-sky) 14%, transparent) 0%, transparent 58%), radial-gradient(46% 60% at 50% 108%, color-mix(in srgb, var(--opt-mark) 12%, transparent) 0%, transparent 62%); }
    .opt-grid-bg { background-image: linear-gradient(color-mix(in srgb, var(--opt-key) 8%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--opt-key) 8%, transparent) 1px, transparent 1px); background-size: 30px 30px; -webkit-mask-image: radial-gradient(72% 60% at 50% 28%, #000 0%, transparent 76%); mask-image: radial-gradient(72% 60% at 50% 28%, #000 0%, transparent 76%); }
    .opt-glass { background: color-mix(in srgb, #ffffff 80%, transparent); backdrop-filter: blur(12px) saturate(140%); -webkit-backdrop-filter: blur(12px) saturate(140%); }
    .opt-float { animation: opt-float 6.5s ease-in-out infinite; }
    .opt-ring { animation: opt-pulse-ring 2.6s ease-out infinite; }
    .opt-bar { transform-origin: bottom; animation: opt-grow 0.95s cubic-bezier(0.32, 0.72, 0.36, 1.04) both; }
    .opt-sheen { background: linear-gradient(110deg, transparent 20%, color-mix(in srgb, #ffffff 55%, transparent) 42%, transparent 64%); background-size: 220% 100%; animation: opt-sheen 2.8s ease-in-out infinite; }
    .opt-link { position: relative; }
    .opt-link::after { content: ''; position: absolute; left: 0; bottom: -3px; height: 2px; width: 100%; background: var(--opt-key); border-radius: 2px; transform: scaleX(0); transform-origin: right; transition: transform 0.26s ease; }
    .opt-link:hover::after, .opt-link.is-active::after { transform: scaleX(1); transform-origin: left; }
    .opt-chip { transition: background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.18s ease; }
    .opt-chip:hover { transform: translateY(-1px); }
    .opt-marquee-track { display: inline-flex; animation: opt-marquee 26s linear infinite; }
    .opt-marquee:hover .opt-marquee-track { animation-play-state: paused; }
    .opt-head-scrolled { box-shadow: 0 8px 30px -22px color-mix(in srgb, var(--opt-ink) 70%, transparent); }
    .opt-menu-pane { transform: translateX(100%); transition: transform 0.26s cubic-bezier(0.32, 0.72, 0.36, 1.04); }
    .opt-menu-pane.open { transform: translateX(0); }
    .opt-menu-veil { opacity: 0; pointer-events: none; transition: opacity 0.26s cubic-bezier(0.32, 0.72, 0.36, 1.04); }
    .opt-menu-veil.open { opacity: 1; pointer-events: auto; }
    .opt-js .opt-reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.62s cubic-bezier(0.22, 0.61, 0.36, 1), transform 0.62s cubic-bezier(0.22, 0.61, 0.36, 1); }
    .opt-js .opt-reveal.opt-in { opacity: 1; transform: none; }
    html { scroll-behavior: smooth; }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      .btn-primary, .opt-lift, .opt-chip { transition: none; }
      .opt-fade, .opt-float, .opt-ring, .opt-bar, .opt-sheen, .opt-marquee-track { animation: none; }
      .opt-js .opt-reveal { opacity: 1; transform: none; transition: none; }
    }`;
}

function variantG(colors) {
  const p = colors.primary || '#b76e79';
  const a = colors.accent || '#9c5760';
  const b = colors.bg || '#fbf8f7';
  return `@keyframes pc-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    :root {
      --pc-rose: ${p};
      --pc-plum: ${a};
      --pc-paper: ${b};
      --pc-blush: color-mix(in srgb, ${p} 10%, white);
      --pc-edge: color-mix(in srgb, ${p} 20%, #ede9e8);
    }
    body { background-color: var(--pc-paper); }
    ::selection { background-color: var(--pc-rose); color: #fff; }
    .text-primary { color: var(--pc-rose); }
    .text-accent { color: var(--pc-plum); }
    .bg-primary { background-color: var(--pc-rose); }
    .bg-accent { background-color: var(--pc-plum); }
    .bg-primary-50 { background-color: var(--pc-blush); }
    .bg-primary-100 { background-color: color-mix(in srgb, var(--pc-rose) 16%, white); }
    .border-primary { border-color: var(--pc-rose); }
    .ring-primary { --tw-ring-color: var(--pc-rose); }
    .btn-primary { background-color: var(--pc-rose); transition: background-color 0.28s cubic-bezier(0.33, 0, 0.2, 1), transform 0.28s cubic-bezier(0.33, 0, 0.2, 1); }
    .btn-primary:hover { background-color: var(--pc-plum); transform: translateY(-1px); }
    .pc-card { border: 1px solid var(--pc-edge); }
    .pc-fade { animation: pc-rise 0.34s cubic-bezier(0.33, 0, 0.2, 1); }
    input:focus, textarea:focus, select:focus { border-color: var(--pc-rose) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--pc-rose) 12%, transparent); outline: 0; }
    .pc-menu-pane { transform: translateX(100%); transition: transform 0.28s cubic-bezier(0.33, 0, 0.2, 1); }
    .pc-menu-pane.open { transform: translateX(0); }
    .pc-menu-veil { opacity: 0; pointer-events: none; transition: opacity 0.28s cubic-bezier(0.33, 0, 0.2, 1); }
    .pc-menu-veil.open { opacity: 1; pointer-events: auto; }
    html { scroll-behavior: smooth; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } .btn-primary { transition: none; } .pc-fade { animation: none; } }`;
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
