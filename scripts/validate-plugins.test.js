const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const validator = path.join(__dirname, 'validate-plugins.sh');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-marketplace-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(validator, path.join(root, 'scripts/validate-plugins.sh'));
  fs.mkdirSync(path.join(root, '.github/plugin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'plugins/sample'), { recursive: true });
  fs.writeFileSync(path.join(root, 'plugins/sample/plugin.json'),
    JSON.stringify({ name: 'sample', version: '0.1.0' }));
  const marketplace = {
    name: 'sample-marketplace',
    owner: { name: 'sample-owner' },
    metadata: { description: 'Sample marketplace', version: '0.1.0' },
    plugins: [{ name: 'sample', description: 'Sample plugin', version: '0.1.0', source: './plugins/sample' }],
  };
  return {
    root,
    marketplace,
    run() {
      fs.writeFileSync(path.join(root, '.github/plugin/marketplace.json'), JSON.stringify(marketplace));
      return spawnSync('bash', [path.join(root, 'scripts/validate-plugins.sh')], {
        cwd: os.tmpdir(), encoding: 'utf8',
      });
    },
  };
}

test('repository marketplace and plugin manifests validate from another working directory', () => {
  const result = spawnSync('bash', [validator], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const name of ['skill-summarizer', 'agent-triage', 'mcp-local-tools']) {
    assert(result.stdout.includes(`Validated ${name}:`));
  }
});

test('both documented relative source formats validate', t => {
  const setup = fixture(t);
  assert.equal(setup.run().status, 0);
  setup.marketplace.plugins[0].source = 'plugins/sample';
  assert.equal(setup.run().status, 0);
});

for (const [name, mutate] of [
  ['old path field', m => { m.plugins[0].path = m.plugins[0].source; delete m.plugins[0].source; }],
  ['missing owner', m => { delete m.owner; }],
  ['missing metadata', m => { delete m.metadata; }],
  ['missing directory', m => { m.plugins[0].source = './plugins/missing'; }],
  ['absolute source', m => { m.plugins[0].source = os.tmpdir(); }],
  ['escaping source', m => { m.plugins[0].source = '..'; }],
  ['duplicate name', m => { m.plugins.push({ ...m.plugins[0] }); }],
  ['mismatched plugin name', m => { m.plugins[0].name = 'different'; }],
  ['mismatched version', m => { m.plugins[0].version = '0.2.0'; }],
]) {
  test(`rejects ${name}`, t => {
    const setup = fixture(t);
    mutate(setup.marketplace);
    assert.notEqual(setup.run().status, 0);
  });
}

test('rejects malformed plugin JSON', t => {
  const setup = fixture(t);
  fs.writeFileSync(path.join(setup.root, 'plugins/sample/plugin.json'), '{');
  assert.notEqual(setup.run().status, 0);
});

test('rejects malformed marketplace JSON', t => {
  const setup = fixture(t);
  setup.run();
  fs.writeFileSync(path.join(setup.root, '.github/plugin/marketplace.json'), '{');
  const result = spawnSync('bash', [path.join(setup.root, 'scripts/validate-plugins.sh')], {
    cwd: os.tmpdir(), encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
});

test('rejects a source symlink escaping the repository', t => {
  const setup = fixture(t);
  fs.symlinkSync(os.tmpdir(), path.join(setup.root, 'plugins/outside'), 'dir');
  setup.marketplace.plugins[0].source = './plugins/outside';
  assert.notEqual(setup.run().status, 0);
});
