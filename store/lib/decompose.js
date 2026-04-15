function decomposeAmount(amount, products) {
  if (!products || !products.length) {
    return [{ name: 'Digital Product', slug: 'digital-product', quantity: 1, price: amount }];
  }

  const exactMatch = products.find(p => Math.abs(p.price - amount) < 0.01);
  if (exactMatch) {
    return [{
      name: exactMatch.name,
      slug: exactMatch.slug || 'item',
      quantity: 1,
      price: amount
    }];
  }

  for (let i = 0; i < products.length; i++) {
    for (let j = i; j < products.length; j++) {
      if (Math.abs(products[i].price + products[j].price - amount) < 0.01) {
        const items = [{ name: products[i].name, slug: products[i].slug || 'item', quantity: 1, price: products[i].price }];
        if (i === j) {
          items[0].quantity = 2;
        } else {
          items.push({ name: products[j].name, slug: products[j].slug || 'item', quantity: 1, price: products[j].price });
        }
        return items;
      }
    }
  }

  const sorted = [...products].sort((a, b) => b.price - a.price);
  const items = [];
  let remaining = amount;

  for (const product of sorted) {
    if (remaining <= 0) break;
    if (product.price <= remaining) {
      const qty = Math.floor(remaining / product.price);
      if (qty > 0) {
        items.push({ name: product.name, slug: product.slug || 'item', quantity: qty, price: product.price });
        remaining -= product.price * qty;
        remaining = Math.round(remaining * 100) / 100;
      }
    }
  }

  if (remaining > 0) {
    if (items.length > 0) {
      items[0].price = Math.round((items[0].price + remaining / items[0].quantity) * 100) / 100;
    } else {
      const fallback = sorted[sorted.length - 1] || { name: 'Digital Product', slug: 'digital-product' };
      items.push({ name: fallback.name, slug: fallback.slug || 'item', quantity: 1, price: remaining });
    }
  }

  return items;
}

module.exports = { decomposeAmount };
