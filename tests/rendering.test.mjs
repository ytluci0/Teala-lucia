import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sampleFilament, resolutionFor, sphereResolution } from '../src/engine/motion.js';

test('filament pulses interpolate continuously, including the closed seam', () => {
  const points = new Float32Array([0,0,0,1, 10,20,1,2, 0,0,0,1]);
  const out = new Float32Array(4);
  assert.deepEqual([...sampleFilament(points, 2, .5, out)], [5,10,.5,1.5]);
  assert.deepEqual([...sampleFilament(points, 2, 1.5, out)], [5,10,.5,1.5]);
  assert.deepEqual([...sampleFilament(points, 2, -.5, out)], [5,10,.5,1.5]);
  const before = [...sampleFilament(points, 2, 1.9999, out)];
  const after = [...sampleFilament(points, 2, .0001, out)];
  before.forEach((value, i) => assert.ok(Math.abs(value - after[i]) < .001));
});

test('higher resolution is independent of layout, with bounded GPU pixel budgets', () => {
  assert.equal(sphereResolution(521, 1), 1042);
  assert.equal(sphereResolution(521, 1, 'reference'), 521);
  assert.ok(resolutionFor(1839, 1031, 1) > resolutionFor(1839, 1031, 1, 'reference'));
  for (const [w,h,dpr] of [[1920,1080,1], [3840,2160,2], [5120,2880,3], [390,844,3]]) {
    const scale = resolutionFor(w,h,dpr);
    assert.ok(w * scale <= 3200.001);
    assert.ok(w * h * scale ** 2 <= 8_294_401);
    assert.ok(sphereResolution(590,dpr) <= 1600);
  }
});

test('the supplied design stylesheet and room shaders are preserved', async () => {
  const source = await readFile(new URL('../reference/Lucia_Spherical_Core_UI.html', import.meta.url), 'utf8');
  const styles = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const normalize = s => s.replace(/\r\n/g, '\n');
  const digest = s => createHash('sha256').update(normalize(s)).digest('hex');
  assert.equal(digest(await readFile(new URL('../src/styles/lucia.css', import.meta.url), 'utf8')), digest(styles));
  const environment = normalize(await readFile(new URL('../src/engine/environment.js', import.meta.url), 'utf8'));
  for (const name of ['VERT','FRAG','POINT_VERT','POINT_FRAG']) {
    const pattern = new RegExp(`const ${name}\\s*=\\s*\x60([\\s\\S]*?)\x60;`);
    assert.equal(environment.match(pattern)?.[1], normalize(source).match(pattern)?.[1], `${name} remains unchanged`);
  }
});
