import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlePluginsRequest } from '../api/plugins.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
]);

function isWithin(directory, target) {
  const relative = path.relative(directory, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function staticFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded === '/') decoded = '/catalog/';
  if (decoded === '/catalog') decoded = '/catalog/';
  const base = decoded.startsWith('/catalog/')
    ? path.join(repositoryRoot, 'catalog')
    : decoded.startsWith('/plugins/')
      ? path.join(repositoryRoot, 'plugins')
      : null;
  if (!base) return null;

  const target = path.resolve(repositoryRoot, `.${decoded}`);
  if (!isWithin(base, target)) return null;
  try {
    const requestedPath = fs.statSync(target).isDirectory()
      ? path.join(target, 'index.html')
      : target;
    const realBase = fs.realpathSync(base);
    const realTarget = fs.realpathSync(requestedPath);
    if (!isWithin(realBase, realTarget) || !fs.statSync(realTarget).isFile()) return null;
    return realTarget;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname === '/api/plugins') {
    const result = handlePluginsRequest(new Request(url, { method: request.method }));
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(await result.text());
    return;
  }

  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { allow: 'GET, HEAD' });
    response.end();
    return;
  }

  const filePath = staticFile(url.pathname);
  if (!filePath) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': contentTypes.get(path.extname(filePath)) || 'application/octet-stream',
    'x-content-type-options': 'nosniff',
  });
  response.end(request.method === 'HEAD' ? undefined : fs.readFileSync(filePath));
});

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
server.listen(port, host, () => console.log(`Plugin catalog available at http://${host}:${port}/catalog/`));
