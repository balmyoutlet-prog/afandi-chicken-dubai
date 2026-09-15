import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createInsightsHandler} from '../backend/insights.mjs';
// In-memory transport only. Never connects to Supabase or a customer account.
let mode='none',calls=[],remembered=new Set();
const products=[{id:'water',name_ar:'مياه',name_en:'Water',category:'drinks',price_cents:300,image_url:'/assets/menu/water.webp'},{id:'spicy-broasted',name_ar:'بروستد حار',name_en:'Spicy Broasted',category:'meals',price_cents:3200,image_url:'/assets/menu/spicy-broasted.webp'}];
const fetcher=async(url,o={})=>{const u=new URL(url),name=u.pathname.split('/rest/v1/')[1],body=o.body?JSON.parse(o.body):null;calls.push({name,method:o.method||'GET',body});let data;
if(name==='afandi_dubai_sessions')data=mode==='none'?[]:[{admin_id:'00000000-0000-4000-8000-000000000001',expires_at:new Date(Date.now()+600000).toISOString(),idle_expires_at:new Date(mode==='expired'?0:Date.now()+300000).toISOString()}];
else if(name==='afandi_dubai_admins')data=[{id:'00000000-0000-4000-8000-000000000001',must_change_password:mode==='change'}];
else if(name==='rpc/afandi_dubai_rate_limit')data=true;
else if(name==='afandi_dubai_products')data=u.searchParams.has('id')?products.filter(p=>'eq.'+p.id===u.searchParams.get('id')):products;
else if(name==='rpc/afandi_dubai_customer_list')data={customers:[{name:'LOCAL FIXTURE ONLY',phone:'999999999999999',order_count:20,net_sales_cents:115200}],has_more:false,next_offset:50,total:1};
else if(name==='rpc/afandi_dubai_customer_profile')data=body.p_phone==='999999999999999'?{name:'LOCAL FIXTURE ONLY',phone:body.p_phone,lifetime:{orders:20,net_sales_cents:115200}}:null;
else if(name==='rpc/afandi_dubai_funnel_report')data={coverage_start:null,add_to_cart_visitors:0,checkout_visitors:0,top_products:[]};
else if(name==='afandi_dubai_browser_preferences'){if(body.remember)remembered.add(body.visitor_hash);else remembered.delete(body.visitor_hash);data=null;}
else if(name==='rpc/afandi_dubai_reorder_products')data=remembered.has(body.p_visitor)?[products[1]]:[];
else if(name==='afandi_dubai_events'||name==='afandi_dubai_settings')data=null;
else throw Error('Unexpected fixture database path: '+name);
return new Response(data===null?'':JSON.stringify(data),{status:200});};
const handler=createInsightsHandler({base:'https://fixture.invalid',secret:'LOCAL-FIXTURE-NOT-A-REAL-SECRET-00000000',fetcher});
const checks=[];
async function req(path,data={},cookie='',extra={}){return handler(new Request('https://fixture.invalid/afandi-dubai-insights/'+path,{method:'POST',headers:{Origin:'https://alafandichicken.com','Content-Type':'application/json','X-Afandi-Request':'1','User-Agent':'UnitTestClient/1',...(cookie?{Cookie:cookie}:{}),...extra},body:JSON.stringify(data)}));}
const session='__Host-afd_admin='+'a'.repeat(64);
for(const path of ['admin/customers','admin/customer','admin/funnel'])assert.equal((await req(path)).status,401);assert.equal(calls.length,0);checks.push('Unauthenticated customer endpoints denied before DB access');
assert.equal((await req('admin/customers',{},session)).status,401);mode='expired';assert.equal((await req('admin/customers',{},session)).status,401);mode='change';assert.equal((await req('admin/customers',{},session)).status,403);mode='valid';checks.push('Forged/expired session and mandatory-password-change denial');
assert.equal((await req('admin/customers',{},session,{Origin:'https://other.invalid'})).status,403);assert.equal((await req('admin/customers',{},session,{'X-Afandi-Request':''})).status,400);checks.push('Cross-origin writes and missing request header denied');
const out=await(await req('admin/customers',{search:'LOCAL',sort:'orders',offset:0},session)).json();assert.equal(out.customers[0].order_count,20);assert.ok(!JSON.stringify(out).includes('SECRET'));checks.push('Authorized fixture customer response without server-secret disclosure');
for(const dates of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-10-01',to:'2026-09-01'}])assert.equal((await req('admin/funnel',dates,session)).status,400);assert.equal((await req('admin/funnel',{from:'2026-09-01',to:'2026-09-30'},session)).status,200);checks.push('Dubai calendar date validation');
let before=calls.length;assert.deepEqual(await(await req('event',{analytics_consent:false})).json(),{recorded:false});assert.equal(calls.length,before);assert.equal((await req('event',{analytics_consent:true,event_id:crypto.randomUUID(),event_kind:'add_to_cart',product_id:'water',quantity:100})).status,400);checks.push('No measurement without consent; quantity limits');
const preference=await req('preferences',{remember:true}),cookies=preference.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');assert.ok(cookies.includes('__Host-afd_visitor'));assert.ok(preference.headers.get('set-cookie').includes('HttpOnly'));assert.ok(preference.headers.get('set-cookie').includes('Secure'));assert.ok(preference.headers.get('set-cookie').includes('SameSite=Strict'));
const rec=await(await req('recommendations',{cart:[]},cookies)).json();assert.equal(rec.repeat[0].id,'spicy-broasted');assert.ok(!JSON.stringify(rec).includes('phone'));assert.equal((await(await req('recommendations',{phone:'999999999999999',cart:[]})).json()).repeat.length,0);await req('preferences',{remember:false},cookies);assert.equal((await(await req('recommendations',{cart:[]},cookies)).json()).repeat.length,0);checks.push('Signed HttpOnly same-browser history, no phone lookup, opt-out and cross-browser isolation');
const e=await req('event',{analytics_consent:true,event_id:crypto.randomUUID(),event_kind:'view_item',product_id:'water'},cookies);assert.equal(e.status,200);assert.equal(e.headers.get('cache-control'),'no-store');checks.push('Consented event payload and no-store response');
fs.mkdirSync('audit-results',{recursive:true});fs.writeFileSync('audit-results/insights-unit.json',JSON.stringify({passed:true,scope:'Local in-memory fixtures only; no real credentials or production requests.',checks},null,2));console.log(checks.join('\n'));
