const CURRENCY_SYMBOL = '\u20ac';
const CURRENCY_POSITION = 'before';
function fmt(v) {
  var s = (parseFloat(v) || 0).toFixed(2);
  return CURRENCY_POSITION === 'after' ? s + ' ' + CURRENCY_SYMBOL : CURRENCY_SYMBOL + s;
}

const Cart = {
  KEY: 'store_cart',

  get() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; }
    catch { return []; }
  },

  save(items) {
    localStorage.setItem(this.KEY, JSON.stringify(items));
    this.updateBadge();
  },

  add(name, slug, price) {
    const items = this.get();
    const existing = items.find(i => i.slug === slug);
    if (existing) {
      existing.quantity += 1;
    } else {
      items.push({ name, slug, price: parseFloat(price), quantity: 1 });
    }
    this.save(items);
    this.showNotification(name + ' added to cart');
  },

  remove(slug) {
    const items = this.get().filter(i => i.slug !== slug);
    this.save(items);
  },

  updateQuantity(slug, qty) {
    const items = this.get();
    const item = items.find(i => i.slug === slug);
    if (item) {
      item.quantity = Math.max(1, parseInt(qty) || 1);
      this.save(items);
    }
  },

  clear() {
    localStorage.removeItem(this.KEY);
    this.updateBadge();
  },

  count() {
    return this.get().reduce((sum, i) => sum + i.quantity, 0);
  },

  total() {
    return this.get().reduce((sum, i) => sum + i.price * i.quantity, 0);
  },

  updateBadge() {
    const badges = document.querySelectorAll('[data-cart-count]');
    const c = this.count();
    badges.forEach(b => {
      b.textContent = c;
      b.style.display = c > 0 ? 'flex' : 'none';
    });
  },

  showNotification(msg) {
    const existing = document.getElementById('cart-notification');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'cart-notification';
    el.style.cssText = 'position:fixed;top:20px;right:20px;background:#0f9d58;color:white;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.18);animation:slideIn 0.3s ease';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 2500);
  },

  renderCartPage() {
    const container = document.getElementById('cart-items');
    const emptyEl = document.getElementById('cart-empty');
    const filledEl = document.getElementById('cart-filled');
    const totalEl = document.getElementById('cart-total');
    const countEl = document.getElementById('cart-item-count');

    if (!container) return;

    const items = this.get();

    if (items.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      if (filledEl) filledEl.style.display = 'none';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (filledEl) filledEl.style.display = 'block';
    if (countEl) countEl.textContent = this.count() + ' item' + (this.count() !== 1 ? 's' : '');
    if (totalEl) totalEl.textContent = fmt(this.total());

    container.innerHTML = items.map(item => `
      <div class="flex items-center justify-between py-4 border-b border-neutral-100 last:border-0">
        <div class="flex items-center gap-4 flex-1">
          <div class="w-14 h-14 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
            <svg class="w-6 h-6 text-neutral-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <h3 class="font-semibold text-neutral-900 text-sm">${item.name}</h3>
            <p class="text-sm text-neutral-500">${fmt(item.price)} each</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <select onchange="Cart.updateQuantity('${item.slug}', this.value); Cart.renderCartPage();"
            class="border border-neutral-200 rounded-lg px-2 py-1 text-sm bg-white">
            ${[1,2,3,4,5].map(n => `<option value="${n}" ${item.quantity === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          <span class="font-semibold text-neutral-900 w-16 text-right">${fmt(item.price * item.quantity)}</span>
          <button onclick="Cart.remove('${item.slug}'); Cart.renderCartPage();"
            class="text-neutral-400 hover:text-rose-500 transition p-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Cart.updateBadge();
  Cart.renderCartPage();
});
