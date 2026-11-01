import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Explicit development-only fallback test; no browser or OS settings are changed.
if (import.meta.env.DEV && new URLSearchParams(location.search).get('test-backend') === 'canvas') {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    return type === 'webgl' || type === 'webgl2' ? null : getContext.call(this, type, ...args);
  };
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);

if (import.meta.env.DEV && new URLSearchParams(location.search).has('diagnostics')) import('./dev/diagnostics.js');
