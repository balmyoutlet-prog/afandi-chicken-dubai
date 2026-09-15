"""Scoped Afandi Dubai preparation. Never touches DNS, email or prices."""
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
report = {'mirrored': [], 'failed': [], 'optimized_local': [], 'previews': []}
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

if 'const afandiLanguageStorage=' not in app:
    app = app.replace('localStorage.getItem(', 'afandiLanguageStorage.getItem(').replace('localStorage.setItem(', 'afandiLanguageStorage.setItem(')
    app = "const afandiLanguageStorage={getItem(k){try{return localStorage.getItem(k)}catch(_){return null}},setItem(k,v){try{localStorage.setItem(k,v)}catch(_){}}};\n" + app
    app = app.replace("let lang=afandiLanguageStorage.getItem('affandi-lang-v2')||'ar'", "let lang=afandiLanguageStorage.getItem('affandi-lang-v2')==='en'?'en':'ar'")
if 'reliability.css?v=20260915' not in html:
    css_marker = '<link rel="stylesheet" href="./affandi.css?v=20260911e">'
    assert css_marker in html, 'Source changed: review stylesheet inclusion'
    html = html.replace(css_marker, css_marker + '\n<link rel="stylesheet" href="./reliability.css?v=20260915">')
if 'reliability.js?v=20260915' not in html:
    marker = '<script src="./app.js?v=20260911e"></script>'
    assert marker in html, 'Source changed: review script inclusion'
    html = html.replace(marker, '<script src="./app.js?v=20260915"></script>\n  <script src="./reliability.js?v=20260915"></script>')
html = html.replace('<img src=', '<img decoding="async" src=')
if '<noscript>' not in html:
    html = html.replace('<main>', '<noscript><p>Please enable JavaScript to view the menu and prepare your order. الرجاء تفعيل JavaScript لعرض المنيو وتجهيز الطلب.</p></noscript><main>', 1)

# Responsive previews use only the verified original meal image. Full-resolution
# originals remain the source of truth for product quick views. No crop or AI edits.
if 'const afandiThumbs=' not in app:
    sources = sorted(set(re.findall(r"image:'([^']+)'", app)))
    hero = '/assets/menu/fish-fillet-hero.webp'
    sources.append(hero)
    thumbs = {}
    out = Path('assets/previews')
    out.mkdir(exist_ok=True)
    for src in sorted(set(sources)):
        source = Path(src.lstrip('./'))
        if not source.is_file() or source.suffix.lower() not in ['.webp', '.png', '.jpeg', '.jpg']:
            continue
        original = Image.open(source)
        original.load()
        versions = []
        for width in (480, 960):
            image = original.copy()
            image.thumbnail((width, width), Image.Resampling.LANCZOS)
            target = out / f'{source.stem}-{width}.webp'
            image.save(target, 'WEBP', quality=88, method=6)
            versions.append({'url': '/' + str(target), 'width': image.width, 'bytes': target.stat().st_size})
        thumbs[src] = {'small': versions[0]['url'], 'set': ', '.join(f"{v['url']} {v['width']}w" for v in {v['width']:v for v in versions}.values())}
        report['previews'].append({'source': src, 'original_bytes': source.stat().st_size, 'versions': versions})
    helper = 'const afandiThumbs=' + json.dumps(thumbs, separators=(',', ':')) + ';\n'
    helper += 'function afandiPreviewImage(src){return afandiThumbs[src]?.small||src}\nfunction afandiPreviewSet(src){return afandiThumbs[src]?.set||""}\n'
    app = helper + app
    marker = '<img src="${p.image}" alt="${productName(p)}" loading="lazy">'
    replacement = '<img src="${afandiPreviewImage(p.image)}" srcset="${afandiPreviewSet(p.image)}" sizes="(max-width:620px) 45vw, (max-width:1100px) 30vw, 290px" alt="${productName(p)}" loading="lazy" decoding="async" fetchpriority="low">'
    assert marker in app, 'Review menu templates before changing image attributes'
    app = app.replace(marker, replacement)
    if hero in thumbs:
        sizes = '(max-width:620px) 48vw, 47vw'
        attributes = f'src="{thumbs[hero]["small"]}" srcset="{thumbs[hero]["set"]}" sizes="{sizes}"'
        html = html.replace(f'src="{hero}"', attributes)
        preload = f'<link rel="preload" as="image" href="{thumbs[hero]["small"]}" imagesrcset="{thumbs[hero]["set"]}" imagesizes="{sizes}" fetchpriority="high">'
        html = html.replace('<link rel="preconnect" href="https://fonts.googleapis.com">', preload + '\n<link rel="preconnect" href="https://fonts.googleapis.com">')
    html = html.replace('./app.js?v=20260915"', './app.js?v=20260915p2"')

app_path.write_text(app)
html_path.write_text(html)
Path('audit-results').mkdir(exist_ok=True)
Path('audit-results/assets.json').write_text(json.dumps(report, indent=2))
print(json.dumps({'mirrored': len(report['mirrored']), 'failed': report['failed'], 'optimized_local': len(report['optimized_local']), 'responsive_previews': len(report['previews'])}, indent=2))
