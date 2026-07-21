import { trace } from "@opentelemetry/api";

/**
 * Emits a custom "chat.turn" span to Application Insights (via the OpenTelemetry
 * tracer configured in instrumentation.ts) so routed model/agent/tier and token
 * usage can be charted. No-ops when App Insights is not configured, so local
 * development is unaffected.
 */
export function recordChatTurn(
  attributes: Record<string, string | number>
): void {
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) return;
  try {
    const tracer = trace.getTracer("azlens-chat");
    const span = tracer.startSpan("chat.turn");
    span.setAttributes(attributes);
    span.end();
  } catch {
    // Telemetry must never break a chat turn.
  }
}
