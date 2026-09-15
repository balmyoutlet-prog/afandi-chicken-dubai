"""Add the admin integration without replacing menu content or existing checkout features."""
from pathlib import Path
import json,re,subprocess
root=Path('.')
s=(root/'app.js').read_text()
assert 'const products=' in s and 'const $=' in s
code="const vm=require('node:vm'),fs=require('node:fs');const s=fs.readFileSync('app.js','utf8').split('const $=')[0];const c={};vm.runInNewContext(s+';globalThis.catalog=products',c);console.log(JSON.stringify(c.catalog));"
cat=json.loads(subprocess.check_output(['node','-e',code],text=True));(root/'backend').mkdir(exist_ok=True)
rows=[dict(id=p['id'],name_ar=p['ar'],name_en=p['en'],description_ar=p.get('arDesc',''),description_en=p.get('enDesc',''),category=p['cat'],price_cents=round(p['price']*100),image_url=p.get('image','').removeprefix('.'),tag=p.get('tag',''),featured=bool(p.get('featured')),active=True,available=p.get('available',True),sort_order=i,version=1,options=[]) for i,p in enumerate(cat)]
(root/'backend/catalog.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
if 'function escapeHTML' not in s:
 s=s.replace('const $=s=>',"function escapeHTML(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\\"':'&quot;',\"'\":'&#39;'}[c]));}\nconst $=s=>")
 for expr in ['productName(p)','productDesc(p)','productName(x)',"p.en.split(' ')[0]",'p.tag','p.image','x.image','afandiPreviewImage(p.image)','afandiPreviewSet(p.image)']:
  s=s.replace('${'+expr+'}', '${escapeHTML('+expr+')}')
s=s.replace('Number(n).toFixed(0)','Number(n).toFixed(2)')
s=s.replace("function deliveryFee(){return selectedMode()==='Delivery'?3:0}","function deliveryFee(){return selectedMode()==='Delivery'?(window.afandiDeliveryFee??3):0}")
s=s.replace('afandiThumbs[src]?.small||src',"afandiThumbs[src]?.small||afandiThumbs['.'+src]?.small||src")
s=s.replace('afandiThumbs[src]?.set||""',"afandiThumbs[src]?.set||afandiThumbs['.'+src]?.set||\"\"")
s=s.replace('cart[id]=(cart[id]||0)+d;', 'cart[id]=Math.min(99,(cart[id]||0)+d);')
s=s.replace('qvQty=Math.max(1,qvQty+d)','qvQty=Math.min(99,Math.max(1,qvQty+d))')
s=s.replace("root.querySelectorAll('[data-add]').forEach(b=>b.onclick=e=>{e.stopPropagation();addItem(b.dataset.add)})", "root.querySelectorAll('[data-add]').forEach(b=>{b.disabled=products.find(p=>p.id===b.dataset.add)?.available===false;b.onclick=e=>{e.stopPropagation();addItem(b.dataset.add)}})")
s=s.replace("$('#qvAdd').textContent=t('addToCart');", "$('#qvAdd').textContent=t('addToCart');$('#qvAdd').disabled=p.available===false;")
(root/'app.js').write_text(s)
h=(root/'index.html').read_text()
if 'afandi-client.css' not in h:h=h.replace('</head>','<link rel="stylesheet" href="/afandi-client.css"></head>')
h=re.sub(r'<script>window\.va=.*?</script>\s*<script defer src="/_vercel/insights/script\.js"></script>\s*<script defer src="/_vercel/speed-insights/script\.js"></script>','',h,flags=re.S)
if 'afandi-client.js' not in h:h=h.replace('</body>','<script src="/afandi-client.js?v=1" defer></script></body>')
h=re.sub(r'\./app\.js\?v=[^"\s]+','/app.js?v=20260915-admin1',h)
if 'info@alafandichicken.com' not in h:h=h.replace('</main>','</main><footer class="afandi-footer" id="afandiPublicFooter"><a href="mailto:info@alafandichicken.com">info@alafandichicken.com</a><a href="/privacy.html">الخصوصية / Privacy</a></footer>')
(root/'index.html').write_text(h)
c=json.loads((root/'vercel.json').read_text());c.update({'buildCommand':'node build.mjs','outputDirectory':'dist','framework':None,'installCommand':'','rewrites':[{'source':'/api/:path*','destination':'https://ncadxnjjwuklckxrkcjf.supabase.co/functions/v1/afandi-dubai-api/:path*'},{'source':'/admin','destination':'/admin/index.html'},{'source':'/admin/','destination':'/admin/index.html'}]})
admin_headers=[{'key':'Cache-Control','value':'no-store'},{'key':'X-Robots-Tag','value':'noindex, nofollow'},{'key':'Referrer-Policy','value':'no-referrer'},{'key':'X-Frame-Options','value':'DENY'},{'key':'Content-Security-Policy','value':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data: blob:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"}]
c['headers'] += [{'source':'/api/:path*','headers':[{'key':'Cache-Control','value':'no-store'},{'key':'x-vercel-enable-rewrite-caching','value':'0'}]},{'source':'/admin/:path*','headers':admin_headers},{'source':'/admin','headers':admin_headers}]
(root/'vercel.json').write_text(json.dumps(c,indent=2)+'\n')
