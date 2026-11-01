import express from 'express';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'Lucia', mode: 'simulated', integrations: [] }));
app.use('/api', (req, res) => res.status(404).json({ error: 'No integration is configured for this endpoint.' }));

let vite;
const server = createServer(app);
if (dev) {
  // The unchanged source is served only during local QA, never in the production build.
  app.get('/__reference', async (req, res) => {
    let html = await readFile(path.join(root, 'reference/Lucia_Spherical_Core_UI.html'), 'utf8');
    if (req.query.diagnostics !== undefined) html = html.replace('</body>', '<script type="module" src="/src/dev/diagnostics.js"></script></body>');
    res.type('html').send(html);
  });
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'custom' });
  app.use(vite.middlewares);
  app.get('/{*path}', async (req, res, next) => {
    try {
      const html = await vite.transformIndexHtml(req.originalUrl, await readFile(path.join(root, 'index.html'), 'utf8'));
      res.type('html').send(html);
    } catch (error) { vite.ssrFixStacktrace(error); next(error); }
  });
} else {
  app.use(express.static(path.join(root, 'dist'), { index: false, setHeaders(res, file) {
    if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } }));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(root, 'dist/index.html')));
}
const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Lucia ${dev ? 'development' : 'production'} server: http://${host}:${server.address().port}`));
async function shutdown() { await vite?.close(); server.close(() => process.exit(0)); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
