// Font downloads must not block screenshots; browser interaction checks still use the real page.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const setDeliveryLocation=require('./delivery-test-helper.cjs');
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.AUDIT_BASE||'http://127.0.0.1:8765';
const report={base,createdAt:new Date().toISOString(),tests:[],failures:[],realMessagesSent:0,tariffNote:'Delivery tariff is audited as configured, not changed by this fix.'};
fs.mkdirSync('audit-results',{recursive:true});
const fmt=n=>'AED '+n.toFixed(Number.isInteger(n)?0:2);
async function audit(type,viewport,label){
 const browser=await type.launch({headless:true});
 let page;
 try{
  const context=await browser.newContext({viewport,deviceScaleFactor:1});
  const handoffs=[];
  await context.route('https://wa.me/**',r=>{handoffs.push(r.request().url());return r.fulfill({status:204,body:''})});
  await context.route('https://api.whatsapp.com/**',r=>{handoffs.push(r.request().url());return r.fulfill({status:204,body:''})});
  await context.route('**/_vercel/**',r=>r.abort());
  page=await context.newPage();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  assert.equal((await page.goto(base,{waitUntil:'load',timeout:45000})).status(),200);
  await page.waitForFunction(()=>document.documentElement.dataset.cartIntegrity==='20260915r1');
  if(await page.locator('#languageGate').evaluate(e=>e.open))await page.locator('[data-language=en]').click();
  const catalog=await page.evaluate(()=>products.map(p=>({id:p.id,price:p.price,cat:p.cat})));
  assert.equal(new Set(catalog.map(p=>p.id)).size,catalog.length,'Unique catalog IDs');
  let quickViews=0,recommendationClicks=0,mainAdds=0;
  async function checkTotals(note){
   const state=await page.evaluate(()=>({language:lang,pending:Object.keys(cart).length>0&&selectedMode()==='Delivery'&&deliveryFee()===null,cart:{...cart},subtotal:totals(),total:orderTotal(),fee:Object.keys(cart).length&&selectedMode()==='Delivery'?deliveryFee():0,cartText:document.getElementById('cartTotal').textContent,checkoutSubtotal:document.getElementById('checkoutSubtotal').textContent,checkoutText:document.getElementById('checkoutTotal').textContent,sticky:document.getElementById('stickyTotal').textContent,count:Number(document.getElementById('cartCount').textContent),navCount:Number(document.getElementById('navCartCount').textContent),stickyCount:Number(document.getElementById('stickyCount').textContent)}));
   const subtotalCents=Object.entries(state.cart).reduce((sum,[id,q])=>sum+Math.round(catalog.find(p=>p.id===id).price*100)*q,0);
   const expected=subtotalCents/100,total=(subtotalCents+Math.round(state.fee*100))/100,count=Object.values(state.cart).reduce((s,q)=>s+q,0);
   assert.equal(state.subtotal,expected,note+' subtotal');assert.equal(state.total,total,note+' total');
   assert.equal(state.cartText,fmt(expected),note+' cart displayed');assert.equal(state.checkoutSubtotal,fmt(expected),note+' checkout subtotal');
   assert.equal(state.checkoutText,state.pending?fmt(expected)+(state.language==='ar'?' + التوصيل':' + delivery'):fmt(total),note+' checkout total');assert.equal(state.sticky,fmt(expected),note+' sticky');
   assert.equal(state.count,count);assert.equal(state.navCount,count);assert.equal(state.stickyCount,count);
   return state;
  }
  for(const language of ['ar','en']){
   await page.evaluate(l=>applyLanguage(l,true),language);
   for(const p of catalog){
    await page.evaluate(id=>{document.getElementById('quickView').close();closeCart();cart={};renderCart();openQuickView(id)},p.id);
    const choices=await page.locator('#qvUpsell [data-qvadd]').evaluateAll(buttons=>buttons.map(b=>({id:b.dataset.qvadd,type:b.type,text:b.textContent,aria:b.getAttribute('aria-label'),height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width,color:getComputedStyle(b).color,nested:!!b.querySelector('button')})));
    assert(choices.length>0,'Recommendations for '+p.id);
    assert.equal(new Set(choices.map(c=>c.id)).size,choices.length);
    for(const c of choices){assert(!c.nested);assert.equal(c.type,'button');assert(c.text.includes('+'));assert(c.text.includes(language==='ar'?'إضافة':'Add'));assert(c.aria);assert(c.height>=44&&c.width>=44,'Tap size '+p.id+'/'+c.id);assert.equal(c.color,'rgb(255, 255, 255)');assert.notEqual(c.id,p.id)}
    const first=choices[0];
    await page.locator('#qvUpsell [data-qvadd="'+first.id+'"]').click();
    assert.equal(await page.evaluate(id=>cart[id],first.id),1);
    const batch=await page.evaluate(({ids,parent})=>{
     const result=[];
     for(const id of ids){
      const before=cart[id]||0,sub=totals(),selected=qvId,qty=qvQty,p=products.find(x=>x.id===id);
      document.querySelector('#qvUpsell [data-qvadd="'+id+'"]').click();
      if(cart[id]!==before+1)throw Error('Not exactly one add: '+id);
      if(Math.round(totals()*100)!==Math.round(sub*100)+Math.round(p.price*100))throw Error('Incorrect add price: '+id);
      if(qvId!==parent||qvId!==selected||qvQty!==qty||!document.getElementById('quickView').open)throw Error('Parent changed: '+id);
      result.push(id);
     }
     return result;
    },{ids:choices.slice(1).map(c=>c.id),parent:p.id});
    recommendationClicks+=batch.length+1;
    assert.equal(await page.evaluate(()=>qvId),p.id,'Add-on must not replace meal');
    assert.equal(await page.evaluate(id=>cart[id]||0,p.id),0,'No main item silently added');
    await checkTotals(p.id+' add-ons '+language);
    await page.locator('#qvPlus').click();
    assert.equal(await page.locator('#qvQty').textContent(),'2');
    assert((await page.locator('#qvSelectionTotal').textContent()).includes(fmt(p.price*2)));
    await page.locator('#qvAdd').click();
    assert.equal(await page.evaluate(id=>cart[id],p.id),2,'Main quantity '+p.id);
    await checkTotals(p.id+' main x2 '+language);
    assert.equal(handoffs.length,0,'No add control can submit an order');
    quickViews++;mainAdds++;
   }
   await page.evaluate(()=>{closeCart();cart={};renderCart();openQuickView('fish')});
   const repeat=page.locator('#qvUpsell [data-qvadd]').first(),repeatId=await repeat.getAttribute('data-qvadd');
   for(let i=0;i<5;i++)await repeat.click();
   assert.equal(await page.evaluate(id=>cart[id],repeatId),5,'Repeated taps count once each');
   assert((await page.locator('[data-qv-count="'+repeatId+'"]').textContent()).includes('5'));
   await page.locator('#qvUpsell').scrollIntoViewIfNeeded();
   await page.screenshot({path:'audit-results/'+label+'-add-buttons-'+language+'.png'});
   const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth>innerWidth+1,dialog:document.getElementById('quickView').scrollWidth>document.getElementById('quickView').clientWidth+1}));
   assert(!overflow.page&&!overflow.dialog,'No horizontal overflow '+language);
   await page.locator('#qvMinus').click();assert.equal(await page.locator('#qvQty').textContent(),'1');
   await page.locator('#qvAdd').click();
   await page.locator('#cartItems [data-plus=fish]').click();
   assert.equal(await page.evaluate(()=>cart.fish),2);
   await page.locator('#cartItems [data-minus=fish]').click();await page.locator('#cartItems [data-minus=fish]').click();
   assert.equal(await page.evaluate(()=>cart.fish||0),0,'Remove at zero');
   await checkTotals('plus/minus/remove '+language);
  }
  // Every menu add control: native button click, correct item and exactly one unit.
  await page.evaluate(()=>{closeCart();cart={};renderCart()});
  for(const p of catalog){
   await page.locator('#menuGrid [data-add="'+p.id+'"]').click();
   assert.equal(await page.evaluate(id=>cart[id],p.id),1);
   await page.locator('#closeCartBtn').click();
  }
  await checkTotals('all menu items once');
  // Corrupt/obsolete session data must never create NaN, negatives or unknown lines.
  await page.evaluate(()=>{cart={fish:2,pepsi:-1,water:1.5,unknown:99,'fries':Infinity};renderCart();addItem('unknown');changeQty('unknown',1)});
  assert.deepEqual(await page.evaluate(()=>cart),{fish:2});await checkTotals('invalid data');
  // Decimal prices are tested only in this isolated browser memory, never saved to the server.
  const decimals=await page.evaluate(()=>{
   const fish=products.find(p=>p.id==='fish'),pepsi=products.find(p=>p.id==='pepsi'),oldFish=fish.price,oldPepsi=pepsi.price;
   fish.price=35.25;pepsi.price=5.15;cart={fish:3,pepsi:2};renderCart();
   const result={subtotal:totals(),formatted:money(totals()),visible:document.getElementById('checkoutSubtotal').textContent};
   fish.price=oldFish;pepsi.price=oldPepsi;cart={fish:2,pepsi:1,'secret-sauce':2};renderCart();return result;
  });
  assert.equal(decimals.subtotal,116.05);assert.equal(decimals.formatted,'AED 116.05');assert.equal(decimals.visible,'AED 116.05');
  await page.reload({waitUntil:'load'});await page.waitForFunction(()=>document.documentElement.dataset.cartIntegrity==='20260915r1');
  assert.deepEqual(await page.evaluate(()=>cart),{fish:2,pepsi:1,'secret-sauce':2},'Reload preserves quantities, not stale totals');
  await page.locator('#openCartBtn').click();await page.locator('#checkoutBtn').click();
  await page.locator('#customerName').fill('TEST ONLY DO NOT PREPARE');await page.locator('#customerPhone').fill('0500000000');
  const branchList=await page.evaluate(()=>branches.map(b=>({id:b.id,phone:b.phone})));
  let observedDeliveryFee;
  await page.locator('#branchSelect').selectOption('dubai');
  await page.locator('[name=mode][value=Delivery]').check();
  await page.locator('#deliveryAddress').fill('TEST ONLY - no actual delivery');
  const pendingState=await checkTotals('unconfirmed location');
  assert.equal(pendingState.pending,true,'Unconfirmed delivery is not shown as free');
  const pendingHandoffs=handoffs.length;
  await page.locator('#checkoutForm button[type=submit]').click();
  assert.equal(handoffs.length,pendingHandoffs,'Missing pin blocks order handoff');
  await setDeliveryLocation(page,'dubai');
  for(const language of ['en','ar']){
   await page.evaluate(l=>applyLanguage(l,true),language);
   for(const mode of ['Delivery','Takeaway','Dine-in']){
    await page.locator('[name=mode][value="'+mode+'"]').check();
    if(mode==='Delivery')await page.locator('#deliveryAddress').fill('TEST ONLY - no actual delivery');
    let state=await checkTotals(language+' '+mode);
    if(mode==='Delivery')observedDeliveryFee=state.fee;else assert.equal(state.fee,0);
    for(const b of branchList){
     await page.locator('#branchSelect').selectOption(b.id);
     state=await checkTotals(language+' '+mode+' '+b.id);
     const before=handoffs.length;
     await page.locator('#checkoutForm button[type=submit]').click();
     await page.waitForTimeout(100);
     assert.equal(handoffs.length,before+1,'Exactly one intercepted handoff');
     const url=new URL(handoffs.at(-1)),message=url.searchParams.get('text');
     assert.equal(url.pathname,'/'+b.phone,'Correct selected branch');
     assert(message.includes((language==='ar'?'المجموع الفرعي':'Subtotal')+': '+fmt(state.subtotal)),'Receipt subtotal');
     assert(message.endsWith(fmt(state.total)),'Receipt grand total matches displayed total');
     assert(message.includes('× 2'),'Receipt quantities');
    }
   }
  }
  // Exercise the full radius bands using synthetic customer pins, never real orders.
  await page.locator('[name=mode][value=Delivery]').check();
  await page.locator('#branchSelect').selectOption('dubai');
  const origin=await page.evaluate(()=>AfandiDeliveryPricing.branchPins.dubai);
  for(const [km,fee] of [[2,5],[7,10],[12,15],[20,15]]){
   if(!(await page.locator('#deliveryManual').evaluate(e=>e.open)))await page.locator('#deliveryManual summary').click();
   await page.locator('#deliveryCoordinates').fill((origin.lat+km/111.195)+','+origin.lng);
   await page.locator('#deliveryApplyCoordinates').click();
   await page.locator('#deliveryConfirmLocation').click();
   const band=await checkTotals('radius '+km+' km');
   assert.equal(band.fee,fee);assert.equal(band.total,band.subtotal+fee);
   assert.equal(await page.locator('#cartGrandTotal').textContent(),fmt(band.total),'Drawer updates after pin changes');
  }
  // Checkout add-ons must not submit, lose details, or hide checkout behind the cart.
  await page.locator('[name=mode][value=Delivery]').check();
  await page.locator('#deliveryAddress').fill('TEST ONLY - retained address');
  const beforeHandoffs=handoffs.length;
  const choice=page.locator('[data-merch-add=water]').first();
  const subBefore=(await checkTotals('before checkout add')).subtotal;
  await choice.click();
  assert.equal((await checkTotals('checkout add')).subtotal,subBefore+catalog.find(p=>p.id==='water').price);
  assert.equal(handoffs.length,beforeHandoffs);assert(await page.locator('#checkoutDialog').evaluate(e=>e.open));
  assert.equal(await page.locator('#deliveryAddress').inputValue(),'TEST ONLY - retained address');
  await page.locator('[data-merch-view=water]').first().click();
  const nestedButton=page.locator('#qvUpsell [data-qvadd]').first();await nestedButton.click();
  await page.locator('#qvAdd').click();
  assert(await page.locator('#checkoutDialog').evaluate(e=>e.open));assert.equal(await page.locator('#cartDrawer').getAttribute('aria-hidden'),'true');
  await checkTotals('nested quick view from checkout');
  await page.locator('#checkoutSubtotalRow').scrollIntoViewIfNeeded();
  await page.screenshot({path:'audit-results/'+label+'-totals.png'});
  await page.evaluate(()=>{cart={};renderCart()});
  const empty=await checkTotals('empty delivery cart');assert.equal(empty.total,0);assert.equal(empty.fee,0);
  assert.equal(errors.length,0,errors.join('; '));
  report.tests.push({label,pass:true,languages:['ar','en'],catalogProducts:catalog.length,quickViews,recommendationClicks,mainAdds,menuButtons:catalog.length,observedDeliveryFee,verifiedFeeBands:[5,10,15],pendingLocationBlocksSubmit:true,interceptedHandoffs:handoffs.length,realMessagesSent:0,checks:'Explicit + Add on all QV recommendations; correct item and quantity; parent preserved; rapid repeats; main x2; every menu add; plus/minus/remove; canonical prices; subtotal/grand total/sticky/counts; decimal rounding; invalid and stale cart; refresh persistence; all three order modes; all branch WhatsApp receipts intercepted; checkout nested QV; no auto-submission; empty cart zero; no horizontal overflow or JavaScript errors'});
 }catch(error){if(page)await page.screenshot({path:'audit-results/'+label+'-failure.png'}).catch(()=>{});throw error}finally{await browser.close()}
}
(async()=>{
 for(const [type,viewport,label]of[[chromium,{width:390,height:844},'chromium-mobile'],[webkit,{width:390,height:844},'webkit-mobile'],[chromium,{width:1440,height:900},'chromium-desktop']]){
  try{await audit(type,viewport,label)}catch(error){report.failures.push({label,error:error.stack});console.error(label,error)}
 }
 const file=base.startsWith('https:')?'cart-integrity-live.json':'cart-integrity-local.json';
 fs.writeFileSync('audit-results/'+file,JSON.stringify(report,null,2));console.log('CART_INTEGRITY_REPORT '+JSON.stringify(report));
 process.exitCode=report.failures.length?1:0;
})();
