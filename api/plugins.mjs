import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filterPlugins } from '../catalog/registry.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(repositoryRoot, 'catalog/registry.json');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function handlePluginsRequest(request) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const url = new URL(request.url);
  const filters = {
    type: url.searchParams.get('type') || '',
    provider: url.searchParams.get('provider') || '',
    status: url.searchParams.get('status') || '',
  };
  if (filters.type && !registry.types.includes(filters.type)) {
    return jsonResponse({ error: `Unknown plugin type: ${filters.type}` }, 400);
  }
  if (filters.provider && !Object.hasOwn(registry.providers, filters.provider)) {
    return jsonResponse({ error: `Unknown provider: ${filters.provider}` }, 400);
  }
  if (filters.status && !registry.statuses.includes(filters.status)) {
    return jsonResponse({ error: `Unknown plugin status: ${filters.status}` }, 400);
  }

  const plugins = filterPlugins(registry, filters).map(plugin => ({
    ...plugin,
    providerCount: Object.values(plugin.compatibility)
      .filter(value => value === 'native' || value === 'adapted').length,
  }));
  return jsonResponse({
    schemaVersion: registry.schemaVersion,
    types: registry.types,
    statuses: registry.statuses,
    providers: registry.providers,
    compatibilityStatuses: registry.compatibilityStatuses,
    plugins,
    bundles: registry.bundles,
  });
}
