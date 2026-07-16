import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PWA_OPTIONS } from '../../vite.config';

const projectFile = async (relativePath: string): Promise<string> =>
  readFile(path.join(process.cwd(), relativePath), 'utf8');

describe('offline PWA contract', () => {
  it('uses injectManifest with the complete offline asset set and 8 MiB limit', () => {
    expect(PWA_OPTIONS).toEqual({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      injectRegister: 'auto',
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,json,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    });
  });

  it('publishes the approved Traditional Chinese standalone manifest and HTML links', async () => {
    const manifest = JSON.parse(
      await projectFile('public/manifest.webmanifest'),
    ) as unknown;
    const html = await projectFile('index.html');

    expect(manifest).toEqual({
      name: '說話之島單機致敬版',
      short_name: '說話之島',
      lang: 'zh-Hant',
      start_url: '/',
      display: 'standalone',
      background_color: '#080b0a',
      theme_color: '#17140f',
      description: '2000–2003 台灣早期天堂說話之島風格的單機致敬遊戲',
    });
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<meta name="theme-color" content="#17140f" />');
  });

  it('versions project caches and supports cleanup, precaching, and skip waiting', async () => {
    const serviceWorker = await projectFile('src/service-worker.ts');

    expect(serviceWorker).toContain("import { GAME_VERSION } from './app/version';");
    expect(serviceWorker).toContain(
      "setCacheNameDetails({ prefix: 'talking-island', suffix: GAME_VERSION });",
    );
    expect(serviceWorker).toContain('cleanupOutdatedCaches();');
    expect(serviceWorker).toContain('precacheAndRoute(self.__WB_MANIFEST);');
    expect(serviceWorker).toContain("event.data === 'SKIP_WAITING'");
    expect(serviceWorker).toContain('void self.skipWaiting();');
  });
});
