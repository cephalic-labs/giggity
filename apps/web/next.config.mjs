import withPWAInit from "next-pwa";

const isDevelopment = process.env.NODE_ENV === "development";
const pwaDisabledByEnv = process.env.NEXT_PUBLIC_PWA_DISABLE === "true";
// next-pwa + webpack watch mode can spam GenerateSW and trigger full reloads.
// Keep dev stable by default; allow explicit force-enable when needed.
const pwaEnabledInDev = process.env.NEXT_PUBLIC_PWA_DEV === "force";

const runtimeCaching = [
  {
    urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
    handler: "CacheFirst",
    options: {
      cacheName: "google-fonts-webfonts",
      expiration: {
        maxEntries: 32,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  {
    urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "google-fonts-stylesheets",
      expiration: {
        maxEntries: 32,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  {
    urlPattern: ({ request }) => request.destination === "image",
    handler: "CacheFirst",
    options: {
      cacheName: "static-images",
      expiration: {
        maxEntries: 128,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  {
    urlPattern: ({ request }) => request.destination === "font",
    handler: "CacheFirst",
    options: {
      cacheName: "static-fonts",
      expiration: {
        maxEntries: 32,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  {
    urlPattern: ({ request }) => request.destination === "style",
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "static-styles",
      expiration: {
        maxEntries: 32,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  {
    urlPattern: ({ request }) => request.destination === "script",
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "static-scripts",
      expiration: {
        maxEntries: 64,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  {
    urlPattern: ({ url }) => url.pathname === "/_next/image",
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "next-image-optimizer",
      expiration: {
        maxEntries: 64,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  {
    urlPattern: ({ url }) => /\/_next\/data\/.+\.json$/i.test(url.pathname),
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "next-data-json",
      expiration: {
        maxEntries: 64,
        maxAgeSeconds: 60 * 60 * 24,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  {
    urlPattern: ({ url, request }) =>
      url.pathname.startsWith("/api/") && request.method === "GET",
    handler: "NetworkFirst",
    options: {
      cacheName: "api-get-cache",
      networkTimeoutSeconds: 10,
      expiration: {
        maxEntries: 64,
        maxAgeSeconds: 60 * 5,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  {
    urlPattern: ({ request }) => request.mode === "navigate",
    handler: "NetworkFirst",
    options: {
      cacheName: "pages",
      networkTimeoutSeconds: 10,
      expiration: {
        maxEntries: 64,
        maxAgeSeconds: 60 * 60 * 24,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  {
    urlPattern: ({ url }) => url.origin === self.origin,
    handler: "NetworkFirst",
    options: {
      cacheName: "catch-all",
      networkTimeoutSeconds: 10,
      expiration: {
        maxEntries: 128,
        maxAgeSeconds: 60 * 60 * 24,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
];

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: pwaDisabledByEnv || (isDevelopment && !pwaEnabledInDev),
  runtimeCaching,
});

const nextConfig = {
  output: "standalone",

  // next-pwa hooks into webpack, so we intentionally run the project with
  // `next dev --webpack` / `next build --webpack` instead of Turbopack.
};

export default withPWA(nextConfig);
