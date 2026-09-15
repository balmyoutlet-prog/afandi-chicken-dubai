const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.AUDIT_BASE || 'http://127.0.0.1:8765';
const production = base.startsWith('https:');
const results = { base, actualMessagesSent: 0, cases: [], failures: [] };
fs.mkdirSync('audit-results', { recursive: true });

async function run(browserType, viewport, label) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const handedOff = [];
  const pageErrors = [];
  await context.route('https://wa.me/**', route => {
    handedOff.push(route.request().url());
    return route.fulfill({ status: 204, body: '' }); // Never send a message or open a branch conversation.
  });
  await context.route('**/_vercel/**', route => route.abort()); // Do not pollute analytics.
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => pageErrors.push(error.message));
  const response = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
  assert.equal(response.status(), 200, 'Homepage status');
  if (await page.locator('#languageGate').evaluate(el => el.open)) await page.locator('[data-language="en"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#menuGrid .menu-card').length > 0);
  const catalog = await page.evaluate(() => products.map(p => ({ id: p.id, cat: p.cat, price: p.price, en: p.en, ar: p.ar, image: p.image })));
  assert.equal(await page.locator('#menuGrid .menu-card').count(), catalog.length);
  for (const category of ['meals', 'bowls', 'wraps', 'extras', 'drinks', 'all']) {
    await page.locator(`#filters [data-cat="${category}"]`).click();
    assert.equal(await page.locator('#menuGrid .menu-card').count(), category === 'all' ? catalog.length : catalog.filter(p => p.cat === category).length);
  }
  results.cases.push({ label, test: 'all categories and products render', count: catalog.length, pass: true });

  // Load and decode every unique catalog image, even lazy images below the fold.
  const images = await page.evaluate(async () => {
    const sources = [...new Set([...products.map(p => p.image), ...branches.map(b => b.image), ...Array.from(document.images, i => i.getAttribute('src'))].filter(Boolean))];
    return Promise.all(sources.map(src => new Promise(resolve => {
      const image = new Image();
      const timer = setTimeout(() => resolve({ src, ok: false, reason: 'timeout' }), 20000);
      image.onload = () => { clearTimeout(timer); resolve({ src, ok: image.naturalWidth > 0, width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = () => { clearTimeout(timer); resolve({ src, ok: false, reason: 'decode or HTTP failure' }); };
      image.src = src;
    })));
  });
  results.cases.push({ label, test: 'all unique images decode', total: images.length, failed: images.filter(i => !i.ok), pass: images.every(i => i.ok) });
  if (!production) assert.equal(images.filter(i => !i.ok).length, 0, JSON.stringify(images.filter(i => !i.ok)));

  if (production && !(await page.locator('#checkoutBackToMenu').count())) {
    results.cases.push({ label, test: 'patched release is not live yet', pass: false });
    await browser.close();
    return;
  }

  // Customer opens every product quick view and checks the matching title and image.
  for (const product of catalog) {
    await page.locator(`#menuGrid [data-view="${product.id}"]`).click();
    assert.equal(await page.locator('#qvName').textContent(), product.en);
    await page.waitForFunction(() => { const image = document.querySelector('#qvImage'); return image.complete && image.naturalWidth > 0; });
    await page.locator('#qvClose').click();
  }
  results.cases.push({ label, test: 'all product quick views', count: catalog.length, pass: true });

  await page.locator('#menuGrid [data-add="fish"]').click();
  assert.equal(await page.locator('#cartCount').textContent(), '1');
  await page.locator('#cartItems [data-plus="fish"]').click();
  assert.equal(await page.locator('#cartCount').textContent(), '2');
  await page.locator('#cartItems [data-minus="fish"]').click();
  await page.locator('#checkoutBtn').click();
  await page.locator('#branchSelect').selectOption('dubai');
  await page.locator('#customerName').fill('TEST ONLY - DO NOT PREPARE');
  await page.locator('#customerPhone').fill('0500000000');
  await page.locator('[name="mode"][value="Delivery"]').check();
  await page.locator('#deliveryAddress').fill('TEST ONLY - synthetic address, no delivery');
  const fishPrice = catalog.find(p => p.id === 'fish').price;
  assert.equal(await page.locator('#checkoutTotal').textContent(), `AED ${fishPrice + 3}`);
  await page.locator('#checkoutSuggest [data-add="pepsi"]').first().click();
  const subtotal = fishPrice + catalog.find(p => p.id === 'pepsi').price;
  assert.equal(await page.locator('#checkoutTotal').textContent(), `AED ${subtotal + 3}`, 'Delivery fee survives checkout upsell');
  assert.equal(await page.locator('#cartDrawer').getAttribute('aria-hidden'), 'true', 'Upsell must not hide checkout behind a drawer');
  await page.locator('#checkoutBackToMenu').click();
  assert.equal(await page.locator('#checkoutDialog').evaluate(el => el.open), false);
  assert.equal(await page.locator('#cartCount').textContent(), '2');
  await page.locator('#openCartBtn').click();
  await page.locator('#checkoutBtn').click();
  assert.equal(await page.locator('#branchSelect').inputValue(), 'dubai');
  await page.evaluate(() => applyLanguage('ar', true));
  assert.equal(await page.locator('#branchSelect').inputValue(), 'dubai', 'Language switch preserves selected branch');
  assert.equal(await page.locator('#checkoutTotal').textContent(), `AED ${subtotal + 3}`);
  results.cases.push({ label, test: 'quantity, checkout upsell, delivery total, add-items return, branch preservation', pass: true });

  const branchList = await page.evaluate(() => branches.map(b => ({ id: b.id, phone: b.phone, ar: b.ar, en: b.en })));
  for (const language of ['ar', 'en']) {
    await page.evaluate(value => applyLanguage(value, true), language);
    for (const branch of branchList) {
      await page.locator('#branchSelect').selectOption(branch.id);
      for (const mode of ['Delivery', 'Takeaway', 'Dine-in']) {
        await page.locator(`[name="mode"][value="${mode}"]`).check();
        const expected = subtotal + (mode === 'Delivery' ? 3 : 0);
        assert.equal(await page.locator('#checkoutTotal').textContent(), `AED ${expected}`);
        const count = handedOff.length;
        await page.locator('#checkoutForm button[type="submit"]').click();
        await page.waitForTimeout(120);
        assert.equal(handedOff.length, count + 1, 'Exactly one WhatsApp handoff');
        const url = new URL(handedOff.at(-1));
        const message = url.searchParams.get('text');
        assert.equal(url.pathname, '/' + branch.phone);
        assert.ok(message.includes(branch[language]));
        assert.ok(message.includes(`AED ${expected}`));
        assert.ok(message.includes('TEST ONLY - DO NOT PREPARE'));
        assert.equal(message.includes('synthetic address'), mode === 'Delivery');
      }
    }
  }
  results.cases.push({ label, test: 'five branches × three order types × Arabic/English WhatsApp payloads', count: 30, pass: true, deliveredMessagesVerified: false });
  await page.locator('#customerPhone').fill('abc');
  const beforeInvalid = handedOff.length;
  await page.locator('#checkoutForm button[type="submit"]').click();
  assert.equal(handedOff.length, beforeInvalid, 'Invalid phone must not hand off');
  await page.locator('#customerPhone').fill('0500000000');
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('#cartCount').textContent(), '2', 'Cart survives reload');
  assert.equal(pageErrors.length, 0, 'No uncaught application errors: ' + pageErrors.join('; '));
  await page.screenshot({ path: `audit-results/${label}.png`, fullPage: true });
  results.cases.push({ label, test: 'phone validation, reload persistence and no uncaught JS errors', pass: true });
  const timing = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return { ttfbMs: Math.round(n.responseStart - n.requestStart), domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), transferBytes: n.transferSize };
  });
  results.cases.push({ label, test: 'navigation sample (not a Lighthouse score)', ...timing });
  await browser.close();
}

(async () => {
  for (const [type, viewport, label] of [[chromium, { width: 390, height: 844 }, 'chromium-mobile'], [chromium, { width: 1440, height: 900 }, 'chromium-desktop'], [webkit, { width: 390, height: 844 }, 'webkit-mobile']]) {
    try { await run(type, viewport, label); }
    catch (error) { results.failures.push({ label, error: error.stack }); console.error(label, error); }
  }
  fs.writeFileSync(path.join('audit-results', production ? 'production.json' : 'functional.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.failures.length || results.cases.some(c => c.pass === false) ? 1 : 0);
})();
