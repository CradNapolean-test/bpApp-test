import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { securityHeaders } from "./lib/securityHeaders";

// The Content-Security-Policy is sent in REPORT-ONLY mode (it logs what it would block, to Sentry, and blocks nothing). After about a week
// with no real violations, set this to true: the same policy is then enforced. Framing protection is already enforced either way (M11).
const CSP_ENFORCE = false;

// A file that never changes for a given name can be kept by the phone for a day and refreshed quietly in the background for a week, instead
// of being re-checked on every launch (R44). The names are not versioned, so it is not "immutable".
const KEEP_A_DAY = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  // Photos are shrunk in the browser first (lib/utils/shrinkImage.ts); this is just headroom over
  // the 1MB default for anything that still goes through a server action.
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
    // Import only the icons a page uses instead of the whole icon library (R43).
    optimizePackageImports: ['lucide-react'],
  },
  // The Privacy Policy and Terms are read from content/legal/*.md at request time (H3): make sure those files are part of the deployment.
  outputFileTracingIncludes: {
    '/legal/privacy': ['./content/legal/**/*'],
    '/legal/terms': ['./content/legal/**/*'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders({ imageHosts: process.env.NEXT_PUBLIC_IMAGE_HOSTS, enforceCsp: CSP_ENFORCE }) },
      { source: '/icons/:path*', headers: [{ key: 'Cache-Control', value: KEEP_A_DAY }] },
      { source: '/splash/:path*', headers: [{ key: 'Cache-Control', value: KEEP_A_DAY }] },
      { source: '/logo-badge.png', headers: [{ key: 'Cache-Control', value: KEEP_A_DAY }] },
      { source: '/logo-wordmark.png', headers: [{ key: 'Cache-Control', value: KEEP_A_DAY }] },
      { source: '/manifest.json', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }] },
    ];
  },
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
