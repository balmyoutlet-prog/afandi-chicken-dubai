const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const P=require('../delivery-pricing.js');
const base=process.env.AUDIT_BASE||'http://127.0.0.1:8765';
const report={base,createdAt:new Date().toISOString(),realMessagesSent:0,browsers:[],failures:[]};
fs.mkdirSync('audit-results',{recursive:true});
const phones={dubai:'971528666619',majaz:'971555570560',taawun:'971564087870',marsa:'971564088288',khalifa:'971554505712'};
async function manual(page,p){
 if(!await page.locator('#deliveryManual').evaluate(e=>e.open))await page.locator('#deliveryManual summary').click();
 await page.locator('#deliveryCoordinates').fill(p.lat+','+p.lng);
 await page.locator('#deliveryApplyCoordinates').click();
 await page.locator('#deliveryConfirmLocation').click();
}
async function openCheckout(page){
 assert.equal((await page.goto(base,{waitUntil:'load',timeout:45000})).status(),200);
 if(await page.locator('#languageGate').evaluate(e=>e.open))await page.locator('[data-language=en]').click();
 await page.locator('#menuGrid [data-add=fish]').click();await page.locator('#checkoutBtn').click();
 await page.locator('#customerName').fill('TEST ONLY - DO NOT PREPARE');
 await page.locator('#customerPhone').fill('0500000000');
 await page.locator('[name=mode][value=Delivery]').check();
 await page.locator('#deliveryAddress').fill('SYNTHETIC TEST ADDRESS - NO DELIVERY');
}
async function run(type,viewport,label){
 const browser=await type.launch({headless:true});
 try{
  const context=await browser.newContext({viewport});let handoffs=[];
  await context.route('https://wa.me/**',r=>{handoffs.push(r.request().url());return r.fulfill({status:204,body:''})});
  await context.route('**/_vercel/**',r=>r.abort());
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__gpsCalls=0;window.__gpsMode='success';window.__gpsPoint={latitude:25.421204,longitude:55.443203,accuracy:8};
   Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success,error){
    window.__gpsCalls++;
    const deliver=()=>window.__gpsMode==='denied'?error({code:1}):window.__gpsMode==='timeout'?error({code:3}):success({coords:window.__gpsPoint});
    if(window.__gpsMode==='pending')window.__gpsResolve=()=>success({coords:window.__gpsPoint});else setTimeout(deliver,5);
   }}});
  });
  await openCheckout(page);
  const branchState=await page.evaluate(()=>({
   all:branches.map(b=>({id:b.id,phone:b.phone,map:b.map,en:b.en,ar:b.ar,openingSoon:!!b.openingSoon})),
   active:branches.filter(b=>!b.openingSoon).map(b=>({id:b.id,phone:b.phone,map:b.map,en:b.en,ar:b.ar}))
  }));
  assert(branchState.active.length>0,'At least one branch must remain orderable');
  assert.equal(await page.locator('#branchSelect option').count(),branchState.active.length+1,'Checkout lists only orderable branches');
  for(const b of branchState.all.filter(b=>b.openingSoon))assert.equal(await page.locator(`#branchSelect option[value="${b.id}"]`).count(),0,`Opening-soon branch ${b.id} must not be orderable`);
  const primary=branchState.active[0];
  const activePins=branchState.active.map(b=>P.branchPins[b.id]);
  assert.equal(await page.evaluate(()=>window.__gpsCalls),0,'No automatic location access');
  assert.equal(await page.evaluate(()=>window.AfandiDeliveryUI.getQuote().feeAED),null);
  assert((await page.locator('#checkoutTotal').textContent()).includes('+ delivery'));
  await page.locator('#branchSelect').selectOption(primary.id);
  await page.locator('#checkoutForm button[type=submit]').click();
  assert.equal(handoffs.length,0,'Unknown location never sends a fabricated delivery fee');
  await page.locator('#branchSelect').selectOption('');
  await manual(page,P.branchPins.majaz);
  const nearestActive=P.nearestBranch(P.branchPins.majaz,activePins);
  assert.equal(await page.locator('#branchSelect').inputValue(),nearestActive.branch.id,'Nearest auto-selection only uses orderable branches');
  assert.equal(await page.locator('#checkoutTotal').textContent(),'AED 40');
  await page.locator('#branchSelect').selectOption('khalifa');
  let q=P.quote({mode:'Delivery',customer:P.branchPins.majaz,branch:P.branchPins.khalifa});
  assert.equal(await page.evaluate(()=>deliveryFee()),q.feeAED,'Selected fulfilling branch determines charge');
  assert.equal(await page.locator('#deliveryNearestBranch').isVisible(),true);
  await page.locator('#deliveryNearestBranch').click();assert.equal(await page.locator('#branchSelect').inputValue(),nearestActive.branch.id);
  const tiers=[];
  await page.locator('#branchSelect').selectOption(primary.id);
  for(const [km,fee] of [[0,5],[4.99,5],[5.01,10],[9.99,10],[10.01,15],[14.99,15],[15.01,15],[20,15]]){
   const point={lat:P.branchPins[primary.id].lat+km/111.1950802335,lng:P.branchPins[primary.id].lng};
   await manual(page,point);
   assert.equal(await page.evaluate(()=>deliveryFee()),fee);
   assert.equal(await page.locator('#checkoutTotal').textContent(),'AED '+(35+fee));
   tiers.push({km,feeAED:fee,pass:true});
  }
  // Repeated add-ons keep the distance quote; they never submit the form.
  await page.locator('[data-merch-group=drinks] [data-merch-add=pepsi]').click();
  assert.equal(await page.locator('#checkoutTotal').textContent(),'AED 55');
  assert.equal(handoffs.length,0);
  await page.evaluate(()=>{cart={fish:1};renderCart()});
  await manual(page,P.branchPins[primary.id]);
  const branchList=branchState.active;
  assert.deepEqual(Object.fromEntries(branchState.all.map(b=>[b.id,b.phone])),phones,'No owner phone number changed');
  for(const language of ['en','ar']){
   await page.evaluate(l=>applyLanguage(l,true),language);
   for(const b of branchList){
    await page.locator('#branchSelect').selectOption(b.id);
    for(const mode of ['Delivery','Takeaway','Dine-in']){
     await page.locator(`[name=mode][value="${mode}"]`).check();
     const expected=P.quote({mode,customer:P.branchPins[primary.id],branch:P.branchPins[b.id]});
     assert.equal(await page.locator('#checkoutTotal').textContent(),'AED '+(35+expected.feeAED));
     const count=handoffs.length;
     await page.locator('#checkoutForm button[type=submit]').click();await page.waitForTimeout(100);
     assert.equal(handoffs.length,count+1,'Exactly one requested handoff');
     const url=new URL(handoffs.at(-1)),message=url.searchParams.get('text');
     assert.equal(url.pathname,'/'+b.phone);assert(message.includes(b[language]));
     assert(message.endsWith('AED '+(35+expected.feeAED)));
     assert.equal(message.includes('https://www.google.com/maps?q='),mode==='Delivery');
     if(mode==='Delivery')assert(message.includes(P.branchPins[primary.id].lat.toFixed(7)+','+P.branchPins[primary.id].lng.toFixed(7)));
    }
   }
  }
  await page.evaluate(()=>applyLanguage('en',true));
  await page.locator('[name=mode][value=Delivery]').check();
  await page.locator('#deliveryCoordinates').fill('not a map');await page.locator('#deliveryApplyCoordinates').click();
  assert.equal(await page.evaluate(()=>window.AfandiDeliveryUI.getQuote().feeAED),null);
  await page.locator('[name=mode][value=Takeaway]').check();
  const pickupBefore=handoffs.length;await page.locator('#checkoutForm button[type=submit]').click();await page.waitForTimeout(100);
  assert.equal(handoffs.length,pickupBefore+1,'Invalid location cannot block pickup');
  await page.locator('[name=mode][value=Delivery]').check();
  await page.evaluate(()=>window.__gpsMode='denied');await page.locator('#deliveryUseGPS').click();await page.waitForTimeout(40);
  assert((await page.locator('#deliveryLocationMessage').textContent()).includes('denied'));
  await manual(page,P.branchPins[primary.id]);assert.equal(await page.evaluate(()=>window.AfandiDeliveryUI.getQuote().status),'ready');
  await page.evaluate(()=>{window.__gpsMode='success';window.__gpsPoint.accuracy=5000});await page.locator('#deliveryUseGPS').click();await page.waitForTimeout(40);
  assert(await page.locator('#deliveryConfirmLocation').isDisabled());
  await page.evaluate(()=>window.__gpsPoint.accuracy=8);await page.locator('#deliveryUseGPS').click();await page.waitForTimeout(40);
  assert.equal(await page.evaluate(()=>window.AfandiDeliveryUI.getQuote().feeAED),null,'GPS is not delivery consent until confirmed');
  await page.locator('#deliveryConfirmLocation').click();
  assert.equal(await page.evaluate(()=>window.AfandiDeliveryUI.getPoint().lat),P.branchPins.marsa.lat);
  await page.evaluate(()=>window.__gpsMode='pending');await page.locator('#deliveryUseGPS').click();
  await manual(page,P.branchPins.majaz);await page.evaluate(()=>window.__gpsResolve());
  assert.equal(await page.evaluate(()=>window.AfandiDeliveryUI.getPoint().lat),P.branchPins.majaz.lat,'Late GPS callback cannot replace manually confirmed delivery');
  if(label==='chromium-mobile'){
   await page.locator('#deliveryOpenMap').click();
   await page.waitForFunction(()=>document.querySelector('#deliveryMap').classList.contains('leaflet-container'));
   await page.locator('#deliveryMapCenter').waitFor({state:'visible'});
   await page.waitForFunction(()=>!document.querySelector('#deliveryMapCenter').disabled,null,{timeout:20000});
   await page.locator('#deliveryMapCenter').click();await page.locator('#deliveryConfirmLocation').click();
   assert.equal(await page.evaluate(()=>window.AfandiDeliveryUI.getQuote().status),'ready');
  }
  await page.evaluate(()=>applyLanguage('ar',true));
  await page.locator('#deliveryLocationPanel').scrollIntoViewIfNeeded();
  await page.screenshot({path:`audit-results/${label}-location-ar.png`});
  assert.equal(await page.evaluate(()=>document.querySelector('#checkoutDialog').scrollWidth>document.querySelector('#checkoutDialog').clientWidth+1),false,'No checkout horizontal overflow');
  // Real browser geolocation API in Chromium, with synthetic coordinates and an
  // explicit granted permission. This tests the HTTPS Permissions-Policy too.
  if(label==='chromium-mobile'){
   await context.grantPermissions(['geolocation'],{origin:new URL(base).origin});
   await context.setGeolocation({latitude:P.branchPins.taawun.lat,longitude:P.branchPins.taawun.lng,accuracy:10});
   const actual=await context.newPage();actual.setDefaultTimeout(15000);
   await openCheckout(actual);await actual.locator('#deliveryUseGPS').click();
   await actual.waitForFunction(()=>!document.querySelector('#deliveryCandidate').hidden);
   await actual.locator('#deliveryConfirmLocation').click();
   assert.equal(await actual.locator('#branchSelect').inputValue(),'taawun');
   assert.equal(await actual.locator('#checkoutTotal').textContent(),'AED 40');
   await actual.close();
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  report.browsers.push({label,pass:true,tiers,whatsappBranchCases:branchList.length*3*2,realMessagesSent:0,checks:['No GPS on load','Opening-soon branches excluded from checkout','Nearest branch auto-select/recommendation only uses orderable branches','Fee recalculates for fulfilling branch','Distance tiers and cap','Upsell totals','Arabic/English','All five original phones preserved','WhatsApp includes point only for delivery','Pickup/dine-in zero fee','GPS denied fallback','Low GPS accuracy guarded','Explicit delivery-pin confirmation','Late GPS callback ignored','No overflow','No uncaught JS errors']});
 }finally{await browser.close()}
}
(async()=>{
 for(const [type,viewport,label] of [[chromium,{width:390,height:844},'chromium-mobile'],[chromium,{width:1440,height:900},'chromium-desktop'],[webkit,{width:390,height:844},'webkit-mobile']]){
  try{await run(type,viewport,label)}catch(e){report.failures.push({label,error:e.stack});console.error(e)}
 }
 fs.writeFileSync('audit-results/'+(base.startsWith('https:')?'delivery-live.json':'delivery-local.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));process.exit(report.failures.length?1:0);
})();
