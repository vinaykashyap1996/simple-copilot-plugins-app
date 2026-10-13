import Ajv from 'ajv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const schemaPath = path.join(repositoryRoot, 'catalog/plugin.schema.json');
const registryPath = path.join(repositoryRoot, 'catalog/registry.json');

export function validateRegistry(registry, schema, root = repositoryRoot) {
  const validate = new Ajv({ allErrors: true }).compile(schema);
  if (!validate(registry)) {
    return validate.errors.map(error => `${error.instancePath || '/'} ${error.message}`);
  }

  const errors = [];
  const pluginIds = new Set();
  for (const plugin of registry.plugins) {
    if (pluginIds.has(plugin.id)) errors.push(`Duplicate plugin ID: ${plugin.id}`);
    pluginIds.add(plugin.id);

    if (plugin.status === 'verified') {
      const sourcePath = path.resolve(root, 'catalog', plugin.source);
      const relative = path.relative(root, sourcePath);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        errors.push(`Plugin source escapes the repository: ${plugin.id}`);
        continue;
      }
      try {
        const realPath = fs.realpathSync(sourcePath);
        const realRelative = path.relative(fs.realpathSync(root), realPath);
        if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
          errors.push(`Plugin source escapes the repository: ${plugin.id}`);
        } else if (!fs.statSync(realPath).isDirectory()) {
          errors.push(`Plugin source is not a directory: ${plugin.id}`);
        }
      } catch {
        errors.push(`Plugin source does not exist: ${plugin.id}`);
      }
    }
  }

  const bundleIds = new Set();
  for (const bundle of registry.bundles) {
    if (bundleIds.has(bundle.id)) errors.push(`Duplicate bundle ID: ${bundle.id}`);
    bundleIds.add(bundle.id);
    for (const pluginId of bundle.pluginIds) {
      if (!pluginIds.has(pluginId)) errors.push(`Unknown plugin in bundle ${bundle.id}: ${pluginId}`);
    }
  }

  return errors;
}

function main() {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const selectedRegistry = process.argv[2] || registryPath;
  const registry = JSON.parse(fs.readFileSync(selectedRegistry, 'utf8'));
  const errors = validateRegistry(registry, schema);
  if (errors.length) {
    console.error(`Plugin registry validation failed:\n${errors.map(error => `- ${error}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Validated plugin registry: ${selectedRegistry}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
