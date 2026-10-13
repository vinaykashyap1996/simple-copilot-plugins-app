export function filterPlugins(registry, { type = '', provider = '', status = '', bundle = '' } = {}) {
  const collection = bundle ? registry.bundles.find(item => item.id === bundle) : null;
  return registry.plugins.filter(plugin =>
    (!type || plugin.types.includes(type)) &&
    (!provider || ['native', 'adapted'].includes(plugin.compatibility[provider])) &&
    (!status || plugin.status === status) &&
    (!bundle || (collection && collection.pluginIds.includes(plugin.id)))
  );
}
