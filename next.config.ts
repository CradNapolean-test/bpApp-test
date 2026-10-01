import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Photos are shrunk in the browser first (lib/utils/shrinkImage.ts); this is just headroom over
  // the 1MB default for anything that still goes through a server action.
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
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
