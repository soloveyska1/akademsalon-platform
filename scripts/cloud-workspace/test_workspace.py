import hashlib
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer
import prepare
from serve import PreviewHandler


class SnapshotTests(unittest.TestCase):
    def test_repeated_setup_preserves_working_edits_and_repairs_reference(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / 'index.html').write_text('<h1>Reference</h1>')
            manifest = root / 'manifest.json'
            manifest.write_text(json.dumps({'files': {'index.html': prepare.digest(root / 'index.html')}}))
            cache = root / 'cache'
            with patch.object(prepare, 'ROOT', root), patch.object(prepare, 'MANIFEST', manifest):
                prepare.prepare(cache)
                (cache / 'public/index.html').write_text('Work in progress')
                (cache / 'baseline/index.html').write_text('Damaged reference')
                prepare.prepare(cache)
            self.assertEqual((cache / 'public/index.html').read_text(), 'Work in progress')
            self.assertEqual((cache / 'baseline/index.html').read_text(), '<h1>Reference</h1>')

    def test_untrusted_manifest_paths_cannot_escape_or_read_private_files(self):
        for name in ('../secret', '/secret', '.git/config', 'a/../../secret', 'a\\secret', 'api/orders'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                prepare.safe_path(name)

    def test_changed_download_is_rejected_before_preview_is_created(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return b'changed-live-content'
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            manifest = root / 'manifest.json'
            manifest.write_text(json.dumps({'files': {'index.html': hashlib.sha256(b'pinned').hexdigest()}}))
            with patch.object(prepare, 'ROOT', root), patch.object(prepare, 'MANIFEST', manifest), \
                 patch('urllib.request.OpenerDirector.open', return_value=Response()):
                with self.assertRaisesRegex(ValueError, 'baseline changed'):
                    prepare.prepare(root / 'cache')
            self.assertFalse((root / 'cache/baseline.json').exists())
            self.assertFalse((root / 'cache/public').exists())


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.public = root / 'public'
        self.public.mkdir()
        (self.public / 'index.html').write_text('<h1>Preview</h1>')
        (self.public / 'empty').mkdir()
        (root / 'secret.txt').write_text('PRIVATE_SENTINEL')
        (self.public / 'escape.txt').symlink_to(root / 'secret.txt')
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(PreviewHandler, directory=str(self.public)))
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.origin = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path, method='GET'):
        req = urllib.request.Request(self.origin + path, method=method)
        try:
            return urllib.request.urlopen(req)
        except urllib.error.HTTPError as error:
            return error

    def test_preview_and_head_are_available_with_network_isolation(self):
        for method in ('GET', 'HEAD'):
            with self.request('/', method) as response:
                self.assertEqual(response.status, 200)
                self.assertIn("connect-src 'self'", response.headers['Content-Security-Policy'])
                self.assertIn("form-action 'none'", response.headers['Content-Security-Policy'])
                self.assertEqual(response.headers['X-Robots-Tag'], 'noindex, nofollow')

    def test_api_never_manufactures_success(self):
        for method in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'):
            with self.subTest(method=method), self.request('/api/orders', method) as response:
                self.assertEqual(response.status, 503)
                if method != 'HEAD':
                    self.assertFalse(json.loads(response.read())['ok'])

    def test_private_paths_directory_listing_and_symlink_escape_are_blocked(self):
        for path in ('/.git/config', '/../secret.txt', '/%2e%2e/secret.txt', '/escape.txt', '/empty/'):
            with self.subTest(path=path), self.request(path) as response:
                self.assertEqual(response.status, 404)
                self.assertNotIn(b'PRIVATE_SENTINEL', response.read())

    def test_known_server_redirect_reaches_home(self):
        with self.request('/expertise.html') as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.url, self.origin + '/')


if __name__ == '__main__':
    unittest.main()
