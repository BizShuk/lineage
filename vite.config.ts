import { createRequire } from 'node:module';
import type { PluginOption } from 'vite';
import { defineConfig } from 'vitest/config';

interface PwaOptions {
  readonly strategies: 'injectManifest';
  readonly srcDir: string;
  readonly filename: string;
  readonly injectRegister: 'auto';
  readonly manifest: false;
  readonly injectManifest: {
    readonly globPatterns: readonly string[];
    readonly maximumFileSizeToCacheInBytes: number;
  };
}

export const PWA_OPTIONS = {
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'service-worker.ts',
  injectRegister: 'auto',
  manifest: false,
  injectManifest: {
    globPatterns: ['**/*.{html,js,css,json,png,webmanifest}'],
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  },
} satisfies PwaOptions;

const loadModule = createRequire(import.meta.url);
const { VitePWA } = loadModule('vite-plugin-pwa') as unknown as {
  readonly VitePWA: (options: PwaOptions) => PluginOption;
};

export default defineConfig({
  plugins: [VitePWA(PWA_OPTIONS)],
  test: {
    include: ['src/**/*.test.ts', 'tests/{unit,content,integration}/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
});
