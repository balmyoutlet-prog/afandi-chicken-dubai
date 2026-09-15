"""Idempotent integration with the independently released distance-delivery UI."""
from pathlib import Path

def replace(text, old, new):
    if new in text:
        return text
    if old not in text:
        raise SystemExit('Integration anchor changed: ' + old[:90])
    return text.replace(old, new, 1)

path = Path('cart-integrity.js')
s = path.read_text()
s = replace(s, "    #qvUpsell {display:grid", "    #cartDrawer.open ~ #stickyBar {display:none!important;pointer-events:none}\n    #qvUpsell {display:grid")
s = replace(s, "    const delivery = selectedMode() === 'Delivery' && nonempty;", "    const delivery = selectedMode() === 'Delivery' && nonempty;\n    const pending = delivery && (fee === null || !Number.isFinite(Number(fee)));\n    const totalText = pending ? money(totals()) + text(' + التوصيل', ' + delivery') : money(orderTotal());\n    const feeText = pending ? text('بعد تحديد الموقع', 'After choosing location') : money(fee);")
s = s.replace("document.getElementById('checkoutTotal').textContent = money(orderTotal());", "document.getElementById('checkoutTotal').textContent = totalText;")
s = s.replace("document.getElementById('cartDeliveryFee').textContent = money(fee);", "document.getElementById('cartDeliveryFee').textContent = feeText;")
s = s.replace("document.getElementById('cartGrandTotal').textContent = money(orderTotal());", "document.getElementById('cartGrandTotal').textContent = totalText;")
s = s.replace("feeRow.querySelector('strong').textContent = money(fee);", "feeRow.querySelector('strong').textContent = feeText;")
s = replace(s, "    for (const count of document.querySelectorAll('[data-qv-count]')) {", "    if (pending) {\n      checkoutSummary.querySelector('span').textContent = text('المجموع الفرعي + التوصيل', 'Subtotal + delivery');\n      drawerGrand.querySelector('span').textContent = text('المجموع الفرعي + التوصيل', 'Subtotal + delivery');\n    }\n    for (const count of document.querySelectorAll('[data-qv-count]')) {")
s = replace(s, "  renderCart();\n  document.documentElement.dataset.cartIntegrity", "  // Quote-detail changes cover branch, GPS, manual pin, confirmation and clearing.\n  // syncSummary never writes quote-detail, so this observer cannot loop.\n  const quoteDetail = document.getElementById('deliveryQuoteDetail');\n  if (quoteDetail) new MutationObserver(syncSummary).observe(quoteDetail, {childList:true,subtree:true});\n  document.getElementById('branchSelect').addEventListener('change',syncSummary);\n  renderCart();\n  document.documentElement.dataset.cartIntegrity")
path.write_text(s)

path = Path('scripts/e2e-cart-integrity.cjs')
s = path.read_text()
s = replace(s, "const {chromium,webkit}=require('playwright');", "// Font downloads must not block screenshots; browser interaction checks still use the real page.\nprocess.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';\nconst setDeliveryLocation=require('./delivery-test-helper.cjs');\nconst {chromium,webkit}=require('playwright');")
s = s.replace('data-merch-view=fish','data-merch-view=water')
s = replace(s, "({cart:{...cart},subtotal:totals()", "({language:lang,pending:Object.keys(cart).length>0&&selectedMode()==='Delivery'&&deliveryFee()===null,cart:{...cart},subtotal:totals()")
s = replace(s, "assert.equal(state.checkoutText,fmt(total),note+' checkout total');", "assert.equal(state.checkoutText,state.pending?fmt(expected)+(state.language==='ar'?' + التوصيل':' + delivery'):fmt(total),note+' checkout total');")
s = replace(s, "  let observedDeliveryFee;", "  let observedDeliveryFee;\n  await page.locator('#branchSelect').selectOption('dubai');\n  await page.locator('[name=mode][value=Delivery]').check();\n  await page.locator('#deliveryAddress').fill('TEST ONLY - no actual delivery');\n  const pendingState=await checkTotals('unconfirmed location');\n  assert.equal(pendingState.pending,true,'Unconfirmed delivery is not shown as free');\n  const pendingHandoffs=handoffs.length;\n  await page.locator('#checkoutForm button[type=submit]').click();\n  assert.equal(handoffs.length,pendingHandoffs,'Missing pin blocks order handoff');\n  await setDeliveryLocation(page,'dubai');")
s = replace(s, "    const state=await checkTotals(language+' '+mode);", "    let state=await checkTotals(language+' '+mode);")
s = replace(s, "     await page.locator('#branchSelect').selectOption(b.id);\n     const before=handoffs.length;", "     await page.locator('#branchSelect').selectOption(b.id);\n     state=await checkTotals(language+' '+mode+' '+b.id);\n     const before=handoffs.length;")
s = replace(s, "  // Checkout add-ons must not submit, lose details, or hide checkout behind the cart.", "  // Exercise the full radius bands using synthetic customer pins, never real orders.\n  await page.locator('[name=mode][value=Delivery]').check();\n  await page.locator('#branchSelect').selectOption('dubai');\n  const origin=await page.evaluate(()=>AfandiDeliveryPricing.branchPins.dubai);\n  for(const [km,fee] of [[2,5],[7,10],[12,15],[20,15]]){\n   if(!(await page.locator('#deliveryManual').evaluate(e=>e.open)))await page.locator('#deliveryManual summary').click();\n   await page.locator('#deliveryCoordinates').fill((origin.lat+km/111.195)+','+origin.lng);\n   await page.locator('#deliveryApplyCoordinates').click();\n   await page.locator('#deliveryConfirmLocation').click();\n   const band=await checkTotals('radius '+km+' km');\n   assert.equal(band.fee,fee);assert.equal(band.total,band.subtotal+fee);\n   assert.equal(await page.locator('#cartGrandTotal').textContent(),fmt(band.total),'Drawer updates after pin changes');\n  }\n  // Checkout add-ons must not submit, lose details, or hide checkout behind the cart.")
s = s.replace("observedDeliveryFee,interceptedHandoffs", "observedDeliveryFee,verifiedFeeBands:[5,10,15],pendingLocationBlocksSubmit:true,interceptedHandoffs")
path.write_text(s)
print('Reconciled summaries and audit fixtures with confirmed distance-based delivery; no price, phone, or location pin changes.')
