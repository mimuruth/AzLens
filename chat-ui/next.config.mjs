/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a minimal self-contained server bundle for a small container image.
  output: "standalone",
  // Runs instrumentation.ts on server startup (Application Insights).
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
