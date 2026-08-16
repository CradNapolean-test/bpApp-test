import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// withSentryConfig is safe to apply even without SENTRY_DSN/org/project set -- it only
// affects the build (source map upload, tunneling route), not runtime behavior, and skips
// its own upload step when SENTRY_AUTH_TOKEN is absent.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
