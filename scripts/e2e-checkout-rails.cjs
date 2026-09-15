const {chromium,webkit}=require('playwright');
const setDeliveryLocation=require('./delivery-test-helper.cjs');
const {default:AxeBuilder}=require('@axe-core/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.AUDIT_BASE||'http://127.0.0.1:8765';
fs.mkdirSync('audit-results',{recursive:true});
const report={base,createdAt:new Date().toISOString(),messagesSent:0,tests:[],accessibility:[],failures:[]};
async function auditAxe(page,label,state){
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 report.accessibility.push({label,state,passes:result.passes.length,violations:result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
}
async function run(type,viewport,label){
 const browser=await type.launch({headless:true});
 try{
  const context=await browser.newContext({viewport,deviceScaleFactor:1});
  let handoffs=[];
  await context.route('https://wa.me/**',r=>{handoffs.push(r.request().url());return r.fulfill({status:204,body:''})});
  await context.route('**/_vercel/**',r=>r.abort());
  const page=await context.newPage();page.setDefaultTimeout(18000);
  const errors=[],insecure=[],httpErrors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(base.startsWith('https:')&&r.url().startsWith('http:'))insecure.push(r.url())});
  page.on('response',r=>{if(r.status()>=400)httpErrors.push({url:r.url(),status:r.status()})});
  assert.equal((await page.goto(base,{waitUntil:'load',timeout:45000})).status(),200);
  if(label==='chrome-mobile')await auditAxe(page,label,'first-visit');
  if(await page.locator('#languageGate').evaluate(e=>e.open))await page.locator('[data-language=en]').click();
  await page.waitForFunction(()=>!!document.querySelector('#checkoutSuggest .merch-group'));
  if(label==='chrome-mobile')await auditAxe(page,label,'menu');
  const catalog=await page.evaluate(()=>products.map(p=>({id:p.id,price:p.price,cat:p.cat,image:p.image})));
  await page.evaluate(()=>{window.__merchEvents=[];addEventListener('afandi:marketing',e=>window.__merchEvents.push(e.detail))});
  await page.locator('#menuGrid [data-add=fish]').click();
  await page.locator('#checkoutBtn').click();
  await page.locator('#branchSelect').selectOption('dubai');
  await page.locator('#customerName').fill('TEST ONLY - DO NOT PREPARE');
  await page.locator('#customerPhone').fill('0500000000');
  await page.locator('[name=mode][value=Delivery]').check();
  await page.locator('#deliveryAddress').fill('TEST ONLY - no actual delivery');
  await setDeliveryLocation(page,'dubai');
  const groups=await page.locator('[data-merch-group]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.merchGroup,category:n.dataset.category,ids:Array.from(n.querySelectorAll('[data-merch-add]'),b=>b.dataset.merchAdd)})));
  for(const cat of new Set(catalog.map(p=>p.cat)))assert(groups.some(g=>g.category===cat),'Missing category '+cat);
  assert(groups.every(g=>g.ids.length>0&&g.ids.length<=8&&new Set(g.ids).size===g.ids.length));
  assert.equal(groups.find(g=>g.id==='drinks').ids.length,8);
  assert.equal(groups.find(g=>g.id==='extras').ids.length,8);
  assert.equal(groups.find(g=>g.id==='meals').ids.length,8);
  const allChoices=await page.locator('[data-merch-add]').count();
  const distinctChoices=new Set(groups.flatMap(g=>g.ids)).size;
  for(const language of ['en','ar']){
   await page.evaluate(l=>applyLanguage(l,true),language);
   assert.equal(await page.locator('#branchSelect').inputValue(),'dubai');
   const rail=page.locator('[data-merch-group=drinks] .merch-rail');
   const before=await rail.evaluate(e=>e.scrollLeft);
   await page.locator('[data-merch-group=drinks] [data-rail-direction="1"]').click();
   await page.waitForTimeout(500);
   const after=await rail.evaluate(e=>e.scrollLeft);
   assert(Math.abs(after-before)>25,'Arrow must scroll '+language);
   assert(language==='ar'?after<before:after>before,'RTL scrolling direction');
   await page.locator('[data-merch-group=drinks] [data-rail-direction="-1"]').click();
   await page.waitForTimeout(500);
   const reverted=await rail.evaluate(e=>e.scrollLeft);
   assert(Math.abs(reverted-before)<25,'Previous arrow returns '+language);
   assert.equal(handoffs.length,0,'Arrow cannot submit checkout');
  }
  // Click each visible offer: must add exactly one matching item, not submit,
  // preserve address/branch, and include delivery fee in the displayed total.
  const buttons=await page.locator('[data-merch-add]').all();
  for(const button of buttons){
   const id=await button.getAttribute('data-merch-add');
   const price=catalog.find(p=>p.id===id).price;
   assert((await button.locator('xpath=..').textContent()).includes('AED '+price));
   const before=await page.evaluate(id=>({qty:cart[id]||0,total:orderTotal()}),id);
   await button.click();
   const after=await page.evaluate(id=>({qty:cart[id]||0,total:orderTotal()}),id);
   assert.equal(after.qty,before.qty+1,'Exact add quantity '+id);
   assert.equal(after.total,before.total+price,'Exact added price '+id);
   assert.equal(await page.locator('#checkoutTotal').textContent(),'AED '+after.total);
   assert.equal(await page.locator('#branchSelect').inputValue(),'dubai');
   assert.equal(await page.locator('#deliveryAddress').inputValue(),'TEST ONLY - no actual delivery');
   assert.equal(handoffs.length,0,'Add-on must NEVER auto-submit '+id);
   assert(await page.locator('#checkoutDialog').evaluate(e=>e.open));
  }
  // A quick view opened from checkout adds back to the same checkout.
  await page.locator('[data-merch-view=water]').first().click();
  await page.locator('#qvPlus').click();
  const waterBefore=await page.evaluate(()=>cart.water||0);
  await page.locator('#qvAdd').click();
  assert.equal(await page.evaluate(()=>cart.water),waterBefore+2);
  assert.equal(await page.locator('#cartDrawer').getAttribute('aria-hidden'),'true');
  assert(await page.locator('#checkoutDialog').evaluate(e=>e.open));
  assert.equal(handoffs.length,0);
  // No recommendation selected by default; reset in this isolated test session.
  await page.evaluate(()=>{cart={fish:1};renderCart();renderCheckoutSuggest(true)});
  await page.locator('.merch-skip').click();
  assert.equal(await page.evaluate(()=>orderTotal()),40);
  assert.equal(handoffs.length,0,'Skip is not submit');
  await page.locator('#checkoutForm button[type=submit]').click();
  await page.waitForTimeout(150);
  assert.equal(handoffs.length,1);
  const url=new URL(handoffs[0]);
  assert.equal(url.pathname,'/971528666619');
  assert(url.searchParams.get('text').includes('AED 40'));
  await page.locator('#checkoutBackToMenu').click();
  assert.equal(await page.locator('#cartCount').textContent(),'1');
  await page.locator('#openCartBtn').click();await page.locator('#checkoutBtn').click();
  await page.evaluate(()=>applyLanguage('en',true));
  // Decode every image in the checkout, including horizontal off-screen images.
  const images=await page.locator('#checkoutSuggest img').evaluateAll(async nodes=>Promise.all(nodes.map(img=>new Promise(resolve=>{const copy=new Image();const timer=setTimeout(()=>resolve({url:img.src,ok:false}),20000);copy.onload=()=>{clearTimeout(timer);resolve({url:img.src,ok:copy.naturalWidth>0})};copy.onerror=()=>{clearTimeout(timer);resolve({url:img.src,ok:false})};copy.src=img.currentSrc||img.src}))));
  assert(images.every(i=>i.ok),'All checkout photos load');
  const events=await page.evaluate(()=>window.__merchEvents);
  assert(events.filter(e=>e.event==='checkout_recommendation_add').length>=allChoices);
  assert(!JSON.stringify(events).includes('0500000000'));
  if(label==='chrome-mobile')await auditAxe(page,label,'checkout');
  const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth>innerWidth,dialog:document.querySelector('#checkoutDialog').scrollWidth>document.querySelector('#checkoutDialog').clientWidth+1}));
  assert.equal(overflow.page,false);assert.equal(overflow.dialog,false);
  for(const language of ['en','ar']){
   await page.evaluate(l=>applyLanguage(l,true),language);
   await page.locator('[data-merch-group=drinks]').scrollIntoViewIfNeeded();
   await page.screenshot({path:`audit-results/${label}-checkout-${language}.png`});
  }
  await page.locator('#closeCheckoutBtn').click();
  await page.evaluate(()=>{scrollTo(0,0)});await page.waitForTimeout(300);
  await page.screenshot({path:`audit-results/${label}-homepage.png`,fullPage:true});
  assert.equal(errors.length,0,errors.join('; '));
  assert.equal(insecure.length,0);
  assert.equal(httpErrors.length,0,JSON.stringify(httpErrors));
  report.tests.push({label,pass:true,groups,allChoices,distinctChoices,photos:images.length,imagesFailed:images.filter(i=>!i.ok).length,uncaughtErrors:errors.length,mixedContent:insecure.length,interceptedHandoffs:handoffs.length,realMessagesSent:0,checked:'All categories, max 8 unique products, actual prices, exact adds, no accidental submits, bilingual arrows, totals with delivery, address and branch preserved, QV +2, skip without added items, correct WhatsApp payload, back to menu, photos, analytics hooks without PII'});
 }finally{await browser.close()}
}
(async()=>{
 for(const [type,viewport,label]of[[chromium,{width:390,height:844},'chrome-mobile'],[chromium,{width:1440,height:900},'chrome-desktop'],[webkit,{width:390,height:844},'webkit-mobile']]){
  try{await run(type,viewport,label)}catch(error){report.failures.push({label,error:error.stack});console.error(label,error)}
 }
 const filename=base.startsWith('https:')?'checkout-live.json':'checkout-local.json';
 fs.writeFileSync('audit-results/'+filename,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 process.exit(report.failures.length?1:0);
})();
