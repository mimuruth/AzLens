/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Enables Application Insights only on the Node.js runtime when the connection
 * string is configured.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
  ) {
    const { useAzureMonitor } = await import("@azure/monitor-opentelemetry");
    useAzureMonitor();
  }
}
