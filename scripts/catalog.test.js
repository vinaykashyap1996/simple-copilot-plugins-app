const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const catalog = path.join(root, 'catalog');
const registry = JSON.parse(fs.readFileSync(path.join(catalog, 'registry.json'), 'utf8'));
const filters = import(pathToFileURL(path.join(catalog, 'registry.mjs')).href);
const requested = [
  'code review', 'ponztail', 'claude mem', 'obsidan skill', 'superpowers',
  'remotion', 'strix', 'claude code setup', 'taste skill', 'web design',
  'guidlianve skill', 'awesome design', 'image to code', 'plazwright cli',
  'herder', 'graphifz', 'task observer',
];

test('registry schema has unique IDs, known types, and explicit provider compatibility', () => {
  assert.equal(registry.schemaVersion, 1);
  assert.deepEqual(registry.types, ['skills', 'prompts', 'mcp', 'instructions', 'agents', 'scripts', 'references']);
  assert.deepEqual(Object.keys(registry.providers), ['github_copilot', 'claude']);
  assert.deepEqual(registry.compatibilityStatuses, ['native', 'adapted', 'unsupported', 'unverified']);
  assert.equal(new Set(registry.plugins.map(plugin => plugin.id)).size, registry.plugins.length);
  for (const plugin of registry.plugins) {
    assert.match(plugin.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(typeof plugin.name, 'string');
    assert(plugin.name.length > 0);
    assert.equal(typeof plugin.description, 'string');
    assert(plugin.description.length > 0);
    assert(['available', 'draft'].includes(plugin.status));
    assert(plugin.types.length > 0);
    assert.equal(new Set(plugin.types).size, plugin.types.length);
    for (const type of plugin.types) assert(registry.types.includes(type));
    assert.deepEqual(Object.keys(plugin.compatibility).sort(), Object.keys(registry.providers).sort());
    for (const value of Object.values(plugin.compatibility)) assert(registry.compatibilityStatuses.includes(value));
  }
});

test('all requested names remain unverified drafts with no installation source', () => {
  assert.deepEqual(registry.plugins.filter(plugin => plugin.status === 'draft').map(plugin => plugin.name), requested);
  for (const name of requested) {
    const plugin = registry.plugins.find(item => item.name === name);
    assert.equal(plugin.source, null);
    assert.deepEqual(Object.values(plugin.compatibility), ['unverified', 'unverified']);
  }
});

test('available entries match the unchanged Copilot marketplace and local plugin directories', () => {
  const marketplace = JSON.parse(fs.readFileSync(path.join(root, '.github/plugin/marketplace.json'), 'utf8'));
  const available = registry.plugins.filter(plugin => plugin.status === 'available');
  assert.deepEqual(available.map(plugin => plugin.id), marketplace.plugins.map(plugin => plugin.name));
  for (const plugin of available) {
    const entry = marketplace.plugins.find(item => item.name === plugin.id);
    const source = path.resolve(catalog, plugin.source);
    assert.equal(source, path.resolve(root, entry.source));
    assert(fs.statSync(source).isDirectory());
    assert.equal(plugin.compatibility.github_copilot, 'native');
    assert.equal(plugin.compatibility.claude, 'unverified');
  }
});

test('starter bundles are draft collections with unique, existing plugin references', () => {
  assert.deepEqual(registry.bundles.map(bundle => bundle.name), ['Beautiful Website bundle', 'Fullstack JS bundle']);
  assert.equal(new Set(registry.bundles.map(bundle => bundle.id)).size, registry.bundles.length);
  for (const bundle of registry.bundles) {
    assert.equal(bundle.status, 'draft');
    assert(bundle.description.length > 0);
    assert(bundle.pluginIds.length > 0);
    assert.equal(new Set(bundle.pluginIds).size, bundle.pluginIds.length);
    for (const id of bundle.pluginIds) assert(registry.plugins.some(plugin => plugin.id === id));
  }
});

test('filters combine type, confirmed provider compatibility, and bundle membership', async () => {
  const { filterPlugins } = await filters;
  assert.deepEqual(filterPlugins(registry), registry.plugins);
  assert.equal(filterPlugins(registry, { type: 'instructions' })[0].id, 'claude-code-setup');
  assert.equal(filterPlugins(registry, { provider: 'github_copilot' }).length, 3);
  assert.deepEqual(filterPlugins(registry, { provider: 'claude' }), []);
  assert.equal(filterPlugins(registry, { bundle: 'beautiful-website' }).length, 6);
  assert.deepEqual(filterPlugins(registry, {
    type: 'mcp', provider: 'github_copilot', bundle: 'fullstack-js',
  }).map(plugin => plugin.id), ['mcp-local-tools']);
  assert.deepEqual(filterPlugins(registry, { bundle: 'missing' }), []);
  assert.deepEqual(filterPlugins(registry, { type: 'missing' }), []);
  assert.deepEqual(filterPlugins(registry, { provider: 'missing' }), []);
});

test('provider filtering includes adapted plugins but excludes unsupported and unverified entries', async () => {
  const { filterPlugins } = await filters;
  const sample = {
    bundles: [],
    plugins: registry.compatibilityStatuses.map(value => ({
      id: value, types: ['skills'], compatibility: { claude: value },
    })),
  };
  assert.deepEqual(filterPlugins(sample, { provider: 'claude' }).map(plugin => plugin.id), ['native', 'adapted']);
});
