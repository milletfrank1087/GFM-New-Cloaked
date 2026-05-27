const { toSmallestUnit, fromSmallestUnit } = require('./currency');

function decomposeAmount(amount, products, currency = 'EUR') {
  const totalUnits = toSmallestUnit(amount, currency);

  if (!products || !products.length) {
    return [{ name: 'Digital Product', slug: 'digital-product', quantity: 1, price: fromSmallestUnit(totalUnits, currency) }];
  }

  const productsUnits = products.map(p => ({ ...p, priceUnits: toSmallestUnit(p.price, currency) }));

  const exactMatch = productsUnits.find(p => p.priceUnits === totalUnits);
  if (exactMatch) {
    return [{
      name: exactMatch.name,
      slug: exactMatch.slug || 'item',
      quantity: 1,
      price: fromSmallestUnit(totalUnits, currency)
    }];
  }

  for (let i = 0; i < productsUnits.length; i++) {
    for (let j = i; j < productsUnits.length; j++) {
      const pi = productsUnits[i];
      const pj = productsUnits[j];
      if (pi.priceUnits + pj.priceUnits === totalUnits) {
        if (i === j) {
          return [{ name: pi.name, slug: pi.slug || 'item', quantity: 2, price: fromSmallestUnit(pi.priceUnits, currency) }];
        }
        return [
          { name: pi.name, slug: pi.slug || 'item', quantity: 1, price: fromSmallestUnit(pi.priceUnits, currency) },
          { name: pj.name, slug: pj.slug || 'item', quantity: 1, price: fromSmallestUnit(pj.priceUnits, currency) }
        ];
      }
    }
  }

  const sorted = [...productsUnits].sort((a, b) => b.priceUnits - a.priceUnits);
  const items = [];
  let remainingUnits = totalUnits;

  for (const product of sorted) {
    if (remainingUnits <= 0) break;
    if (product.priceUnits <= remainingUnits) {
      const qty = Math.floor(remainingUnits / product.priceUnits);
      if (qty > 0) {
        items.push({
          name: product.name,
          slug: product.slug || 'item',
          quantity: qty,
          priceUnits: product.priceUnits
        });
        remainingUnits -= product.priceUnits * qty;
      }
    }
  }

  if (remainingUnits > 0) {
    if (items.length > 0) {
      const head = items[0];
      const newHeadTotalUnits = head.priceUnits * head.quantity + remainingUnits;
      head.priceUnits = Math.floor(newHeadTotalUnits / head.quantity);
      let reconstructedTotalUnits = items.reduce((s, it) => s + it.priceUnits * it.quantity, 0);
      let delta = totalUnits - reconstructedTotalUnits;
      if (delta !== 0) {
        head.priceUnits += Math.trunc(delta / head.quantity);
        reconstructedTotalUnits = items.reduce((s, it) => s + it.priceUnits * it.quantity, 0);
        delta = totalUnits - reconstructedTotalUnits;
        if (delta !== 0) {
          items.push({
            name: head.name,
            slug: head.slug || 'item',
            quantity: 1,
            priceUnits: delta
          });
        }
      }
    } else {
      const fallback = sorted[sorted.length - 1] || { name: 'Digital Product', slug: 'digital-product' };
      items.push({
        name: fallback.name,
        slug: fallback.slug || 'item',
        quantity: 1,
        priceUnits: remainingUnits
      });
    }
  }

  return items.map(it => ({
    name: it.name,
    slug: it.slug || 'item',
    quantity: it.quantity,
    price: fromSmallestUnit(it.priceUnits, currency)
  }));
}

function toCents(value) {
  return toSmallestUnit(value, 'EUR');
}

function fromCents(cents) {
  return fromSmallestUnit(cents, 'EUR');
}

module.exports = { decomposeAmount, toCents, fromCents };
