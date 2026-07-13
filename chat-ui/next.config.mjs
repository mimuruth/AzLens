/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a minimal self-contained server bundle for a small container image.
  output: "standalone",
  // Runs instrumentation.ts on server startup (Application Insights).
  experimental: {
    instrumentationHook: true,
    // Keep the OpenTelemetry Node SDK out of the webpack bundle so its optional
    // deps (e.g. @opentelemetry/shim-opencensus) don't trigger resolve warnings.
    serverComponentsExternalPackages: ["@azure/monitor-opentelemetry"],
  },
};

export default nextConfig;
