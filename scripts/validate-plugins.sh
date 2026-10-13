#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node - "$root" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = fs.realpathSync(process.argv[2]);
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const validName = value => nonempty(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64;
const marketplace = readJson(path.join(root, '.github/plugin/marketplace.json'));

assert(validName(marketplace.name), 'Marketplace name must be kebab-case');
assert(nonempty(marketplace.owner?.name), 'Marketplace owner.name is required');
assert(nonempty(marketplace.metadata?.description), 'Marketplace metadata.description is required');
assert(nonempty(marketplace.metadata?.version), 'Marketplace metadata.version is required');
assert(Array.isArray(marketplace.plugins) && marketplace.plugins.length > 0, 'Plugins must be a nonempty array');

const names = new Set();
for (const plugin of marketplace.plugins) {
  assert(validName(plugin.name), 'Plugin name must be kebab-case');
  assert(!names.has(plugin.name), `Duplicate plugin: ${plugin.name}`);
  names.add(plugin.name);
  assert(nonempty(plugin.description), `Missing description: ${plugin.name}`);
  assert(nonempty(plugin.version), `Missing version: ${plugin.name}`);
  assert(nonempty(plugin.source) && !path.isAbsolute(plugin.source), `Source must be relative: ${plugin.name}`);
  const directory = fs.realpathSync(path.resolve(root, plugin.source));
  const relative = path.relative(root, directory);
  assert(relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    `Source must stay within the repository: ${plugin.name}`);
  assert(fs.statSync(directory).isDirectory(), `Source must be a directory: ${plugin.name}`);
  const manifest = readJson(path.join(directory, 'plugin.json'));
  assert.equal(manifest.name, plugin.name, `Plugin name mismatch: ${plugin.name}`);
  assert.equal(manifest.version, plugin.version, `Plugin version mismatch: ${plugin.name}`);
  console.log(`Validated ${plugin.name}: ${plugin.source}`);
}
NODE
