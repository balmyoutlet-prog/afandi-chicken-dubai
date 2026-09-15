/* Afandi Dubai: explicit optional add-ons and a single cart arithmetic path.
   Does not change menu prices, delivery tariffs, branches, payment services or DNS. */
(function () {
  'use strict';
  const text = (ar, en) => lang === 'ar' ? ar : en;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const lookup = id => products.find(p => p.id === id);
  const minor = value => Math.round((Number(value) + Number.EPSILON) * 100);
  const available = p => p && p.available !== false && p.stock !== 0 && Number.isFinite(Number(p.price)) && Number(p.price) >= 0;
  function cleanCart(value) {
    const clean = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
    let sum = 0;
    for (const [id, qty] of Object.entries(value)) {
      const p = lookup(id);
      if (!p || !Number.isSafeInteger(qty) || qty <= 0 || !Number.isFinite(Number(p.price)) || Number(p.price) < 0) continue;
      const line = minor(p.price) * qty;
      if (!Number.isSafeInteger(line) || !Number.isSafeInteger(sum + line)) continue;
      sum += line;
      clean[id] = qty;
    }
    return clean;
  }
  totals = function () {
    return Object.entries(cleanCart(cart)).reduce((sum, [id, qty]) => sum + minor(lookup(id).price) * qty, 0) / 100;
  };
  const chargedFee = () => Object.keys(cleanCart(cart)).length && selectedMode() === 'Delivery' ? deliveryFee() : 0;
  orderTotal = function () { return (minor(totals()) + minor(chargedFee())) / 100; };
  Object.assign(I18N.ar, {subtotal:'المجموع الفرعي', grandTotal:'المجموع النهائي'});
  Object.assign(I18N.en, {subtotal:'Subtotal', grandTotal:'Grand total'});

  const style = document.createElement('style');
  style.id = 'afandi-cart-integrity-style';
  style.textContent = `
    #cartDrawer.open ~ #stickyBar {display:none!important;pointer-events:none}
    #qvUpsell {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:stretch}
    #qvUpsell .qv-product-card {min-width:0;display:flex;flex-direction:column;align-items:center;gap:7px;padding:10px 8px;background:#fff;border:1px solid #e5e1dc;border-radius:14px;text-align:center;color:#171717}
    #qvUpsell .qv-product-card img {width:100%;height:76px;object-fit:contain}
    #qvUpsell .qv-product-name {font-family:inherit;font-size:13px;font-weight:700;line-height:1.5;margin:0;overflow-wrap:anywhere;color:#171717}
    #qvUpsell .qv-product-price {font-weight:800;color:var(--red,#d90016);direction:ltr}
    #qvUpsell .qv-explicit-add {appearance:none;-webkit-appearance:none;display:flex;justify-content:center;align-items:center;gap:6px;width:100%;min-height:44px;margin-top:auto;padding:8px 5px;border:0;border-radius:10px;background:var(--red,#d90016);color:#fff;font-family:inherit;font-size:14px;font-weight:700;line-height:1.4;cursor:pointer;touch-action:manipulation}
    #qvUpsell .qv-plus {font:800 23px/1 sans-serif}
    #qvUpsell .qv-added-count {min-height:20px;font-size:12px;line-height:1.5;color:#373737}
    #qvCartStatus {font-size:13px;line-height:1.6;color:#333;min-height:22px;margin:10px 0 0}
    #qvSelectionTotal {font-size:14px;line-height:1.6;font-weight:700;margin:8px 0;direction:ltr;text-align:center}
    #cartUpsellList .co-foot {flex-wrap:wrap;gap:6px}
    #cartUpsellList .co-price {display:block;direction:ltr;font-size:14px;font-weight:800;color:var(--red,#d90016)}
    .mini-add.afandi-explicit-add {appearance:none;-webkit-appearance:none;min-width:44px;width:auto;min-height:44px;padding:8px 10px;border-radius:10px;white-space:nowrap;color:#fff;background:var(--red,#d90016);font-weight:800}
    .cart-unit-price {display:block;font-size:12px;color:#4b4b4b;direction:ltr;text-align:start}
    .afandi-summary-row {display:flex;justify-content:space-between;align-items:center;gap:12px;margin:10px 0;font-size:15px}
    .afandi-summary-row[hidden] {display:none!important}
    #checkoutCompletion #deliveryFeeRow {margin:10px 0}
    #cartGrandTotalRow {padding-top:10px;border-top:1px solid #ddd;font-weight:800}
    #qvUpsell button:focus-visible,.afandi-explicit-add:focus-visible {outline:3px solid #171717;outline-offset:3px}
    @media(max-width:480px){#qvUpsell{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);
  const checkoutSummary = document.querySelector('#checkoutForm .checkout-summary');
  const subtotalRow = document.createElement('div');
  subtotalRow.id = 'checkoutSubtotalRow'; subtotalRow.className = 'afandi-summary-row';
  subtotalRow.innerHTML = '<span data-i18n="subtotal"></span><strong id="checkoutSubtotal"></strong>';
  checkoutSummary.before(subtotalRow);
  const feeRow = document.getElementById('deliveryFeeRow');
  if (feeRow) checkoutSummary.before(feeRow);
  const cartTotalRow = document.querySelector('#cartDrawer .cart-total');
  cartTotalRow.querySelector('span').dataset.i18n = 'subtotal';
  checkoutSummary.querySelector('span').dataset.i18n = 'grandTotal';
  const drawerFees = document.createElement('div');
  drawerFees.id = 'cartFeeRow'; drawerFees.className = 'afandi-summary-row';
  drawerFees.innerHTML = '<span data-i18n="deliveryFee"></span><strong id="cartDeliveryFee"></strong>';
  const drawerGrand = document.createElement('div');
  drawerGrand.id = 'cartGrandTotalRow'; drawerGrand.className = 'afandi-summary-row';
  drawerGrand.innerHTML = '<span data-i18n="grandTotal"></span><strong id="cartGrandTotal"></strong>';
  cartTotalRow.after(drawerFees, drawerGrand);
  const selectionTotal = document.createElement('p'); selectionTotal.id = 'qvSelectionTotal';
  document.getElementById('qvAdd').before(selectionTotal);
  const qvStatus = document.createElement('p'); qvStatus.id = 'qvCartStatus';
  qvStatus.setAttribute('role','status'); qvStatus.setAttribute('aria-live','polite');
  document.getElementById('qvUpsell').after(qvStatus);

  function syncSummary() {
    const nonempty = Object.keys(cart).length > 0;
    const fee = chargedFee();
    const delivery = selectedMode() === 'Delivery' && nonempty;
    const pending = delivery && (fee === null || !Number.isFinite(Number(fee)));
    const totalText = pending ? money(totals()) + text(' + التوصيل', ' + delivery') : money(orderTotal());
    const feeText = pending ? text('بعد تحديد الموقع', 'After choosing location') : money(fee);
    document.getElementById('checkoutSubtotal').textContent = money(totals());
    document.getElementById('checkoutTotal').textContent = totalText;
    document.getElementById('cartTotal').textContent = money(totals());
    document.getElementById('cartDeliveryFee').textContent = feeText;
    document.getElementById('cartGrandTotal').textContent = totalText;
    drawerFees.hidden = !delivery;
    drawerGrand.hidden = !nonempty || !selectedMode();
    if (feeRow) { feeRow.hidden = !delivery; feeRow.querySelector('strong').textContent = feeText; }
    for (const row of [subtotalRow, cartTotalRow, drawerFees, drawerGrand, checkoutSummary]) {
      const label = row.querySelector('[data-i18n]'); if (label) label.textContent = t(label.dataset.i18n);
    }
    if (pending) {
      checkoutSummary.querySelector('span').textContent = text('المجموع الفرعي + التوصيل', 'Subtotal + delivery');
      drawerGrand.querySelector('span').textContent = text('المجموع الفرعي + التوصيل', 'Subtotal + delivery');
    }
    for (const count of document.querySelectorAll('[data-qv-count]')) {
      const qty = cart[count.dataset.qvCount] || 0;
      count.textContent = qty ? text('بالسلة: ', 'In cart: ') + qty : '';
    }
    if (qvId && lookup(qvId)) {
      const p = lookup(qvId);
      selectionTotal.textContent = `${qvQty} × ${money(p.price)} = ${money(minor(p.price) * qvQty / 100)}`;
    }
  }
  function clarifyAdds() {
    for (const button of document.querySelectorAll('[data-add],[data-rec]')) {
      const p = lookup(button.dataset.add || button.dataset.rec);
      if (!p) continue;
      button.type = 'button';
      button.setAttribute('aria-label',text('إضافة ', 'Add ') + productName(p) + ' — ' + money(p.price));
      if (!button.matches('[data-merch-add]')) button.textContent = '+ ' + text('إضافة','Add');
      button.classList.add('afandi-explicit-add');
      button.disabled = !available(p);
      const card = button.closest('.co-card');
      if (card && !card.querySelector('.co-price')) {
        const price = document.createElement('strong'); price.className='co-price'; price.textContent=money(p.price);
        card.querySelector('.co-name')?.after(price);
      }
    }
  }
  const previousRender = renderCart;
  renderCart = function () {
    cart = cleanCart(cart);
    previousRender();
    clarifyAdds(); syncSummary();
    const entries = Object.entries(cart);
    document.querySelectorAll('#cartItems .cart-line').forEach((line, index) => {
      const [id, qty] = entries[index] || []; if (!id) return;
      const unit = document.createElement('small'); unit.className='cart-unit-price';
      unit.textContent=`${qty} × ${money(lookup(id).price)}`;
      line.querySelector('strong')?.after(unit);
    });
  };
  function addQuantity(id, quantity) {
    const p = lookup(id);
    if (!available(p) || !Number.isSafeInteger(quantity) || quantity <= 0) return false;
    cart = cleanCart(cart);
    const next = (cart[id] || 0) + quantity;
    if (!Number.isSafeInteger(next) || !Number.isSafeInteger(minor(totals()) + minor(p.price) * quantity)) return false;
    cart[id] = next; renderCart(); showToast(t('added'));
    if (document.getElementById('quickView').open) {
      qvStatus.textContent = text('تمت إضافة ', 'Added ') + productName(p) + text(' إلى السلة. المجموع الفرعي: ', ' to your cart. Subtotal: ') + money(totals());
    }
    return true;
  }
  addItem = function (id) {
    if (!addQuantity(id,1)) return;
    if (!document.getElementById('checkoutDialog').open && !document.getElementById('quickView').open) openCart();
  };
  changeQty = function (id, delta) {
    if (!lookup(id) || !Number.isSafeInteger(delta) || !cart[id]) return;
    if (delta > 0) { addQuantity(id,delta); return; }
    const next = cart[id] + delta;
    if (next <= 0) delete cart[id]; else cart[id] = next;
    renderCart();
  };
  function renderQuickSuggestions() {
    const box = document.getElementById('qvUpsell');
    const picks = upsellPool([qvId]).filter(available).slice(0,5);
    box.innerHTML = picks.map(p => `<article class="qv-product-card" data-qv-product="${escape(p.id)}">${p.image?`<img src="${escape(afandiPreviewImage(p.image))}" alt="${escape(productName(p))}" loading="lazy" decoding="async">`:''}<h4 class="qv-product-name">${escape(productName(p))}</h4><strong class="qv-product-price">${escape(money(p.price))}</strong><button type="button" class="qv-explicit-add" data-qvadd="${escape(p.id)}" aria-label="${escape(text('إضافة ','Add ')+productName(p)+' — '+money(p.price))}"><span class="qv-plus" aria-hidden="true">+</span><span>${text('إضافة','Add')}</span></button><span class="qv-added-count" data-qv-count="${escape(p.id)}"></span></article>`).join('');
    for (const button of box.querySelectorAll('[data-qvadd]')) button.onclick = e => { e.preventDefault(); e.stopPropagation(); addItem(button.dataset.qvadd); };
    syncSummary();
  }
  const previousQuickView = openQuickView;
  openQuickView = function (id) {
    if (!available(lookup(id))) return;
    previousQuickView(id);
    qvStatus.textContent='';
    renderQuickSuggestions();
  };
  qvChange = function (delta) {
    if (!Number.isSafeInteger(delta)) return;
    const next = Math.max(1,qvQty+delta);
    if (!Number.isSafeInteger(next) || (qvId && !Number.isSafeInteger(minor(lookup(qvId).price) * next))) return;
    qvQty=next; document.getElementById('qvQty').textContent=next; syncSummary();
  };
  document.getElementById('qvAdd').onclick = () => {
    if (!qvId || !addQuantity(qvId,qvQty)) return;
    document.getElementById('quickView').close();
    if (!document.getElementById('checkoutDialog').open) openCart();
  };
  for (const id of ['qvAdd','qvMinus','qvPlus','qvClose']) document.getElementById(id).type='button';
  const previousFulfilment = updateFulfilmentUI;
  updateFulfilmentUI = function () { previousFulfilment(); syncSummary(); };
  document.querySelectorAll('[name="mode"]').forEach(input => input.addEventListener('change',syncSummary));
  const previousLanguage = applyLanguage;
  applyLanguage = function (next,remember=false) {
    previousLanguage(next,remember);
    clarifyAdds(); syncSummary();
    if (document.getElementById('quickView').open && lookup(qvId)) {
      document.getElementById('qvName').textContent=productName(lookup(qvId));
      document.getElementById('qvImage').alt=productName(lookup(qvId));
      document.getElementById('qvAdd').textContent=t('addToCart');
      document.getElementById('qvUpsellTitle').textContent=t('goesWell');
      qvStatus.textContent=''; renderQuickSuggestions();
    }
  };
  // Quote-detail changes cover branch, GPS, manual pin, confirmation and clearing.
  // syncSummary never writes quote-detail, so this observer cannot loop.
  const quoteDetail = document.getElementById('deliveryQuoteDetail');
  if (quoteDetail) new MutationObserver(syncSummary).observe(quoteDetail, {childList:true,subtree:true});
  document.getElementById('branchSelect').addEventListener('change',syncSummary);
  renderCart();
  document.documentElement.dataset.cartIntegrity='20260915r1';
})();