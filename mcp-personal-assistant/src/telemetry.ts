/**
 * Optional Application Insights / OpenTelemetry instrumentation.
 * -----------------------------------------------------------------------------
 * Enabled only when APPLICATIONINSIGHTS_CONNECTION_STRING is set (injected by
 * the Bicep template on Azure). Import this FIRST in the HTTP entry point so
 * incoming requests and outbound calls are auto-instrumented.
 */
import { useAzureMonitor } from "@azure/monitor-opentelemetry";

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  useAzureMonitor();
  console.error("Application Insights telemetry enabled.");
}
