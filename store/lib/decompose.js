function toCents(value) {
  return Math.round(parseFloat(value) * 100);
}

function fromCents(cents) {
  return Math.round(cents) / 100;
}

function decomposeAmount(amount, products) {
  const totalCents = toCents(amount);

  if (!products || !products.length) {
    return [{ name: 'Digital Product', slug: 'digital-product', quantity: 1, price: fromCents(totalCents) }];
  }

  const productsCents = products.map(p => ({ ...p, priceCents: toCents(p.price) }));

  const exactMatch = productsCents.find(p => p.priceCents === totalCents);
  if (exactMatch) {
    return [{
      name: exactMatch.name,
      slug: exactMatch.slug || 'item',
      quantity: 1,
      price: fromCents(totalCents)
    }];
  }

  for (let i = 0; i < productsCents.length; i++) {
    for (let j = i; j < productsCents.length; j++) {
      const pi = productsCents[i];
      const pj = productsCents[j];
      if (pi.priceCents + pj.priceCents === totalCents) {
        if (i === j) {
          return [{ name: pi.name, slug: pi.slug || 'item', quantity: 2, price: fromCents(pi.priceCents) }];
        }
        return [
          { name: pi.name, slug: pi.slug || 'item', quantity: 1, price: fromCents(pi.priceCents) },
          { name: pj.name, slug: pj.slug || 'item', quantity: 1, price: fromCents(pj.priceCents) }
        ];
      }
    }
  }

  const sorted = [...productsCents].sort((a, b) => b.priceCents - a.priceCents);
  const items = [];
  let remainingCents = totalCents;

  for (const product of sorted) {
    if (remainingCents <= 0) break;
    if (product.priceCents <= remainingCents) {
      const qty = Math.floor(remainingCents / product.priceCents);
      if (qty > 0) {
        items.push({
          name: product.name,
          slug: product.slug || 'item',
          quantity: qty,
          priceCents: product.priceCents
        });
        remainingCents -= product.priceCents * qty;
      }
    }
  }

  if (remainingCents > 0) {
    if (items.length > 0) {
      const head = items[0];
      const newHeadTotalCents = head.priceCents * head.quantity + remainingCents;
      head.priceCents = Math.floor(newHeadTotalCents / head.quantity);
      let reconstructedTotalCents = items.reduce((s, it) => s + it.priceCents * it.quantity, 0);
      let delta = totalCents - reconstructedTotalCents;
      if (delta !== 0) {
        head.priceCents += Math.trunc(delta / head.quantity);
        reconstructedTotalCents = items.reduce((s, it) => s + it.priceCents * it.quantity, 0);
        delta = totalCents - reconstructedTotalCents;
        if (delta !== 0) {
          items.push({
            name: head.name,
            slug: head.slug || 'item',
            quantity: 1,
            priceCents: delta
          });
        }
      }
    } else {
      const fallback = sorted[sorted.length - 1] || { name: 'Digital Product', slug: 'digital-product' };
      items.push({
        name: fallback.name,
        slug: fallback.slug || 'item',
        quantity: 1,
        priceCents: remainingCents
      });
    }
  }

  return items.map(it => ({
    name: it.name,
    slug: it.slug || 'item',
    quantity: it.quantity,
    price: fromCents(it.priceCents)
  }));
}

module.exports = { decomposeAmount, toCents, fromCents };
