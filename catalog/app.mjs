import { filterPlugins } from './registry.mjs';

const status = document.querySelector('#status');
const plugins = document.querySelector('#plugins');
const filters = document.querySelector('#filters');
const type = document.querySelector('#type');
const provider = document.querySelector('#provider');
const bundle = document.querySelector('#bundle');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function option(select, value, label) {
  const node = element('option', label);
  node.value = value;
  select.append(node);
}

async function loadCatalog() {
  try {
    const response = await fetch('./registry.json');
    if (!response.ok) throw new Error('Catalog request failed');
    const registry = await response.json();
    for (const value of registry.types) option(type, value, value);
    for (const [id, label] of Object.entries(registry.providers)) option(provider, id, label);
    for (const collection of registry.bundles) {
      option(bundle, collection.id, collection.name);
      const card = element('article');
      card.append(
        element('h3', collection.name),
        element('p', collection.status, 'badge'),
        element('p', collection.description),
        element('p', `${collection.pluginIds.length} entries`)
      );
      const button = element('button', `Browse ${collection.name}`);
      button.type = 'button';
      button.addEventListener('click', () => {
        filters.reset();
        bundle.value = collection.id;
        render();
        document.querySelector('#catalog-heading').scrollIntoView();
      });
      card.append(button);
      document.querySelector('#bundles').append(card);
    }

    function render() {
      const matches = filterPlugins(registry, {
        type: type.value, provider: provider.value, bundle: bundle.value,
      });
      plugins.replaceChildren();
      for (const plugin of matches) {
        const card = element('article');
        card.append(
          element('h3', plugin.name),
          element('p', plugin.status === 'draft' ? 'Draft / unverified' : 'Existing sample', 'badge'),
          element('p', plugin.description),
          element('p', `Types: ${plugin.types.join(', ')}`)
        );
        for (const [id, label] of Object.entries(registry.providers)) {
          card.append(element('p', `${label}: ${plugin.compatibility[id]}`, 'compatibility'));
        }
        const collections = registry.bundles.filter(item => item.pluginIds.includes(plugin.id));
        if (collections.length) card.append(element('p', `Collections: ${collections.map(item => item.name).join(', ')}`));
        if (plugin.status === 'available' && plugin.source) {
          const url = new URL(plugin.source, window.location.href);
          if (url.origin === window.location.origin && ['http:', 'https:'].includes(url.protocol)) {
            const link = element('a', 'View local plugin files');
            link.href = url.href;
            card.append(link);
          }
        } else {
          card.append(element('p', 'Source and installation pending verification.'));
        }
        plugins.append(card);
      }
      status.textContent = matches.length
        ? `${matches.length} of ${registry.plugins.length} plugins`
        : 'No plugins match these filters. Draft compatibility is unverified; try All providers or reset filters.';
    }

    filters.addEventListener('submit', event => event.preventDefault());
    filters.addEventListener('change', render);
    filters.addEventListener('reset', () => queueMicrotask(render));
    render();
  } catch {
    status.textContent = 'Unable to load the catalog. Serve the repository over HTTP (see README) and reload.';
  }
}

loadCatalog();
