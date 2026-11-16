/// <reference types="vite/client" />

/** The app version from package.json, injected at build time (vite.config.ts
 * `define`) — stamped into exports for provenance. */
declare const __APP_VERSION__: string;

/** True when src/analytics/config.ts names a provider and a site or token. */
declare const __ANALYTICS_ENABLED__: boolean;
