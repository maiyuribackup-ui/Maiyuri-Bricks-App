import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Maiyuri Bricks Android shell.
 *
 * The Next.js app is server-rendered (output: 'standalone'), so we load the
 * live deployment in the WebView via `server.url` rather than bundling a
 * static export. Capacitor still injects its JS bridge into the remote page,
 * so native plugins (push, camera) work. The app auto-updates whenever
 * mb.maiyuri.com is redeployed — no APK re-release needed for web changes.
 */
const config: CapacitorConfig = {
  appId: "com.maiyuri.app",
  appName: "Maiyuri Bricks",
  webDir: "www",
  server: {
    url: "https://mb.maiyuri.com",
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
