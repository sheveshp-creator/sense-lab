import { defineConfig } from '@playwright/test';

// FAKE_VIDEO: path to a .y4m/.mjpeg file. Without it Chromium's built-in test pattern (no face) is used.
// PORT: test another server (e.g. `vite preview --port 4173` for the production build).
const port = process.env.PORT ?? '5173';
const fakeVideo = process.env.FAKE_VIDEO;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  reporter: 'list',
  use: {
    // CHROME=1 uses installed Google Chrome (real GPU) instead of the bundled headless shell.
    ...(process.env.CHROME ? { channel: 'chrome' as const } : {}),
    baseURL: `http://localhost:${port}`,
    permissions: ['camera'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        ...(fakeVideo ? [`--use-file-for-fake-video-capture=${fakeVideo}`] : []),
      ],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
