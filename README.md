# Lucia web app

The supplied `Lucia_Spherical_Core_UI.html` is preserved in `reference/`. The earlier workspace is backed up locally under `backups/pre-react-20261102-002058/`, including file hashes. Local snapshots and earlier standalone iterations are excluded from Git. The file in Downloads was not edited.

## Run

Requires Node.js 22.12 or newer. Dependencies are pinned in `package-lock.json`.

```powershell
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3000**. The server binds to this computer only by default. `PORT` and `HOST` can be configured through environment variables. `Start Lucia.cmd` runs the build and starts the same server.

For editing with React hot reload:

```powershell
npm run dev
```

## Preserved design

- `src/styles/lucia.css` contains the supplied CSS, unchanged except for line endings.
- `src/App.jsx` renders the original header, agents, core, carousel, composer, and spotlight as React components.
- `src/data/preview.js` keeps the original icons, responsibilities, sample cards, and spotlight content.
- `src/engine/environment.js` retains the room shaders and floor reflections.
- `src/engine/sphere.js` retains the original sphere geometry, projection, lighting, and text textures, and provides the Canvas fallback.
- `src/engine/gpu-sphere.js` draws that geometry with WebGL. Geometry and colours are preserved; edge antialiasing and small overlapping light highlights can differ from Canvas rasterization.
- `src/engine/controller.js` owns the single animation loop and interactions. React renders on content changes, not on each animation frame. Effect cleanup cancels the loop, disconnects observers and listeners, and releases GPU resources.

## Animation and resolution

The original Canvas sphere was the main bottleneck in the measured browser. The GPU path groups filament drawing, interpolates travelling lights between samples, and shares the core canvas with the floor renderer without an intermediate Canvas copy. The core reflection updates up to 30 times per second instead of about 4.5.

At the tested 1839 × 1031 viewport with device pixel ratio 1, the core renders at **1042 × 1042**, compared with **521 × 521** in the supplied file. The room renders at **2299 × 1289**, compared with **1550 × 869**. The CSS layout size does not change.

High quality is the default. `?quality=ultra` allows larger render targets on high-density displays, within a pixel budget. `?quality=reference` uses the original resolution limits for comparisons. Sustained slow frames can lower the room resolution slightly; it recovers when sustained headroom returns. Decorative motion respects the existing pause control, reduced-motion preference, and hidden tabs.

## Verification

```powershell
npm run build
npm test
```

Tests cover continuous closed-loop interpolation, resolution budgets, unchanged CSS and room shaders, and the production HTTP server. Browser testing covers the design at matching dimensions, controls, dialogs, and responsive layouts. Measurements and screenshots are stored in `artifacts/`; they describe this browser and machine, not a universal frame-rate guarantee.

Development-only recording routes:

- `/__reference?diagnostics=1` — unmodified supplied app with the same timing harness injected.
- `/?diagnostics=1` — React app with that harness.
- Add `&still=1` to capture both at the same fixed animation time.

The harness measures the combined scene, core alone, room alone, carousel movement, and spotlight transitions in separate windows. Reports are available in the inert `#lucia-diagnostics` JSON element. Frame timing reflects browser scheduling; JavaScript timing does not include the full asynchronous GPU cost. These routes and the diagnostic module are excluded from production delivery.

## Server and integrations

`server/index.mjs` serves the production React build and exposes `/api/health`. This endpoint reports server readiness and explicitly identifies the app as simulated. No email, microphone, AI, calendar, or production-system integration has been added; all existing preview interactions remain local.

React lifecycle handling follows [React's effect cleanup guidance](https://react.dev/learn/synchronizing-with-effects). Build setup follows [Vite's documentation](https://vite.dev/guide/).
