from pathlib import Path

path = Path('index.html')
html = path.read_text()
if './checkout-rails.css?v=20260915r1' not in html:
    assert '</head>' in html
    html = html.replace('</head>', '<link rel="stylesheet" href="./checkout-rails.css?v=20260915r1">\n</head>', 1)
if './checkout-rails.js?v=20260915r1' not in html:
    marker = '<script src="./reliability.js?v=20260915"></script>'
    assert marker in html, 'Review current checkout entrypoint before integration'
    html = html.replace(marker, marker + '\n  <script src="./checkout-rails.js?v=20260915r1"></script>', 1)
path.write_text(html)
print('Checkout rails included; existing script versions, prices and branch data preserved.')
