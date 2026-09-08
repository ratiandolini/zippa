const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.tile.openstreetmap.org" },
      { protocol: "https", hostname: "unpkg.com" },
    ],
  },
};

// Sentry — რთავს source-map ატვირთვას მხოლოდ SENTRY_AUTH_TOKEN-ის არსებობისას.
// DSN-ის გარეშე Sentry init არაფერს აკეთებს.
module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
  tunnelRoute: "/monitoring",
  widenClientFileUpload: false,
});
