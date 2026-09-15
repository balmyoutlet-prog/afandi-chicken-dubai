from pathlib import Path
import re

html_path = Path('index.html')
html = html_path.read_text()
tag = '<script src="./cart-integrity.js?v=20260915r1"></script>'
if tag not in html:
    anchor = re.search(r'<script src="\./checkout-rails\.js\?[^\"]+"></script>', html)
    if not anchor:
        raise SystemExit('Checkout integration anchor changed; review before publishing')
    html = html[:anchor.end()] + '\n  ' + tag + html[anchor.end():]

app_path = Path('app.js')
app = app_path.read_text()
old = 'money=n=>`AED ${Number(n).toFixed(0)}`'
new = 'money=n=>{const v=Math.round((Number(n)+Number.EPSILON)*100)/100;return `AED ${v.toFixed(Number.isInteger(v)?0:2)}`}'
if old in app:
    if app.count(old) != 1:
        raise SystemExit('Ambiguous money formatter')
    app = app.replace(old,new)
elif new not in app:
    raise SystemExit('Money formatter changed; preserve and review it')
app_path.write_text(app)
html = re.sub(r'(src="\./app\.js\?)[^\"]+',r'\g<1>20260915-cart-integrity1',html)

reliability_path = Path('reliability.js')
reliability = reliability_path.read_text()
old_message = "${lines}${feeLine}\\n\\n${t('orderTotal')}"
new_message = "${lines}\\n\\n${t('subtotal')}: ${money(totals())}${feeLine}\\n\\n${t('orderTotal')}"
if old_message in reliability:
    if reliability.count(old_message) != 1:
        raise SystemExit('Ambiguous checkout receipt')
    reliability = reliability.replace(old_message,new_message)
elif new_message not in reliability:
    raise SystemExit('Checkout receipt changed; review before updating')
reliability_path.write_text(reliability)
html = re.sub(r'(src="\./reliability\.js\?)[^\"]+',r'\g<1>20260915-cart-integrity1',html)
html_path.write_text(html)
print('Integrated explicit add buttons, cent-accurate formatting and receipt subtotal; no tariff or catalog changes.')
