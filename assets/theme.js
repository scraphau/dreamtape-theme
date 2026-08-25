// Add to cart via AJAX so the customer stays on the current page instead of being sent to checkout
document.querySelectorAll('#product-add-form').forEach(form => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('.btn-atc');
    const originalText = submitBtn?.textContent;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Adding…';
    }

    try {
      const cartAddUrl = window.themeRoutes?.cartAddUrl || '/cart/add.js';
      const response = await fetch(cartAddUrl, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result?.description || 'Add to cart failed');

      const cartResponse = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
      const cart = await cartResponse.json();
      await refreshCart(cart);
      openCartDrawer();

      if (submitBtn) {
        submitBtn.textContent = 'Added ✓';
        setTimeout(() => {
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        }, 1500);
      }
    } catch (err) {
      console.error(err);
      if (submitBtn) {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
      alert('Sorry, we couldn\'t add that to your cart. Please try again.');
    }
  });
});

// Cart drawer
// Mirrors Liquid's money_without_trailing_zeros: the shop's own currency format
// with .00 dropped. It has to be the shop's format rather than Intl's, because
// Intl formats by the reader's browser language - an American browser writes
// AUD as "A$210" on a page where Liquid has already written "$210", so the same
// price changed appearance the moment the cart re-rendered.
function groupedAmount(cents, decimals, thousands, decimalMark) {
  const [whole, fraction] = (cents / 100).toFixed(decimals).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  return fraction ? grouped + decimalMark + fraction : grouped;
}

function formatMoney(cents) {
  const rounded = Math.round(cents);
  const hasDecimal = rounded % 100 !== 0;
  const format = window.themeRoutes?.moneyFormat;

  if (format && format.includes('{{')) {
    return format.replace(/\{\{\s*(\w+)\s*\}\}/, (match, placeholder) => {
      switch (placeholder) {
        case 'amount_no_decimals': return groupedAmount(rounded, 0, ',', '.');
        case 'amount_with_comma_separator': return groupedAmount(rounded, hasDecimal ? 2 : 0, '.', ',');
        case 'amount_no_decimals_with_comma_separator': return groupedAmount(rounded, 0, '.', ',');
        case 'amount_with_apostrophe_separator': return groupedAmount(rounded, hasDecimal ? 2 : 0, "'", '.');
        case 'amount_no_decimals_with_space_separator': return groupedAmount(rounded, 0, ' ', ',');
        case 'amount_with_space_separator': return groupedAmount(rounded, hasDecimal ? 2 : 0, ' ', ',');
        case 'amount_with_period_and_space_separator': return groupedAmount(rounded, hasDecimal ? 2 : 0, ' ', '.');
        default: return groupedAmount(rounded, hasDecimal ? 2 : 0, ',', '.');
      }
    });
  }

  // No format from the server: fall back to Intl, which at least gets the
  // currency right even if the prefix may not match Liquid's.
  const amount = rounded / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: window.themeRoutes?.cartCurrency || 'USD',
      minimumFractionDigits: hasDecimal ? 2 : 0,
      maximumFractionDigits: hasDecimal ? 2 : 0
    }).format(amount);
  } catch (err) {
    return `$${amount.toFixed(hasDecimal ? 2 : 0)}`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function resizeCartImage(url, width) {
  if (!url) return url;
  return url + (url.includes('?') ? '&' : '?') + `width=${width}`;
}

// Shipping protection is on by default: its line item is added alongside the
// first real item, held at quantity 1, and cleared again once nothing else is
// left. It's shown as a switch in the cart footer (see
// shipping-protection-row.liquid), never as a removable line.
//
// Opting out is recorded as a cart attribute rather than inferred from the
// line being absent — otherwise the auto-add would put it straight back on
// the next cart update.
const shippingProtectionVariantId = window.themeShippingProtectionVariantId || null;
const PROTECTION_ATTRIBUTE = 'shipping_protection';

function shoppableCartItems(cart) {
  if (!shippingProtectionVariantId) return cart.items;
  return cart.items.filter(item => item.variant_id !== shippingProtectionVariantId);
}

function protectionDeclined(cart) {
  return cart.attributes?.[PROTECTION_ATTRIBUTE] === 'declined';
}

// Clearing an attribute means sending it back as an empty string.
async function clearProtectionOptOut(cart) {
  try {
    const cartUpdateUrl = window.themeRoutes?.cartUpdateUrl || '/cart/update.js';
    const response = await fetch(cartUpdateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ attributes: { [PROTECTION_ATTRIBUTE]: '' } })
    });
    return response.ok ? await response.json() : cart;
  } catch (err) {
    console.error(err);
    return cart;
  }
}

async function syncShippingProtection(cart) {
  if (!shippingProtectionVariantId) return cart;

  const hasShoppableItems = shoppableCartItems(cart).length > 0;

  // An opt-out belongs to the order it was made on. The attribute rides the
  // cart cookie for a couple of weeks, so without this a shopper who declined
  // once would come back to a cart that quietly starts unprotected. Once
  // they've emptied the cart, the next order goes back to the default.
  if (!hasShoppableItems && protectionDeclined(cart)) {
    cart = await clearProtectionOptOut(cart);
  }

  const protectionLine = cart.items.find(item => item.variant_id === shippingProtectionVariantId);
  const wanted = hasShoppableItems && !protectionDeclined(cart);
  const wantedQuantity = wanted ? 1 : 0;
  if ((protectionLine?.quantity || 0) === wantedQuantity) return cart;

  // A protection line that can't be synced shouldn't stop the cart from
  // rendering — the shopper still sees their items and can check out.
  try {
    if (protectionLine) {
      const cartChangeUrl = window.themeRoutes?.cartChangeUrl || '/cart/change.js';
      const response = await fetch(cartChangeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: protectionLine.key, quantity: wantedQuantity })
      });
      return response.ok ? await response.json() : cart;
    }

    const cartAddUrl = window.themeRoutes?.cartAddUrl || '/cart/add.js';
    const response = await fetch(cartAddUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: shippingProtectionVariantId, quantity: 1 })
    });
    if (!response.ok) return cart;
    // cart/add.js returns the added line, not the cart, so totals need a re-read.
    const refreshed = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
    return refreshed.ok ? await refreshed.json() : cart;
  } catch (err) {
    console.error(err);
    return cart;
  }
}

// Free-shipping nudge standing in for the drawer title. Only the copy and the
// bar drop out on an empty cart — the close button shares this row and has to
// stay reachable.
function renderShippingPromo(cart) {
  const promo = document.querySelector('[data-cart-promo]');
  if (!promo) return;

  const items = shoppableCartItems(cart);
  const unlocked = items.some(item => item.selling_plan_allocation);
  promo.dataset.state = unlocked ? 'unlocked' : 'upgrade';

  const copy = promo.querySelector('[data-cart-promo-copy]');
  if (copy) copy.hidden = !items.length;

  const track = promo.querySelector('[data-cart-promo-track]');
  if (track) track.hidden = !items.length;

  const line = promo.querySelector('[data-cart-promo-line]');
  if (line) {
    line.innerHTML = unlocked
      ? 'You&rsquo;ve unlocked <strong>FREE SHIPPING</strong>'
      : 'Upgrade to a subscription for <strong>FREE AU SHIPPING</strong>';
  }

  const fill = promo.querySelector('[data-cart-promo-fill]');
  if (fill) fill.style.width = unlocked ? '100%' : '55%';
}

function renderProtectionToggle(cart) {
  const toggle = document.querySelector('[data-cart-protection-toggle]');
  if (!toggle || !shippingProtectionVariantId) return;
  const on = cart.items.some(item => item.variant_id === shippingProtectionVariantId);
  toggle.setAttribute('aria-checked', on ? 'true' : 'false');
}

async function refreshCart(cart) {
  const synced = await syncShippingProtection(cart);
  await primeUpsellPlans(synced);
  renderCartDrawer(synced);
  renderProtectionToggle(synced);
}

// Nudge the displayed total by a known amount without waiting for the server,
// so the switch and the checkout button move together on click.
function adjustCartTotalBy(deltaCents) {
  document.querySelectorAll('.cart-drawer-total-value, .cart-total-value').forEach(el => {
    const current = Number(el.dataset.totalCents);
    if (!Number.isFinite(current)) return;
    const next = Math.max(0, current + deltaCents);
    el.dataset.totalCents = next;
    el.textContent = formatMoney(next);
  });
}

// Each click supersedes any request still in flight, so a fast double-tap
// settles on the last state the shopper chose rather than whichever response
// happens to land last.
let protectionRequestId = 0;

document.addEventListener('click', async (e) => {
  const toggle = e.target.closest('[data-cart-protection-toggle]');
  if (!toggle) return;

  const row = toggle.closest('[data-cart-protection]');
  const priceCents = Number(row?.dataset.price) || 0;
  const turningOn = toggle.getAttribute('aria-checked') !== 'true';

  // Applied up front rather than after the round trip: the switch stays live
  // (never disabled) and the total moves with it, so the change reads as
  // instant even though the cart update is still in flight.
  toggle.setAttribute('aria-checked', turningOn ? 'true' : 'false');
  adjustCartTotalBy(turningOn ? priceCents : -priceCents);

  const requestId = ++protectionRequestId;
  try {
    // One request, not three: /cart/update.js takes the opt-out attribute and
    // the line quantity together, keyed by variant id.
    const cartUpdateUrl = window.themeRoutes?.cartUpdateUrl || '/cart/update.js';
    const response = await fetch(cartUpdateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        attributes: { [PROTECTION_ATTRIBUTE]: turningOn ? 'accepted' : 'declined' },
        updates: { [shippingProtectionVariantId]: turningOn ? 1 : 0 }
      })
    });
    const cart = await response.json();
    if (!response.ok) throw new Error(cart?.description || 'Could not update shipping protection');
    if (requestId !== protectionRequestId) return;

    renderCartDrawer(cart);
    renderProtectionToggle(cart);
    // The cart page prints its own totals server-side, so it needs a reload
    // to reflect the added or removed line.
    if (document.body.classList.contains('template-cart')) window.location.reload();
  } catch (err) {
    if (requestId !== protectionRequestId) return;
    console.error(err);
    toggle.setAttribute('aria-checked', turningOn ? 'false' : 'true');
    adjustCartTotalBy(turningOn ? -priceCents : priceCents);
    alert('Sorry, we couldn\'t update shipping protection. Please try again.');
  }
});

// /cart.js says which plan a line is on, never which plans it could be on, so
// the offer has to come from the product. Cached per handle: the drawer
// re-renders on every quantity change and the answer cannot move between them.
const upsellPlanByHandle = new Map();

// Both of these mirror snippets/cart-subscribe-upsell.liquid, which renders the
// same button server-side. Keep them in step.
function packsInTitle(variantTitle) {
  const title = variantTitle || '';
  if (title.includes('3') || title.includes('Three')) return 3;
  if (title.includes('6') || title.includes('Six')) return 6;
  return 1;
}

function planForPacks(product, packs) {
  const plans = (product.selling_plan_groups || []).flatMap(group => group.selling_plans || []);
  return plans.find(plan => {
    const name = (plan.name || '').toLowerCase().replace(/[-_]/g, ' ');
    if (packs === 3) return name.includes('3 month');
    if (packs === 6) return name.includes('6 month');
    return name.includes('month') && !name.includes('3 month') && !name.includes('6 month');
  }) || null;
}

async function loadUpsellPlans(handle) {
  if (upsellPlanByHandle.has(handle)) return;
  // Cache the miss too, so a product without subscriptions is not refetched on
  // every render.
  upsellPlanByHandle.set(handle, new Map());
  try {
    const response = await fetch(`/products/${handle}.js`, { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const product = await response.json();
    const byVariant = new Map();
    (product.variants || []).forEach(variant => {
      // The plan that matches the pack, not always the monthly one - a 3 month
      // supply on a 30-day plan would arrive three times faster than it is used.
      const plan = planForPacks(product, packsInTitle(variant.title));
      const offered = plan && (variant.selling_plan_allocations || [])
        .some(alloc => alloc.selling_plan_id === plan.id);
      byVariant.set(variant.id, {
        plan: offered ? plan : null,
        compareAtPrice: variant.compare_at_price || 0
      });
    });
    upsellPlanByHandle.set(handle, byVariant);
  } catch (err) {
    console.error(err);
  }
}

// Called before rendering so the buttons appear with the rest of the line
// rather than popping in a moment later.
async function primeUpsellPlans(cart) {
  const handles = [...new Set(
    shoppableCartItems(cart)
      .filter(item => item.handle)
      .map(item => item.handle)
  )];
  await Promise.all(handles.map(loadUpsellPlans));
}

function upsellPlanFor(item) {
  if (item.selling_plan_allocation) return null;
  return upsellPlanByHandle.get(item.handle)?.get(item.variant_id)?.plan || null;
}

// Mirrors snippets/cart-line-price.liquid. A selling plan sets the line's own
// price, so Shopify reports no discount on a subscription - original_line_price
// equals final_line_price and total_discount is zero. The "was" price comes
// from the plan's allocation, or the variant's compare-at, or a cart discount,
// whichever is highest. Keep the two in step.
//
// Highest, not the first that answers: a subscription line carries both
// compare-ats, and the plan's own is only the one-time price. Struck against
// that, a subscription taking 30% off the full price reads as saving the
// difference from the sale price instead - $84 rather than $105 on a line
// charging $73.50.
function cartLinePricing(item) {
  const allocationCompareAt = item.selling_plan_allocation?.compare_at_price || 0;
  const variantCompareAt = upsellPlanByHandle.get(item.handle)?.get(item.variant_id)?.compareAtPrice || 0;
  let wasUnit = Math.max(allocationCompareAt, variantCompareAt);
  if (wasUnit <= item.final_price) wasUnit = 0;
  const wasLine = Math.max(wasUnit * item.quantity, item.original_line_price || 0);
  const saved = wasLine - item.final_line_price;
  return { wasLine, saved: saved > 0 ? saved : 0 };
}

function renderCartDrawer(cart) {
  const itemsEl = document.getElementById('cartDrawerItems');
  const footerEl = document.getElementById('cartDrawerFooter');
  if (!itemsEl) return;

  const items = shoppableCartItems(cart);
  itemsEl.classList.toggle('is-empty', !items.length);

  if (!items.length) {
    itemsEl.innerHTML = `
      <div class="cart-drawer-empty">
        <p>Your cart is empty.</p>
        <a href="/products/mouth-tape" class="btn-primary btn-dark" data-cart-close>Shop Dreamtape <span class="arrow">→</span></a>
      </div>`;
    if (footerEl) footerEl.hidden = true;
  } else {
    // Liquid draws these lines for the first paint and this draws every one
    // after, so the two have to agree: see snippets/cart-line-price.liquid,
    // whose markup the price below mirrors.
    itemsEl.innerHTML = items.map(item => `
      <div class="cart-drawer-item" data-line-key="${item.key}">
        <a href="${item.url}">
          ${item.image
            ? `<img src="${resizeCartImage(item.image, 200)}" alt="${escapeHtml(item.product_title)}">`
            : `<div class="cart-drawer-item-placeholder">◐</div>`}
        </a>
        <div class="cart-drawer-item-info">
          <h3><a href="${item.url}">${escapeHtml(item.product_title)}</a></h3>
          ${item.variant_title && item.variant_title !== 'Default Title' ? `<p class="cart-drawer-item-variant">${escapeHtml(item.variant_title)}</p>` : ''}
          ${item.selling_plan_allocation ? `<p class="cart-drawer-item-plan">${escapeHtml(item.selling_plan_allocation.selling_plan.name)}</p>` : ''}
          <div class="cart-drawer-item-qty">
            <button type="button" data-cart-qty-decrease aria-label="Decrease quantity">&minus;</button>
            <span data-cart-qty-value>${item.quantity}</span>
            <button type="button" data-cart-qty-increase aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div class="cart-drawer-item-side">
          <p class="cart-drawer-item-price">${(pricing => pricing.saved
            ? `<span class="cart-line-prices"><s class="cart-line-was">${formatMoney(pricing.wasLine)}</s><span class="cart-line-now">${formatMoney(item.final_line_price)}</span></span><span class="cart-line-save">(Save ${formatMoney(pricing.saved)})</span>`
            : `<span class="cart-line-now">${formatMoney(item.final_line_price)}</span>`)(cartLinePricing(item))}</p>
          <button type="button" class="cart-drawer-item-remove" data-cart-remove aria-label="Remove ${escapeHtml(item.product_title)}">&times;</button>
        </div>
        ${(plan => plan
          ? `<button type="button" class="cart-subscribe-upsell" data-cart-subscribe data-selling-plan-id="${plan.id}" data-quantity="${item.quantity}">${escapeHtml(plan.name)}</button>`
          : '')(upsellPlanFor(item))}
      </div>`).join('');
    if (footerEl) {
      footerEl.hidden = false;
      const totalEl = footerEl.querySelector('.cart-drawer-total-value');
      if (totalEl) {
        totalEl.textContent = formatMoney(cart.total_price);
        // Basis for the optimistic adjustment when the protection switch flips.
        totalEl.dataset.totalCents = cart.total_price;
      }
    }
  }

  syncCartUpsells(items);

  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = items.reduce((total, item) => total + item.quantity, 0);
  });

  renderShippingPromo(cart);
}

// Pack size as the variant titles carry it - "3 Month Supply". Zero for a
// title that names no pack, which then counts for nothing when picking the
// next size up.
function packSizeOf(variantTitle) {
  const match = /(\d+)\s*month/i.exec(variantTitle || '');
  return match ? Number(match[1]) : 0;
}

// The upsell rows are rendered once by Liquid and live below the items, which
// renderCartDrawer does not replace, so they only need hiding and showing as
// the cart changes underneath them.
//
// Every product has a row for each pack it offers and only one of them belongs
// on screen: the next size up from the biggest pack of that product already in
// the cart. Someone holding a three month supply is offered the six rather
// than a second three; someone holding the six is offered nothing, there being
// nothing bigger. Liquid works the same choice out for the first paint (see
// snippets/cart-upsells.liquid) - this is what keeps it true afterwards.
function syncCartUpsells(items) {
  const held = new Set(items.map(item => item.variant_id));

  const biggestHeld = {};
  items.forEach(item => {
    const packs = packSizeOf(item.variant_title);
    if (!packs) return;
    biggestHeld[item.handle] = Math.max(biggestHeld[item.handle] || 0, packs);
  });

  document.querySelectorAll('[data-cart-upsells]').forEach(block => {
    const rows = [...block.querySelectorAll('[data-cart-upsell]')];
    rows.forEach(row => {
      const wanted = (biggestHeld[row.dataset.upsellHandle] || 0) >= 3 ? 6 : 3;
      const isWantedPack = Number(row.dataset.upsellPacks) === wanted;
      row.hidden = !isWantedPack || held.has(Number(row.dataset.variantId));
    });
    // Nothing left to offer: the heading should not sit there on its own.
    block.hidden = rows.every(row => row.hidden);
  });
}

// The chat bubble is fixed to the bottom-right corner, which on a phone is
// where the drawer puts its checkout button. It belongs to an app rather than
// to this theme, so it sits outside the drawer's stacking context and nothing
// here can simply cover it - it has to be hidden while the cart is open.
//
// Found by shape rather than by a selector the app is free to rename: a fixed
// element, named for chat, that is not part of the theme's own markup.
function chatWidgets() {
  return Array.from(document.querySelectorAll('[id*="chat" i], [class*="chat" i]'))
    .filter(el => !el.closest('.cart-drawer, .cart-drawer-backdrop, .header, .footer'))
    .filter(el => getComputedStyle(el).position === 'fixed');
}

// Hidden rather than removed from the layout: an iframe that goes display:none
// reloads, which would throw away a conversation in progress.
function setChatHidden(hidden) {
  chatWidgets().forEach(el => {
    el.style.visibility = hidden ? 'hidden' : '';
    el.style.pointerEvents = hidden ? 'none' : '';
  });
}

function openCartDrawer() {
  document.getElementById('cartDrawer')?.classList.add('open');
  document.getElementById('cartDrawerBackdrop')?.classList.add('open');
  document.documentElement.classList.add('cart-open');
  setChatHidden(true);
}

function closeCartDrawer() {
  document.getElementById('cartDrawer')?.classList.remove('open');
  document.getElementById('cartDrawerBackdrop')?.classList.remove('open');
  document.documentElement.classList.remove('cart-open');
  setChatHidden(false);
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-cart-open]')) {
    e.preventDefault();
    openCartDrawer();
  }
  if (e.target.closest('[data-cart-close]')) {
    closeCartDrawer();
  }
});

document.addEventListener('click', async (e) => {
  const decreaseBtn = e.target.closest('[data-cart-qty-decrease]');
  const increaseBtn = e.target.closest('[data-cart-qty-increase]');
  const removeBtn = e.target.closest('[data-cart-remove]');
  if (!decreaseBtn && !increaseBtn && !removeBtn) return;

  const itemEl = e.target.closest('.cart-drawer-item');
  if (!itemEl) return;

  const key = itemEl.dataset.lineKey;
  let quantity;
  if (removeBtn) {
    quantity = 0;
  } else {
    const qtyEl = itemEl.querySelector('[data-cart-qty-value]');
    const current = parseInt(qtyEl?.textContent, 10) || 0;
    quantity = increaseBtn ? current + 1 : Math.max(0, current - 1);
  }

  try {
    const cartChangeUrl = window.themeRoutes?.cartChangeUrl || '/cart/change.js';
    const response = await fetch(cartChangeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: key, quantity })
    });
    const cart = await response.json();
    if (!response.ok) throw new Error(cart?.description || 'Could not update cart');
    await refreshCart(cart);
  } catch (err) {
    console.error(err);
    alert('Sorry, we couldn\'t update your cart. Please try again.');
  }
});

// Add an upsell to the cart. One-time on purpose: the row offers a pack, not a
// plan, and the line's own subscribe button is there if they want one.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cart-upsell-add]');
  if (!btn || btn.disabled) return;

  const variantId = btn.dataset.variantId;
  if (!variantId) return;

  btn.disabled = true;
  btn.classList.add('is-loading');

  try {
    const cartAddUrl = window.themeRoutes?.cartAddUrl || '/cart/add.js';
    const response = await fetch(cartAddUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] })
    });
    const added = await response.json();
    if (!response.ok) throw new Error(added?.description || 'Could not add that to your cart');

    if (document.body.classList.contains('template-cart')) {
      window.location.reload();
      return;
    }
    const cart = await (await fetch('/cart.js', { headers: { Accept: 'application/json' } })).json();
    await refreshCart(cart);
    openCartDrawer();
  } catch (err) {
    console.error(err);
    alert("Sorry, we couldn't add that to your cart. Please try again.");
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
});

// Convert a one-time line to the monthly plan. /cart/change.js takes a
// selling_plan and swaps it in place, keeping the quantity, so there is no
// remove-then-re-add for the customer to watch.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cart-subscribe]');
  if (!btn || btn.disabled) return;

  const itemEl = btn.closest('[data-line-key]');
  const key = itemEl?.dataset.lineKey;
  const sellingPlan = btn.dataset.sellingPlanId;
  if (!key || !sellingPlan) return;

  // The drawer keeps quantity in its own control, the cart page in an input
  // the customer may have typed into without submitting yet.
  const shown = itemEl.querySelector('[data-cart-qty-value]')?.textContent
    ?? itemEl.querySelector('input[name^="updates["]')?.value
    ?? btn.dataset.quantity;
  const quantity = Math.max(1, parseInt(shown, 10) || 1);

  btn.disabled = true;
  btn.classList.add('is-loading');

  try {
    const cartChangeUrl = window.themeRoutes?.cartChangeUrl || '/cart/change.js';
    const response = await fetch(cartChangeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: key, quantity, selling_plan: sellingPlan })
    });
    const cart = await response.json();
    if (!response.ok) throw new Error(cart?.description || 'Could not start the subscription');

    // The cart page renders its lines and totals server-side, so it has to come
    // back from the server to show the new price; the drawer re-renders itself.
    if (document.body.classList.contains('template-cart')) {
      window.location.reload();
      return;
    }
    await refreshCart(cart);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.classList.remove('is-loading');
    alert("Sorry, we couldn't switch that to a subscription. Please try again.");
  }
});

// The cart can arrive out of sync from an earlier visit (protection missing,
// or left behind after the last real item was removed), so reconcile it once
// on load. The cart page renders its totals server-side, so it needs a reload
// when the reconcile actually changed something.
if (shippingProtectionVariantId) {
  (async () => {
    try {
      const response = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const cart = await response.json();
      const synced = await syncShippingProtection(cart);
      if (synced.item_count !== cart.item_count && document.body.classList.contains('template-cart')) {
        window.location.reload();
        return;
      }
      await primeUpsellPlans(synced);
      renderCartDrawer(synced);
      renderProtectionToggle(synced);
    } catch (err) {
      console.error(err);
    }
  })();
}

// Mobile menu
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-menu-open]')) {
    document.getElementById('mobileMenu')?.classList.add('open');
    document.getElementById('mobileMenuBackdrop')?.classList.add('open');
    document.documentElement.classList.add('menu-open');
  }
  if (e.target.matches('[data-menu-close]')) {
    document.getElementById('mobileMenu')?.classList.remove('open');
    document.getElementById('mobileMenuBackdrop')?.classList.remove('open');
    document.documentElement.classList.remove('menu-open');
  }
});

// Smooth scroll for in-page anchors
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id.length > 1) {
      const el = document.querySelector(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({behavior:'smooth', block:'start'});
        document.getElementById('mobileMenu')?.classList.remove('open');
      }
    }
  });
});

// Scroll reveal
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, {threshold: 0.12});
document.querySelectorAll('.section-head, .product-card, .benefit, .how-step, .testimonial, .wakeup-inner, .guarantee-inner, .faq-item').forEach(el => {
  el.classList.add('reveal');
});

// Observe by class, not by that selector list. Several sections ship `reveal`
// in their own markup - the timeline items, the comparison table, the feature
// tiles, both halves of the problem section - on elements the list above never
// matched. They inherited the class's opacity: 0 and nothing ever added `in`,
// so they sat invisible in the DOM.
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// Variant picker for product page
document.querySelectorAll('[data-variant-picker]').forEach(picker => {
  const form = picker.closest('form');
  const options = picker.querySelectorAll('.variant-option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const id = opt.dataset.variantId;
      const input = form?.querySelector('input[name="id"]');
      if (input) input.value = id;
    });
  });
});

// FAQ page accordion (question opens/closes like the product page gallery FAQ)
function closeFaqPageItem(item) {
  const body = item.querySelector('.faq-page-body');
  const btn = item.querySelector('.faq-page-summary');
  item.classList.remove('is-open');
  if (body) body.style.maxHeight = '0px';
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

document.querySelectorAll('.faq-page-summary').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-page-item');
    const body = item.querySelector('.faq-page-body');
    if (item.classList.contains('is-open')) {
      closeFaqPageItem(item);
    } else {
      item.classList.add('is-open');
      body.style.maxHeight = body.scrollHeight + 'px';
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

// Bottom-of-product-page FAQ accordion (same open/close as the gallery FAQ)
document.querySelectorAll('.faq-item .faq-summary').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const body = item.querySelector('.faq-body');
    if (item.classList.contains('is-open')) {
      item.classList.remove('is-open');
      body.style.maxHeight = '0px';
      btn.setAttribute('aria-expanded', 'false');
    } else {
      item.classList.add('is-open');
      body.style.maxHeight = body.scrollHeight + 'px';
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

// FAQ category tabs
document.querySelectorAll('[data-faq-tabs]').forEach(wrapper => {
  const tabs = wrapper.querySelectorAll('[data-faq-tab]');
  const panels = wrapper.querySelectorAll('[data-faq-panel]');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.faqTab;

      tabs.forEach(item => {
        const isActive = item === tab;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      panels.forEach(panel => {
        const isActive = panel.dataset.faqPanel === target;
        panel.classList.toggle('active', isActive);
        panel.hidden = !isActive;
        if (!isActive) {
          panel.querySelectorAll('.faq-page-item.is-open').forEach(closeFaqPageItem);
        }
      });
    });
  });
});

// Testimonial carousel dots. The row itself is a plain scroll-snap container
// (see base.css) so the swipe is the browser's, momentum and all — these only
// report where it stopped, and offer a tap for anyone who doesn't swipe.
document.querySelectorAll('[data-testimonial-carousel]').forEach(carousel => {
  const track = carousel.querySelector('[data-testimonial-track]');
  const dots = Array.from(carousel.querySelectorAll('[data-testimonial-dot]'));
  if (!track || dots.length < 2) return;

  const cards = Array.from(track.children);
  // Offsets are measured against the first card rather than the track, so the
  // scroll padding in front of it doesn't shift every card by a gutter.
  const positionOf = (card) => card.offsetLeft - cards[0].offsetLeft;

  function syncDots() {
    let index = 0;
    let closest = Infinity;
    cards.forEach((card, i) => {
      const distance = Math.abs(positionOf(card) - track.scrollLeft);
      if (distance < closest) {
        closest = distance;
        index = i;
      }
    });
    dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
  }

  // Scroll fires far faster than the dots can meaningfully change, so the
  // reads are held to one a frame.
  let pending = false;
  track.addEventListener('scroll', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      syncDots();
    });
  }, { passive: true });

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      // The last card sits against the right gutter rather than the left one,
      // so its own offset is past the end of the row. Asking for a position
      // the row can't reach makes the snap pull back a whole card, which
      // would leave the last dot unable to reach the last review.
      const furthest = track.scrollWidth - track.clientWidth;
      track.scrollTo({ left: Math.min(positionOf(cards[i]), furthest), behavior: 'smooth' });
    });
  });

  syncDots();
});
