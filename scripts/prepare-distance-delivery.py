"""Scoped, idempotent integration; feature branch only. No DNS/email/billing APIs."""
from pathlib import Path
import re,json,shutil

def patch(path, old, new):
    p=Path(path);text=p.read_text()
    if new in text:return
    assert old in text, f'Source changed, review {path}: {old[:90]}'
    p.write_text(text.replace(old,new))

patch('app.js', "function deliveryFee(){return selectedMode()==='Delivery'?3:0}", "function deliveryFee(){return selectedMode()==='Delivery'?(window.AfandiDeliveryUI?.getQuote().feeAED??null):0}")
patch('app.js','<strong>AED 3</strong>','<strong>—</strong>')
patch('app.js',"${t('deliveryFee')}: ${money(3)}","${t('deliveryFee')}: ${money(deliveryFee())}")
patch('reliability.js','    const lines = Object.entries(cart).map(([id, qty]) => {', "    if (mode === 'Delivery' && !window.AfandiDeliveryUI?.validateForSubmit()) { showToast(copy('حدّد وأكّد موقع التوصيل أولاً', 'Choose and confirm your delivery location first')); return; }\n    const lines = Object.entries(cart).map(([id, qty]) => {")
patch('reliability.js','${lines}${feeLine}\\n\\n',"${lines}${feeLine}${mode === 'Delivery' ? window.AfandiDeliveryUI.whatsappLines() : ''}\\n\\n")
patch('checkout-rails.js',"money(orderTotal());\n    };", "(window.AfandiDeliveryUI?.totalLabel() || money(orderTotal()));\n    };")
patch('delivery-location.js',"    invalidate();candidate={lat:point.lat", "    el('deliveryCoordinates').setCustomValidity('');\n    invalidate();candidate={lat:point.lat")

p=Path('index.html');html=p.read_text()
if 'delivery-location.js?v=20260915d1' not in html:
    html=html.replace('</head>', '<link rel="stylesheet" href="./delivery-location.css?v=20260915d1">\n</head>',1)
    marker='<script src="./checkout-rails.js?v=20260915r1"></script>'
    assert marker in html,'Review script insertion point'
    html=html.replace(marker,marker+'\n  <script src="./delivery-pricing.js?v=20260915d1"></script>\n  <script src="./delivery-location.js?v=20260915d1"></script>')
    html=re.sub(r'\./app\.js\?v=[^"\s]+','./app.js?v=20260915delivery1',html)
    html=html.replace('./reliability.js?v=20260915"','./reliability.js?v=20260915d1"')
    html=html.replace('./checkout-rails.js?v=20260915r1"','./checkout-rails.js?v=20260915r2"')
    p.write_text(html)

p=Path('vercel.json');config=json.loads(p.read_text())
for rule in config.get('headers',[]):
    for h in rule.get('headers',[]):
        if h['key'].lower()=='permissions-policy':
            h['value']=h['value'].replace('geolocation=()','geolocation=(self)')
p.write_text(json.dumps(config,indent=2)+'\n')

# Vendor the pinned map library locally. It is loaded only on an explicit map click.
folder=Path('assets/vendor/leaflet');folder.mkdir(parents=True,exist_ok=True)
for name in ['leaflet.js','leaflet.css']:
    shutil.copyfile(Path('node_modules/leaflet/dist')/name,folder/name)
shutil.copyfile('node_modules/leaflet/LICENSE',folder/'LICENSE')
shutil.copytree('node_modules/leaflet/dist/images',folder/'images',dirs_exist_ok=True)

# Existing end-to-end tests must use an actual confirmed location rather than the
# retired AED3 fixture. Keep the same interactions and all existing assertions.
patch('scripts/e2e-reliability.cjs', "const { chromium, webkit } = require('playwright');", "const { chromium, webkit } = require('playwright');\nconst setDeliveryLocation = require('./delivery-test-helper.cjs');")
patch('scripts/e2e-reliability.cjs', "  await page.locator('#deliveryAddress').fill('TEST ONLY - synthetic address, no delivery');", "  await page.locator('#deliveryAddress').fill('TEST ONLY - synthetic address, no delivery');\n  await setDeliveryLocation(page, 'dubai');")
p=Path('scripts/e2e-reliability.cjs');s=p.read_text();s=s.replace('fishPrice + 3','fishPrice + 5').replace('subtotal + 3','subtotal + 5').replace("mode === 'Delivery' ? 3 : 0", "mode === 'Delivery' ? 5 : 0")
marker='        await page.locator(`[name="mode"][value="${mode}"]`).check();'
if 'await setDeliveryLocation(page, branch.id)' not in s:
    assert marker in s
    s=s.replace(marker,marker+"\n        if (mode === 'Delivery') await setDeliveryLocation(page, branch.id);")
p.write_text(s)
patch('scripts/e2e-checkout-rails.cjs', "const {chromium,webkit}=require('playwright');", "const {chromium,webkit}=require('playwright');\nconst setDeliveryLocation=require('./delivery-test-helper.cjs');")
patch('scripts/e2e-checkout-rails.cjs', "  await page.locator('#deliveryAddress').fill('TEST ONLY - no actual delivery');", "  await page.locator('#deliveryAddress').fill('TEST ONLY - no actual delivery');\n  await setDeliveryLocation(page,'dubai');")
p=Path('scripts/e2e-checkout-rails.cjs');s=p.read_text().replace('()=>orderTotal()),38','()=>orderTotal()),40').replace("includes('AED 38')","includes('AED 40')");p.write_text(s)
p=Path('.github/workflows/checkout-merchandising.yml');s=p.read_text().replace('checkout-rails.js?v=20260915r1','checkout-rails.js?v=20260915r2');p.write_text(s)
print('Integrated confirmed five-pin delivery, location consent, fee/WhatsApp guard, no-retired-fee fixtures, and local optional map library.')
