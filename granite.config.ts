import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // Keep this in sync with the immutable appName already registered in the Toss console.
  appName: 'lotto-ai-picker',
  displayName: '근무표 급여계산',
  web: {
    port: 5173,
    commands: {
      dev: 'vite --host',
      build: 'vite build',
    },
  },
  permissions: [],
});

