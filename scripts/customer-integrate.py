"""Idempotent extension. Does not create accounts or publish production."""
from pathlib import Path
import json
p=Path('index.html');s=p.read_text()
if '/customer-behavior.js' not in s:s=s.replace('</body>','<script src="/customer-behavior.js?v=1" defer></script></body>')
p.write_text(s)
p=Path('admin/index.html');s=p.read_text()
if '/admin/customers.js' not in s:s=s.replace('</head>','<script src="/admin/customers.js?v=1" defer></script></head>')
p.write_text(s)
p=Path('afandi-client.js');s=p.read_text()
if 'window.afandiVisitReady=request' not in s:
 s=s.replace("try{await request('visit',", "try{window.afandiVisitReady=request('visit',")
 s=s.replace('analytics_consent:true});}catch{sent=false;', 'analytics_consent:true});await window.afandiVisitReady;}catch{sent=false;')
if 'await window.afandiRecordOrderPreferences' not in s:s=s.replace('result.replaceChildren(document.createTextNode(', 'if(window.afandiRecordOrderPreferences)await window.afandiRecordOrderPreferences(d.reference);result.replaceChildren(document.createTextNode(')
p.write_text(s)
p=Path('customer-behavior.js');s=p.read_text()
s=s.replace("$('#checkoutForm button[type=\"submit\"]').before(choices);", "($('#checkoutCompletion')||$('#checkoutForm button[type=\"submit\"]')).before(choices);")
p.write_text(s)
p=Path('build.mjs');s=p.read_text()
if "'customer-behavior.js'" not in s:s=s.replace("'afandi-client.js',", "'afandi-client.js','customer-behavior.js',")
p.write_text(s)
p=Path('vercel.json');v=json.loads(p.read_text());route={'source':'/api/insights/:path*','destination':'https://ncadxnjjwuklckxrkcjf.supabase.co/functions/v1/afandi-dubai-insights/:path*'}
v['rewrites']=[route]+[r for r in v.get('rewrites',[]) if r.get('source')!=route['source']]
seen=set();headers=[]
for row in v.get('headers',[]):
 key=json.dumps(row,sort_keys=True)
 if key not in seen:headers.append(row);seen.add(key)
v['headers']=headers;p.write_text(json.dumps(v,indent=2)+'\n')
