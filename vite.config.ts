import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { swVersionPlugin } from './scripts/swVersionPlugin';

// This app has a single build target (no CRM/Prima-Mail two-app-in-one-project complexity),
// so this stays a plain single-entry Vite config.
export default defineConfig({
  plugins: [react(), swVersionPlugin('dist')],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
