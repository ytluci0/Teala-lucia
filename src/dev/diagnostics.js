// Opt-in local QA only. Not part of the production entry point.
// Measurements are exported to an inert JSON DOM node, without adding UI panels.
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const params = new URLSearchParams(location.search);
const summary = values => {
  if (!values.length) return { samples: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: values.length, meanMs: values.reduce((a, b) => a + b, 0) / values.length,
    medianMs: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))],
    over25ms: values.filter(x => x > 25).length };
};
const output = document.createElement('script');
output.type = 'application/json'; output.id = 'lucia-diagnostics';
document.body.append(output);
const publish = data => { output.textContent = JSON.stringify(data); };
publish({ status: 'waiting' });
for (let i = 0; i < 100 && !window.LuciaUI; i++) await wait(100);
const ui = window.LuciaUI;
if (!ui) throw new Error('Lucia controller did not initialize.');
const ringDraw = ui.renderer.draw.bind(ui.renderer), sceneDraw = ui.scene.draw.bind(ui.scene);

if (params.has('still')) {
  ui.renderer.draw = (_, activity) => ringDraw(0, activity);
  ui.scene.draw = (_, dt, activity, motion) => sceneDraw(0, dt, activity, motion);
  ui.pause(); ui.gaze.release(); ui.renderer.setGaze(0, 0);
  ui.renderer.reflectionTime = -Infinity; ui.renderer.firstDraw = false; ui.wake();
  publish({ status: 'still', viewport: [innerWidth, innerHeight], scene: ui.scene.mode });
} else {
  const result = { status: 'recording', viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, userAgent: navigator.userAgent, profiles: [] };
  const adapt = ui.scene.adapt;
  ui.scene.adapt = () => {}; ui.scene.resolutionScale = 1; ui.scene.resize();
  let profile = 'combined', ringCosts = [], sceneCosts = [], frameTimes = [];
  const gazeUpdate = ui.gaze.update.bind(ui.gaze);
  ui.gaze.update = (dt, options) => { frameTimes.push(dt * 1000); return gazeUpdate(dt, options); };
  ui.renderer.draw = (...args) => { if (profile === 'environment-only') return; const t = performance.now(); ringDraw(...args); ringCosts.push(performance.now() - t); };
  ui.scene.draw = (...args) => { if (profile === 'ring-only') return; const t = performance.now(); sceneDraw(...args); sceneCosts.push(performance.now() - t); };
  try {
    for (const name of ['combined', 'ring-only', 'environment-only', 'carousel', 'spotlight']) {
      profile = name; result.activeProfile = name; publish(result);
      await wait(1200);
      ui.metrics.frameIntervals.length = 0; ui.metrics.jsFrameCosts.length = 0;
      ringCosts = []; sceneCosts = []; frameTimes = [];
      let interval;
      if (name === 'carousel') {
        let i = 0; interval = setInterval(() => ui.centre([3, 4, 3, 2][i++ % 4]), 700);
      }
      if (name === 'spotlight') {
        let open = true; ui.select(2);
        interval = setInterval(() => { if (open) document.querySelector('.spotlight-close').click(); else ui.select(2); open = !open; }, 900);
      }
      await wait(3200); clearInterval(interval);
      result.profiles.push({ name, intervals: summary(frameTimes), js: summary(ui.metrics.jsFrameCosts),
        ring: summary(ringCosts), environmentSubmission: summary(sceneCosts),
        sceneSize: ui.scene.stats.renderSize, ringSize: ui.renderer.width, sceneMode: ui.scene.mode });
      document.querySelector('.spotlight-close')?.click(); ui.centre(2);
    }
    result.status = 'complete'; delete result.activeProfile; publish(result);
  } finally { ui.renderer.draw = ringDraw; ui.scene.draw = sceneDraw; ui.scene.adapt = adapt; ui.gaze.update = gazeUpdate; }
}
