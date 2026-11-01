import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('the production server serves the built app and reports simulation status', async () => {
  const child = spawn(process.execPath, ['server/index.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server readiness timed out')), 10_000);
      child.on('error', reject);
      child.stdout.on('data', chunk => { const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
      child.stderr.on('data', chunk => { clearTimeout(timer); reject(new Error(String(chunk))); });
    });
    const response = await fetch(base), html = await response.text();
    assert.equal(response.status, 200); assert.match(html, /id="root"/);
    assert.ok(!html.includes('LuciaEnergyRenderer='));
    const script = html.match(/src="([^\"]+\.js)"/)[1];
    assert.equal((await fetch(base + script)).status, 200);
    assert.deepEqual(await (await fetch(base + '/api/health')).json(), { status: 'ok', app: 'Lucia', mode: 'simulated', integrations: [] });
    assert.equal((await fetch(base + '/api/unknown')).status, 404);
    assert.ok(!(await (await fetch(base + '/__reference')).text()).includes('LUCIA / VOLUMETRIC CORE'));
  } finally { child.kill(); }
});
