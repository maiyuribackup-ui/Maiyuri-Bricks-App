import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
    dest: "public",
    cacheOnFrontEndNav: true,
    aggressiveFrontEndNavCaching: true,
    reloadOnOnline: true,
    swMinify: true,
    disable: process.env.NODE_VALUE === "development",
    // Replaces next-pwa's default "apis" rule, which was NetworkFirst with a
    // 10-second network timeout and a 24-hour disk cache of 16 entries. Two
    // things were wrong with it:
    //
    //   * Staff were served up-to-a-day-old answers whenever the network was
    //     slow, with nothing on screen to say so. A Smart Quote that had been
    //     deleted kept showing its old link, rate and quote number, and a hard
    //     refresh did not clear it — the page reloads but the service worker
    //     still answers the fetch.
    //   * Authenticated responses — leads, quotes, customer names and phone
    //     numbers — were written to Cache Storage and outlived logout on a
    //     shared machine.
    //
    // An authenticated API response is never safe to replay from disk, so the
    // API is now network-only. Pages and static assets keep their caching, so
    // the app still installs and loads offline.
    extendDefaultRuntimeCaching: true,
    workboxOptions: {
        disableDevLogs: true,
        runtimeCaching: [
            {
                urlPattern: ({ sameOrigin, url: { pathname } }) =>
                    sameOrigin && pathname.startsWith("/api/"),
                handler: "NetworkOnly",
                method: "GET",
                // Same cacheName as the default entry — that is what makes
                // this override it rather than run alongside it.
                options: { cacheName: "apis" },
            },
        ],
    },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    transpilePackages: ["@maiyuri/ui", "@maiyuri/shared", "@maiyuri/api"],
    experimental: {
        // Loads instrumentation.ts (server-side Sentry init) on boot.
        instrumentationHook: true,
    },
};

export default withPWA(nextConfig);
