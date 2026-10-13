const assert = require('node:assert/strict');
const { test } = require('node:test');

const pluginsApi = import('../api/plugins.mjs');

async function request(query = '', method = 'GET') {
  const { handlePluginsRequest } = await pluginsApi;
  return handlePluginsRequest(new Request(`http://localhost/api/plugins${query}`, { method }));
}

test('API returns normalized plugin catalog data', async () => {
  const response = await request();
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.plugins.length, 20);
  assert.equal(data.plugins.find(plugin => plugin.id === 'skill-summarizer').providerCount, 1);
  assert.deepEqual(data.statuses, ['verified', 'draft', 'unverified']);
  assert.equal(data.bundles.length, 2);
});

test('API filters by type, confirmed provider compatibility, and status', async () => {
  const response = await request('?type=mcp&provider=github_copilot&status=verified');
  const data = await response.json();
  assert.deepEqual(data.plugins.map(plugin => plugin.id), ['mcp-local-tools']);
});

test('API permits direct draft and unverified status filters', async () => {
  const response = await request('?status=draft');
  const data = await response.json();
  assert(data.plugins.length > 0);
  assert(data.plugins.every(plugin => plugin.status === 'draft'));
});

test('API rejects unsupported filter values and methods', async () => {
  assert.equal((await request('?provider=unknown')).status, 400);
  assert.equal((await request('?status=available')).status, 400);
  assert.equal((await request('', 'POST')).status, 405);
});
