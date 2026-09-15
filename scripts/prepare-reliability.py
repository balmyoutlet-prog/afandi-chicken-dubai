"""One-time, scoped Afandi Dubai preparation. Never touches DNS, email or prices."""
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image
import concurrent.futures
import hashlib
import io
import json
import re
import time

app_path, html_path = Path('app.js'), Path('index.html')
app, html = app_path.read_text(), html_path.read_text()
report = {'mirrored': [], 'failed': [], 'optimized_local': []}
asset_dir = Path('assets/menu')
asset_dir.mkdir(parents=True, exist_ok=True)
urls = sorted(set(re.findall(r'https://chicken-dubai-clone\.lovable\.app/assets/[A-Za-z0-9_.-]+', app + html)))

def fetch_image(url):
    last = None
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'Afandi-Dubai-Authorized-Asset-Migration/1.0'}), timeout=25) as response:
                if response.status != 200 or not response.headers.get('Content-Type', '').startswith('image/'):
                    raise ValueError('Not an image response')
                data = response.read(12_000_001)
            if len(data) > 12_000_000:
                raise ValueError('Image exceeds safe migration size')
            image = Image.open(io.BytesIO(data))
            image.load()
            if image.width < 8 or image.height < 8:
                raise ValueError('Unexpected image dimensions')
            original_size = len(data)
            target = asset_dir / Path(url).name
            if image.width > 1400 or image.height > 1400 or (len(data) > 150_000 and image.format != 'WEBP'):
                image.thumbnail((1400, 1400), Image.Resampling.LANCZOS)
                target = target.with_suffix('.webp')
                image.save(target, 'WEBP', quality=88, method=6)
            else:
                target.write_bytes(data)
            return {'source': url, 'target': '/' + str(target), 'original_bytes': original_size, 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
        except Exception as exc:
            last = str(exc)
            time.sleep(attempt + 1)
    return {'source': url, 'error': last}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for result in pool.map(fetch_image, urls):
        if 'error' in result:
            report['failed'].append(result)
        else:
            report['mirrored'].append(result)
            app = app.replace(result['source'], result['target'])
            html = html.replace(result['source'], result['target'])
            if result['source'].endswith('/affandi-logo.jpeg'):
                app = app.replace("'/assets/affandi-logo.jpeg'", repr(result['target']))

# Optimize large original branch photos and garlic image without cropping or substituting them.
for source in list(Path('assets').glob('*.jpeg')) + [Path('assets/garlic-cream.png')]:
    if not source.exists() or source.stat().st_size < 150_000:
        continue
    image = Image.open(source)
    image.load()
    image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    target = source.with_suffix('.webp')
    image.save(target, 'WEBP', quality=86, method=6)
    if target.stat().st_size < source.stat().st_size:
        app = app.replace(str(source), str(target))
        html = html.replace(str(source), str(target))
        report['optimized_local'].append({'source': str(source), 'target': str(target), 'before': source.stat().st_size, 'after': target.stat().st_size})

# Preserve function and menu data; only make existing language storage failure-tolerant.
if 'const afandiLanguageStorage=' not in app:
    app = app.replace('localStorage.getItem(', 'afandiLanguageStorage.getItem(').replace('localStorage.setItem(', 'afandiLanguageStorage.setItem(')
    app = "const afandiLanguageStorage={getItem(k){try{return localStorage.getItem(k)}catch(_){return null}},setItem(k,v){try{localStorage.setItem(k,v)}catch(_){}}};\n" + app
    app = app.replace("let lang=afandiLanguageStorage.getItem('affandi-lang-v2')||'ar'", "let lang=afandiLanguageStorage.getItem('affandi-lang-v2')==='en'?'en':'ar'")
if 'reliability.js?v=20260915' not in html:
    marker = '<script src="./app.js?v=20260911e"></script>'
    assert marker in html, 'Source changed: review before altering script inclusion'
    html = html.replace(marker, '<script src="./app.js?v=20260915"></script>\n  <script src="./reliability.js?v=20260915"></script>')
html = html.replace('<img src=', '<img decoding="async" src=')
if '<noscript>' not in html:
    html = html.replace('<main>', '<noscript><p>Please enable JavaScript to view the menu and prepare your order. الرجاء تفعيل JavaScript لعرض المنيو وتجهيز الطلب.</p></noscript><main>', 1)
app_path.write_text(app)
html_path.write_text(html)
Path('audit-results').mkdir(exist_ok=True)
Path('audit-results/assets.json').write_text(json.dumps(report, indent=2))
print(json.dumps({'mirrored': len(report['mirrored']), 'failed': report['failed'], 'optimized_local': len(report['optimized_local'])}, indent=2))
