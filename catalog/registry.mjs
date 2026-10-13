export function filterPlugins(registry, { type = '', provider = '', bundle = '' } = {}) {
  const collection = bundle ? registry.bundles.find(item => item.id === bundle) : null;
  return registry.plugins.filter(plugin =>
    (!type || plugin.types.includes(type)) &&
    (!provider || ['native', 'adapted'].includes(plugin.compatibility[provider])) &&
    (!bundle || (collection && collection.pluginIds.includes(plugin.id)))
  );
}
