const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'catalog/registry.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(root, 'catalog/plugin.schema.json'), 'utf8'));
const validator = import(pathToFileURL(path.join(root, 'scripts/validate-registry.mjs')).href);

test('registry validates against its JSON schema and semantic references', async () => {
  const { validateRegistry } = await validator;
  assert.deepEqual(validateRegistry(registry, schema), []);
});

for (const [name, mutate, expected] of [
  ['missing provider compatibility', data => { delete data.plugins[0].compatibility.claude; }, /required property/],
  ['unknown plugin type', data => { data.plugins[0].types[0] = 'unknown'; }, /must be equal to one of the allowed values/],
  ['unsupported status', data => { data.plugins[0].status = 'available'; }, /must be equal to one of the allowed values/],
  ['verified entry without source', data => { data.plugins[0].source = null; }, /must match "then" schema/],
  ['draft entry with a source', data => { data.plugins[3].source = '../plugins/skill-summarizer'; }, /must match "else" schema/],
  ['duplicate plugin ID', data => { data.plugins[1].id = data.plugins[0].id; }, /Duplicate plugin ID/],
  ['unknown bundle reference', data => { data.bundles[0].pluginIds.push('missing-plugin'); }, /Unknown plugin in bundle/],
]) {
  test(`rejects ${name}`, async () => {
    const { validateRegistry } = await validator;
    const invalid = structuredClone(registry);
    mutate(invalid);
    assert(validateRegistry(invalid, schema).some(message => expected.test(message)));
  });
}

test('rejects a verified source that escapes the repository', async () => {
  const { validateRegistry } = await validator;
  const invalid = structuredClone(registry);
  invalid.plugins[0].source = '../../outside';
  assert(validateRegistry(invalid, schema).some(message => /escapes the repository/.test(message)));
});
