"""Extend isolated fixture suite; never touches production data."""
from pathlib import Path
s=Path('tests/regression.cjs').read_text()
s=s.replace("if(/insights|google-analytics/.test(u.hostname+u.pathname))", "if(u.pathname.startsWith('/_vercel/')||/google-analytics/.test(u.hostname))")
s=s.replace("return route.continue();", "if(u.hostname!='127.0.0.1')return route.fulfill({status:204,body:''});return route.continue();")
needle=" if(u.pathname==='/api/visit')"
stub="""
 if(u.pathname==='/api/insights/recommendations')return json(res,{repeat:[{id:'spicy-broasted',name_ar:'بروستد حار',name_en:'Spicy Broasted',price_cents:3200}],try:[{id:'water',name_ar:'مياه',name_en:'Water',price_cents:300}],personalized:true});
 if(u.pathname==='/api/insights/preferences'||u.pathname==='/api/insights/order-consent')return json(res,{recorded:true,remember:d.remember});
 if(u.pathname==='/api/insights/event')return json(res,{recorded:true});
"""
assert needle in s
s=s.replace(needle,stub+needle)
needle=" if(u.pathname==='/api/admin/report')"
stub="""
 if(u.pathname==='/api/insights/admin/funnel')return json(res,{coverage_start:null,view_item_visitors:0,add_to_cart_visitors:0,checkout_visitors:0,top_products:[]});
 if(u.pathname==='/api/insights/admin/customers')return json(res,{coverage_start:'2026-09-01T00:00:00Z',customers:[{phone:'999999999999999',name:'LOCAL FIXTURE <img src=x onerror=window.injected=1>',order_count:20,net_sales_cents:115200,last_order_at:'2026-09-10T12:00:00Z'}],has_more:false,next_offset:50,total:1});
 if(u.pathname==='/api/insights/admin/customer'){assert.equal(d.phone,'999999999999999');return json(res,{name:'LOCAL FIXTURE <img src=x onerror=window.injected=1>',phone:d.phone,first_order_at:'2026-09-01T12:00:00Z',last_order_at:'2026-09-10T12:00:00Z',last_consented_site_visit:null,lifetime:{orders:20,completed_orders:18,net_sales_cents:115200},period:{orders:20,submitted_value_cents:128000,net_sales_cents:115200},favorites:[{id:'spicy-broasted',name_ar:'صنف اختبار فقط',orders_count:18,units:36,line_total_cents:115200}],orders:[],orders_truncated:false,marketing_opt_in:false});}
"""
assert needle in s
s=s.replace(needle,stub+needle)
needle="checks.push('Add more items preserves basket and delivery fee');"
extra="""
assert.equal(await p.locator('#marketingCustomer').isChecked(),false);await p.locator('#returningSuggestions button').first().waitFor();assert.equal(await p.locator('#cartCount').textContent(),'3');checks.push('Suggestions do not add items automatically; marketing consent unchecked');
"""
s=s.replace(needle,needle+extra)
needle="checks.push('Day and month filtering requests exact calendar ranges');"
extra="""
await p.locator('[data-tab=dashboard]').click();await p.waitForTimeout(100);assert.ok((await p.locator('#funnelMetrics').innerText()).includes('غير متوفّر'));checks.push('Unavailable funnel measurement remains N/A');
await p.locator('[data-tab=customers]').click();await p.locator('#customerList button').first().waitFor();await p.locator('#customerSearch').fill('LOCAL FIXTURE');await p.locator('#customerSort').selectOption('orders');await p.locator('#customerSearchForm button').click();await p.locator('#customerList button').first().click();await p.locator('#customerProfile h2').waitFor();assert.ok((await p.locator('#customerProfile').innerText()).includes('20'));assert.ok((await p.locator('#customerProfile').innerText()).includes('36'));assert.equal(await p.locator('#customerProfile a[href*=\"wa.me\"]').count(),0);assert.equal(await p.evaluate(()=>window.injected),undefined);assert.equal(await p.locator('#customerProfile h2 img').count(),0);checks.push('20-order isolated customer fixture, favorites, search/sort, escaped names and no unconsented marketing');await p.screenshot({path:`audit-results/${name}-customer-profile-FIXTURE.png`,fullPage:true});
"""
s=s.replace(needle,needle+extra)
needle="checks.push('No browser JavaScript errors');"
extra="""
await p.locator('#logout').click();await p.locator('#loginPanel').waitFor();assert.equal(await p.locator('#customerProfile').innerText(),'');assert.equal(await p.locator('#customerList').innerText(),'');assert.equal(requests.filter(r=>r.path==='/api/insights/event').length,0);checks.push('Logout purges customer DOM; automated test visits never counted');
"""
s=s.replace(needle,needle+extra)
s=s.replace("for(const url of ['https://alafandichicken.com/','http://alafandichicken.com/','https://www.alafandichicken.com/'])", "for(const url of [])")
Path('tests/customer-regression.generated.cjs').write_text(s)
