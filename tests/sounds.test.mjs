import test from 'node:test';
import assert from 'node:assert/strict';
import LuciaSounds from '../src/engine/sounds.js';

class Param {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { assert.ok(value > 0, 'exponential ramps must never reach zero'); this.value = value; }
}
class AudioNode {
  gain = new Param(); frequency = new Param(); pan = new Param();
  disconnected = false;
  connect() {}
  disconnect() { this.disconnected = true; }
  start(at) { this.startedAt = at; }
  stop(at) { this.stoppedAt = at; }
  finish() { this.onended?.(); }
}
class AudioContext {
  state = 'suspended'; currentTime = 0; destination = {}; nodes = []; sources = [];
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createGain() { const n = new AudioNode(); this.nodes.push(n); return n; }
  createStereoPanner() { return this.createGain(); }
  createOscillator() { const n = this.createGain(); this.sources.push(n); return n; }
}
function setup(options = {}) {
  const context = new AudioContext();
  let time = 0, allocations = 0, hidden = false;
  const values = new Map();
  const sound = new LuciaSounds({ createContext: () => { allocations++; return context; }, now: () => time,
    isHidden: () => hidden, storage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) }, ...options });
  return { sound, context, values, get allocations() { return allocations; }, advance: ms => { time += ms; context.currentTime += ms / 1000; }, hide: () => { hidden = true; } };
}

test('audio is lazy, and cues release their audio nodes after playback', async () => {
  const fixture = setup(), { sound, context } = fixture;
  assert.equal(sound.play('open'), false);
  assert.equal(fixture.allocations, 0);
  await sound.unlock();
  assert.equal(fixture.allocations, 1);
  assert.equal(sound.play('open'), true);
  assert.equal(sound.voices.size, 1);
  assert.ok(context.sources.every(s => s.stoppedAt > s.startedAt));
  context.sources.forEach(s => s.finish());
  assert.equal(sound.voices.size, 0);
  assert.ok(context.sources.every(s => s.disconnected));
  sound.destroy();
  assert.equal(context.state, 'closed');
});

test('fast carousel movement is rate-limited and concurrent cues remain bounded', async () => {
  const fixture = setup(), { sound } = fixture;
  await sound.unlock();
  assert.equal(sound.play('move', 1), true);
  for (let i = 0; i < 90; i++) { fixture.advance(1); assert.equal(sound.play('move', -1), false); }
  fixture.advance(10);
  assert.equal(sound.play('move', -1), true);
  fixture.advance(100); assert.equal(sound.play('open'), true);
  fixture.advance(100); assert.equal(sound.play('close'), true);
  fixture.advance(100); assert.equal(sound.play('confirm'), false);
  assert.equal(sound.voices.size, 4);
  sound.destroy();
  assert.equal(sound.voices.size, 0);
});

test('mute is remembered and prevents sound allocation and playback', async () => {
  const muted = setup({ storage: { getItem: () => 'off' } });
  await muted.sound.unlock();
  assert.equal(muted.allocations, 0);
  assert.equal(muted.sound.play('open'), false);
  const fixture = setup(), { sound, context } = fixture;
  await sound.unlock(); sound.play('open'); sound.setEnabled(false);
  assert.equal(fixture.values.get('lucia.sound-effects'), 'off');
  assert.equal(context.state, 'suspended');
  assert.equal(sound.voices.size, 0);
  assert.equal(sound.play('close'), false);
  sound.setEnabled(true); await sound.unlock(); fixture.advance(100);
  assert.equal(sound.play('tap'), true);
  sound.destroy();
});

test('muting or hiding while audio unlocks never replays queued interactions', async () => {
  for (const reason of ['mute', 'hide']) {
    const fixture = setup(), { sound, context } = fixture;
    let finishResume;
    context.resume = () => new Promise(resolve => { finishResume = () => { context.state = 'running'; resolve(); }; });
    const ready = sound.unlock();
    sound.play('open'); sound.play('move');
    if (reason === 'mute') sound.setEnabled(false);
    else { fixture.hide(); sound.suspend(); }
    finishResume();
    assert.equal(await ready, false);
    assert.equal(sound.played, 0);
    assert.equal(context.state, 'suspended');
    assert.equal(sound.pending, null);
    sound.destroy();
  }
});

test('unsupported audio and blocked preference storage do not break the interface', async () => {
  const noAudio = setup({ createContext: () => null });
  assert.equal(await noAudio.sound.unlock(), false);
  assert.equal(noAudio.sound.status, 'unavailable');
  assert.equal(noAudio.sound.play('tap'), false);
  const { sound } = setup({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
  await sound.unlock(); sound.setEnabled(false); sound.setEnabled(true); await sound.unlock();
  assert.equal(sound.play('tap'), true);
  sound.destroy();
  assert.equal(await sound.unlock(), false);
});
