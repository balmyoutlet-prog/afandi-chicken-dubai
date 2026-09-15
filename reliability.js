/* Afandi Dubai checkout reliability. No prices, branch numbers or payment services changed. */
(function () {
  'use strict';
  // Keep each transparent native radio inside its own visible option card.
  // Previously width:100% plus absolute positioning made Takeaway cover Delivery.
  const checkoutStyle = document.createElement('style');
  checkoutStyle.textContent = `
    #checkoutForm .mode-grid > label, #checkoutForm .payment-grid > label { position: relative; }
    #checkoutForm .mode-grid input[type="radio"], #checkoutForm .payment-grid input[type="radio"] {
      position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0;
      opacity: 0; z-index: 1; cursor: pointer;
    }
    #checkoutForm input[type="radio"]:disabled { cursor: not-allowed; }
    #checkoutForm input[type="radio"]:focus-visible + span { outline: 3px solid var(--red); outline-offset: 3px; }
    .checkout-return-actions button { min-height: 44px; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } .orbit { animation: none; } }
  `;
  document.head.appendChild(checkoutStyle);
  const storageKey = 'afandi-cart-v1';
  const arabic = () => lang === 'ar';
  const copy = (ar, en) => arabic() ? ar : en;
  const validCart = value => {
    const clean = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
    for (const [id, quantity] of Object.entries(value)) {
      if (products.some(p => p.id === id) && Number.isSafeInteger(quantity) && quantity > 0) clean[id] = quantity;
    }
    return clean;
  };
  const saveCart = () => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(cart)); } catch (_) { /* Private browsing must still work. */ }
  };
  try { cart = validCart(JSON.parse(sessionStorage.getItem(storageKey) || '{}')); } catch (_) { /* Keep the in-memory cart. */ }

  Object.assign(I18N.ar, {
    sendWhatsapp: 'فتح واتساب وإرسال الطلب',
    privacy: 'سيفتح واتساب الفرع المختار مع تفاصيل طلبك. اضغط إرسال داخل واتساب؛ تأكيد الطلب يكون من الفرع.',
    branchNote: 'افتح واتساب الفرع المختار، ثم اضغط إرسال لتوصيل طلبك إليه.'
  });
  Object.assign(I18N.en, {
    sendWhatsapp: 'Open WhatsApp to send order',
    privacy: 'WhatsApp opens with your order for the selected branch. Tap Send inside WhatsApp; the branch confirms your order.',
    branchNote: 'Open the selected branch’s WhatsApp, then tap Send to place your order.'
  });

  const oldRender = renderCart;
  renderCart = function () {
    oldRender();
    updateFulfilmentUI();
    saveCart();
  };
  const oldLanguage = applyLanguage;
  applyLanguage = function (next, remember = false) {
    const branchId = $('#branchSelect').value;
    oldLanguage(next === 'en' ? 'en' : 'ar', remember);
    if (branches.some(b => b.id === branchId)) $('#branchSelect').value = branchId;
    renderBranchPreview($('#branchSelect').value);
    updateFulfilmentUI();
    updateCheckoutCopy();
  };

  addItem = function (id) {
    if (!products.some(p => p.id === id)) return;
    cart[id] = (cart[id] || 0) + 1;
    renderCart();
    showToast(t('added'));
    if (!$('#checkoutDialog').open && !$('#quickView').open) openCart();
  };
  $('#qvAdd').onclick = function () {
    if (!qvId || !products.some(p => p.id === qvId)) return;
    cart[qvId] = (cart[qvId] || 0) + qvQty;
    renderCart();
    showToast(t('added'));
    $('#quickView').close();
    if (!$('#checkoutDialog').open) openCart();
  };

  const actions = document.createElement('div');
  actions.className = 'checkout-return-actions';
  actions.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin:0 0 18px';
  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.id = 'checkoutBackToMenu';
  menuButton.className = 'ghost-action';
  menuButton.onclick = () => {
    $('#checkoutDialog').close();
    closeCart();
    $('#menu').scrollIntoView({ behavior: 'smooth' });
  };
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.id = 'checkoutEditCart';
  editButton.className = 'ghost-action';
  editButton.onclick = () => { $('#checkoutDialog').close(); openCart(); };
  actions.append(menuButton, editButton);
  $('#checkoutForm .dialog-head').after(actions);
  $('#customerName').maxLength = 80;
  $('#customerPhone').maxLength = 24;
  $('#deliveryAddress').maxLength = 500;
  $('#closeCheckoutBtn').setAttribute('aria-label', 'Close checkout');
  function updateCheckoutCopy() {
    menuButton.textContent = copy('إضافة أصناف / العودة للمنيو', 'Add items / Back to menu');
    editButton.textContent = copy('تعديل السلة والكميات', 'Edit cart and quantities');
    for (const el of document.querySelectorAll('[data-i18n="sendWhatsapp"], [data-i18n="privacy"], [data-i18n="branchNote"]')) el.textContent = t(el.dataset.i18n);
    $('#closeCheckoutBtn').setAttribute('aria-label', copy('إغلاق إكمال الطلب', 'Close checkout'));
  }
  for (const field of [$('#customerName'), $('#customerPhone'), $('#deliveryAddress')]) {
    field.addEventListener('input', () => field.setCustomValidity(''));
  }
  document.querySelectorAll('[name="mode"]').forEach(input => input.addEventListener('change', () => $('#deliveryAddress').setCustomValidity('')));
  function invalid(field, message) {
    field.setCustomValidity(message);
    field.reportValidity();
    field.focus();
  }
  submitOrder = function (event) {
    event.preventDefault();
    cart = validCart(cart);
    if (!Object.keys(cart).length) { renderCart(); showToast(t('chooseFirst')); return; }
    const form = $('#checkoutForm');
    if (!form.reportValidity()) return;
    const branch = branches.find(b => b.id === $('#branchSelect').value);
    if (!branch || !/^\d{8,15}$/.test(branch.phone)) { showToast(t('chooseBranch')); return; }
    const name = $('#customerName').value.trim();
    const phone = $('#customerPhone').value.trim();
    const phoneDigits = phone.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776)).replace(/[\s()+.\-]/g, '');
    const mode = selectedMode();
    const address = $('#deliveryAddress').value.trim();
    if (name.length < 2) return invalid($('#customerName'), copy('اكتب الاسم بشكل صحيح', 'Enter your name'));
    if (!/^\d{8,15}$/.test(phoneDigits)) return invalid($('#customerPhone'), copy('اكتب رقم هاتف صحيحاً', 'Enter a valid phone number'));
    if (!['Delivery', 'Takeaway', 'Dine-in'].includes(mode)) return;
    if (mode === 'Delivery' && !address) return invalid($('#deliveryAddress'), copy('أدخل عنوان التوصيل', 'Enter a delivery address'));
    const lines = Object.entries(cart).map(([id, qty]) => {
      const p = products.find(item => item.id === id);
      return `• ${productName(p)} × ${qty} — ${money(p.price * qty)}`;
    }).join('\n');
    const addressLine = mode === 'Delivery' ? `\n${t('address')}: ${address}` : '';
    const feeLine = mode === 'Delivery' ? `\n${t('deliveryFee')}: ${money(deliveryFee())}` : '';
    const message = `${t('newOrder')}\n\n${t('branch')}: ${branchName(branch)}\n${t('customer')}: ${name}\n${t('phone')}: ${phone}\n${t('receipt')}: ${mode}${addressLine}\n${t('payMethod')}: WhatsApp / COD\n\n${lines}${feeLine}\n\n${t('orderTotal')}: ${money(orderTotal())}`;
    saveCart();
    window.location.href = `https://wa.me/${branch.phone}?text=${encodeURIComponent(message)}`;
  };
  $('#checkoutForm').onsubmit = submitOrder;

  // An unavailable meal image is never replaced by a different meal.
  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || image.dataset.failedImage) return;
    image.dataset.failedImage = '1';
    image.style.objectFit = 'contain';
    image.style.background = '#f5f3ee';
  }, true);
  renderCart();
  updateCheckoutCopy();
})();
