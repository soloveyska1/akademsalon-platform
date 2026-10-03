"""Prepare a hash-checked public reference without SSH or machine-local files."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import sys
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'docs/brain/evidence/salon-intake-studio-20260927/release-build-manifest.json'
RELEASE = 'release228-intake-da171f06'
ORIGIN = 'https://akademsalon.ru'
# This is a server redirect, not a downloadable file (see release222 evidence).
REDIRECTS = {'expertise.html': '/'}
FETCH_PATHS = {'index.html': ''}
CACHE = ROOT / 'tmp/cloud-workspace'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_path(name):
    path = PurePosixPath(name)
    if (not name or path.is_absolute() or '\\' in name or
            any(part in ('', '.', '..') or part.startswith('.') for part in name.split('/')) or
            path.parts[0] == 'api'):
        raise ValueError(f'Unsafe public path: {name}')
    return path


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Unexpected redirect while fetching pinned public files')


def prepare(cache=CACHE):
    files = json.loads(MANIFEST.read_text())['files']
    files = {name: value for name, value in files.items() if name not in REDIRECTS}
    for name, expected in files.items():
        safe_path(name)
        if len(expected) != 64 or any(c not in '0123456789abcdef' for c in expected):
            raise ValueError(f'Invalid checksum: {name}')
    baseline = cache / 'baseline'
    baseline.mkdir(parents=True, exist_ok=True)

    def fetch(item):
        name, expected = item
        target = baseline / name
        if target.is_symlink() or any(p.is_symlink() for p in target.parents if p != cache.parent):
            raise ValueError(f'Symlink in snapshot destination: {name}')
        if target.is_file() and digest(target) == expected:
            return 'cached'
        source = ROOT / name
        if source.is_file() and not source.is_symlink() and digest(source) == expected:
            data = source.read_bytes()
            method = 'repository'
        else:
            request = urllib.request.Request(
                ORIGIN + '/' + urllib.parse.quote(FETCH_PATHS.get(name, name), safe='/'),
                headers={'User-Agent': 'Akademsalon-Workspace/1.0', 'Accept-Encoding': 'identity'})
            try:
                with urllib.request.build_opener(NoRedirect).open(request, timeout=45) as response:
                    if response.status != 200:
                        raise ValueError('Unexpected HTTP status')
                    data = response.read()
            except (OSError, ValueError) as error:
                raise ValueError(f'{name}: {error}') from error
            method = 'downloaded'
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f'Public baseline changed: {name}; update the pinned release deliberately')
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.download')
        temporary.write_bytes(data)
        temporary.replace(target)
        return method

    with ThreadPoolExecutor(max_workers=4) as pool:
        methods = list(pool.map(fetch, files.items()))
    actual = {str(p.relative_to(baseline)): digest(p) for p in baseline.rglob('*') if p.is_file()}
    if actual != files:
        raise ValueError('Snapshot contains unexpected or changed files; keep edits in public/, not baseline/')
    public = cache / 'public'
    if not public.exists():
        shutil.copytree(baseline, public)
    report = {'release': RELEASE, 'files': len(files), 'redirects': REDIRECTS,
              'manifest_sha256': digest(MANIFEST),
              'sources': {method: methods.count(method) for method in sorted(set(methods))},
              'working_copy_preserved': True}
    (cache / 'baseline.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=CACHE)
    args = parser.parse_args()
    try:
        prepare(args.cache.resolve())
    except Exception as error:
        print(f'Preview preparation failed: {error}', file=sys.stderr)
        sys.exit(1)
