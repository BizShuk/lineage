// @ts-expect-error -- Vite resolves this queried runtime module during the service-worker build.
import { setCacheNameDetails as unresolvedSetCacheNameDetails } from 'workbox-core?runtime';
// @ts-expect-error -- Vite resolves this queried runtime module during the service-worker build.
import { cleanupOutdatedCaches as unresolvedCleanupOutdatedCaches, precacheAndRoute as unresolvedPrecacheAndRoute } from 'workbox-precaching?runtime';

import { GAME_VERSION } from './app/version';

interface ServiceWorkerScope {
  __WB_MANIFEST: Array<{ url: string; revision?: string }>;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  skipWaiting(): Promise<void>;
}

declare const self: ServiceWorkerScope;

const setCacheNameDetails = unresolvedSetCacheNameDetails as unknown as (
  details: Readonly<{ prefix: string; suffix: string }>,
) => void;
const cleanupOutdatedCaches = unresolvedCleanupOutdatedCaches as unknown as () => void;
const precacheAndRoute = unresolvedPrecacheAndRoute as unknown as (
  entries: ServiceWorkerScope['__WB_MANIFEST'],
) => void;

setCacheNameDetails({ prefix: 'talking-island', suffix: GAME_VERSION });
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});
