/**
 * Optional Application Insights / OpenTelemetry instrumentation.
 * Enabled only when APPLICATIONINSIGHTS_CONNECTION_STRING is set.
 */
import { useAzureMonitor } from "@azure/monitor-opentelemetry";

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  useAzureMonitor();
  console.error("Application Insights telemetry enabled.");
}
