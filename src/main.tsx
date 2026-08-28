// Fonts, self-hosted via @fontsource — imported first so they start downloading before anything
// else in the bundle. Inter's STATIC weights, not the variable file: the variable file renders
// too heavy on Windows ClearType.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
// Fraunces — display serif for headings and KPI numerals. The package's own family name is
// genuinely 'Fraunces Variable' (see tokens.css); the bare import pulls its weight-only axis.
import '@fontsource-variable/fraunces';
// Frank Ruhl Libre — Hebrew text (event/function Hebrew dates, names). These two weight files
// already bundle the Hebrew unicode-range alongside Latin, so no separate hebrew-*.css import
// is needed.
import '@fontsource/frank-ruhl-libre/500.css';
import '@fontsource/frank-ruhl-libre/700.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { registerServiceWorker } from './lib/serviceWorker';

// Registering here — at module scope, before the first render — is load-bearing: see the
// comment on registerServiceWorker's own readiness check in serviceWorker.ts.
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Drop the launch shell from index.html once React has actually painted. render() is async
// under React 18, so removing it on the next line would take the shell away BEFORE the first
// frame and put a blank flash straight back. Two frames is the cheap, reliable "we have
// painted" signal.
requestAnimationFrame(() => {
  requestAnimationFrame(() => document.getElementById('boot-shell')?.remove());
});
