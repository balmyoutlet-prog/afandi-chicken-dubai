/* Afandi Dubai: optional checkout merchandising, never fabricated sales claims. */
(function () {
  'use strict';
  const box = document.getElementById('checkoutSuggest');
  const dialog = document.getElementById('checkoutDialog');
  const form = document.getElementById('checkoutForm');
  if (!box || !dialog || !form) return;
  const text = (ar, en) => lang === 'ar' ? ar : en;
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sauceIds = ['garlic', 'secret-sauce', 'dynamite-sauce', 'cheddar-sauce', 'cocktail-sauce'];
  let currentLanguage = null;
  let impressionObserver;
  const seen = new Set();
  function event(name, data) {
    // No customer name, phone, address, cookies, new vendor or paid service.
    const detail = {event: name, currency: 'AED', language: lang, ...data};
    window.dispatchEvent(new CustomEvent('afandi:marketing', {detail}));
    if (Array.isArray(window.dataLayer)) window.dataLayer.push(detail);
  }
  function orderProducts() { return products.filter(p => (cart[p.id] || 0) > 0); }
  function rank(ids) {
    return [...new Set(ids)].map(id => products.find(p => p.id === id)).filter(p => p && p.available !== false && p.stock !== 0);
  }
  function groupItems(category) { return products.filter(p => p.cat === category).map(p => p.id); }
  function recommendations() {
    const ordered = orderProducts();
    const hasDrink = ordered.some(p => p.cat === 'drinks');
    const spicy = ordered.some(p => p.tag === 'SPICY');
    const seafood = ordered.some(p => ['fish', 'crispy-shrimp'].includes(p.id));
    const grilled = ordered.some(p => p.tag === 'GRILLED');
    const ids = [];
    if (!hasDrink) ids.push(spicy ? 'water' : 'pepsi', '7up');
    if (seafood) ids.push('cocktail-sauce', 'secret-sauce');
    else if (grilled) ids.push('hummus', 'mutabbal', 'rice-plate');
    else ids.push('secret-sauce', 'cheddar-sauce');
    ids.push('honey-coleslaw', 'cheddar-jalapeno-fries', 'fries', 'water', 'kinza-cola', 'hummus', 'garlic', 'sliced-potatoes');
    return rank(ids).filter(p => !cart[p.id]).slice(0, 8);
  }
  function groups() {
    const main = orderProducts().find(p => ['meals', 'wraps', 'bowls'].includes(p.cat));
    const known = [
      {id:'drinks', category:'drinks', title:text('عطشان؟ كمّلها بمشروب', 'Thirsty? Make it a meal'), subtitle:text('اختَر مشروبك مع الوجبة', 'Pick a drink to go with your food'), ids:['pepsi','7up','mirinda','water','mountain-dew','kinza-cola','pepsi-diet','7up-diet',...groupItems('drinks')]},
      {id:'pairings', category:'recommended', title:text('بيليق مع طلبك', 'A little extra that goes well'), subtitle:main ? text('اقتراحات مع '+productName(main)+' — إضافات اختيارية بسعرها الموضح', 'Suggested with '+productName(main)+' — optional extras at the prices shown') : text('اقتراحات بتكمّل سفرتك', 'A few ideas to complete your spread'), picks:recommendations()},
      {id:'extras', category:'extras', title:text('بطاطا أو سلطة؟ كمّل السفرة', 'Sides worth making room for'), subtitle:text('إضافات للمشاركة أو حصّة زيادة', 'Something to share, or an extra portion'), ids:groupItems('extras').filter(id => !sauceIds.includes(id))},
      {id:'sauces', category:'extras', title:text('غمسة زيادة، نكهة زيادة', 'One more dip, a little more flavour'), subtitle:text('بدّك صوص زيادة؟ اختَر نكهتك', 'Extra sauce? Choose your favourite'), ids:sauceIds},
      {id:'meals', category:'meals', title:text('في حدا جوعان معك؟', 'Ordering for someone else too?'), subtitle:text('وجبة إضافية من منيو الأفندي', 'Add another meal from the Al Afandi menu'), ids:groupItems('meals')},
      {id:'wraps', category:'wraps', title:text('راب عالطريق أو للمشاركة', 'A wrap for the road, or to share'), subtitle:text('اختَر الراب أو الساندويش اللي بيليق بمزاجك', 'Choose a wrap or sandwich to suit your mood'), ids:groupItems('wraps')},
      {id:'bowls', category:'bowls', title:text('مزاجك باول؟', 'In the mood for a bowl?'), subtitle:text('ريزو أو فيستا؟ الاختيار إلك', 'Rizo or Vista? Your call'), ids:groupItems('bowls')}
    ];
    const covered = new Set(known.map(g => g.category));
    for (const category of new Set(products.map(p => p.cat))) {
      if (!covered.has(category)) known.push({id:category,category,title:t(category),subtitle:text('اختيارات من المنيو', 'More from the menu'),ids:groupItems(category)});
    }
    return known.map(g => ({...g,items:g.picks || rank(g.ids).slice(0,8)})).filter(g => g.items.length);
  }
  function card(p, category) {
    const thumbnail = typeof afandiPreviewImage === 'function' ? afandiPreviewImage(p.image) : p.image;
    const sources = typeof afandiPreviewSet === 'function' ? afandiPreviewSet(p.image) : '';
    const photo = thumbnail ? `<img src="${safe(thumbnail)}" ${sources ? `srcset="${safe(sources)}" sizes="150px"` : ''} alt="${safe(productName(p))}" loading="lazy" decoding="async" width="180" height="180">` : `<span class="merch-no-photo">${safe(productName(p))}</span>`;
    return `<article class="merch-card" data-merch-product="${safe(p.id)}"><button type="button" class="merch-photo" data-merch-view="${safe(p.id)}" aria-label="${safe(text('عرض ', 'View ')+productName(p))}">${photo}</button><h5>${safe(productName(p))}</h5><div class="merch-card-foot"><strong>${safe(money(p.price))}</strong><button type="button" class="merch-add" data-add="${safe(p.id)}" data-merch-add="${safe(p.id)}" data-merch-category="${safe(category)}" aria-label="${safe(text('إضافة ', 'Add ')+productName(p))}"><span aria-hidden="true">+</span> ${safe(text('أضف','Add'))}</button></div><span class="merch-in-cart" data-merch-count="${safe(p.id)}"></span></article>`;
  }
  function updateCounts() {
    for (const count of box.querySelectorAll('[data-merch-count]')) {
      const quantity = cart[count.dataset.merchCount] || 0;
      count.textContent = quantity ? text('بالسلة: ', 'In your cart: ') + quantity : '';
    }
  }
  function observeImpressions() {
    if (impressionObserver) impressionObserver.disconnect();
    if (!dialog.open || !('IntersectionObserver' in window)) return;
    impressionObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const category = entry.target.dataset.merchGroup;
        if (seen.has(category)) continue;
        seen.add(category);
        event('checkout_recommendation_view', {category});
      }
    }, {root:dialog,threshold:0.15});
    box.querySelectorAll('[data-merch-group]').forEach(section => impressionObserver.observe(section));
  }
  function render(force = false) {
    if (!force && dialog.open && currentLanguage === lang && box.querySelector('.merch-group')) { updateCounts(); return; }
    currentLanguage = lang;
    const sections = groups();
    box.classList.add('merchandising');
    box.innerHTML = `<header class="merch-intro"><div><span class="micro">${safe(text('كمّلها على ذوقك', 'MAKE IT YOURS'))}</span><h3>${safe(text('إضافة صغيرة، وجبة أطيب', 'Little extras. A better meal.'))}</h3><p>${safe(text('كل الإضافات اختيارية — السعر والمجموع واضحين قبل الإرسال.', 'All extras are optional. Prices and your total stay clear before sending.'))}</p></div><button type="button" class="merch-skip">${safe(text('كمّل بدون إضافات ↓', 'Continue without extras ↓'))}</button></header>` + sections.map((g,index) => `<section class="merch-group" data-merch-group="${safe(g.id)}" data-category="${safe(g.category)}" aria-labelledby="merch-title-${index}"><div class="merch-group-heading"><div><h4 id="merch-title-${index}">${safe(g.title)}</h4><p>${safe(g.subtitle)}</p></div><div class="merch-arrows"><button type="button" data-rail-direction="-1" aria-label="${safe(text('السابق: ', 'Previous: ')+g.title)}" aria-controls="merch-rail-${index}">${lang==='ar'?'→':'←'}</button><button type="button" data-rail-direction="1" aria-label="${safe(text('التالي: ', 'Next: ')+g.title)}" aria-controls="merch-rail-${index}">${lang==='ar'?'←':'→'}</button></div></div><div id="merch-rail-${index}" class="merch-rail" role="region" tabindex="0" aria-label="${safe(g.title)}">${g.items.map(p=>card(p,g.id)).join('')}</div><small class="merch-hint">${safe(text('اسحب لتشوف الاختيارات', 'Swipe to explore'))} · ${g.items.length} ${safe(text('أصناف', 'choices'))}</small></section>`).join('');
    box.querySelector('.merch-skip').onclick = () => {
      event('checkout_extras_skipped', {value:orderTotal()});
      form.querySelector('[type="submit"]').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
      form.querySelector('[type="submit"]').focus({preventScroll:true});
    };
    for (const button of box.querySelectorAll('[data-merch-add]')) button.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      const p = products.find(item => item.id === button.dataset.merchAdd);
      if (!p) return;
      addItem(p.id);
      event('checkout_recommendation_add', {item_id:p.id,category:button.dataset.merchCategory,price:p.price,value:orderTotal()});
      const status = document.getElementById('checkoutMerchStatus');
      status.textContent = text('تمت إضافة ', 'Added ') + productName(p) + text('. المجموع ', '. Total ') + money(orderTotal());
    };
    for (const button of box.querySelectorAll('[data-merch-view]')) button.onclick = () => openQuickView(button.dataset.merchView);
    for (const button of box.querySelectorAll('[data-rail-direction]')) button.onclick = () => {
      const rail = document.getElementById(button.getAttribute('aria-controls'));
      const direction = Number(button.dataset.railDirection) * (lang === 'ar' ? -1 : 1);
      rail.scrollBy({left:direction * Math.max(160,rail.clientWidth*0.85),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    };
    updateCounts();
    observeImpressions();
  }
  const status = document.createElement('p');
  status.id = 'checkoutMerchStatus';
  status.className = 'merch-status';
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const summary = form.querySelector('.checkout-summary');
  const sendButton = form.querySelector('button[type="submit"]');
  const completion = document.createElement('div');
  completion.id = 'checkoutCompletion';
  completion.className = 'checkout-completion';
  summary.before(completion);
  completion.append(status,summary,sendButton);
  renderCheckoutSuggest = render;
  // Disable accidental native form submissions from non-checkout controls.
  for (const button of form.querySelectorAll('button:not([type])')) button.type = 'button';
  new MutationObserver(records => {
    if (!records.some(record => record.attributeName==='open')) return;
    if (dialog.open) { seen.clear(); render(true); event('checkout_open', {value:orderTotal()}); }
    else if (impressionObserver) impressionObserver.disconnect();
  }).observe(dialog,{attributes:true,attributeFilter:['open']});
  dialog.setAttribute('aria-label',text('إكمال الطلب', 'Checkout'));
  document.getElementById('quickView').setAttribute('aria-labelledby','qvName');
  document.getElementById('languageGate').setAttribute('aria-label','Choose your language / اختر لغتك');
  render(true);
})();
