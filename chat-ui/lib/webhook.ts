/**
 * Delivery for scheduled-run results. Formats a message and posts it to a
 * generic incoming webhook (Slack / Microsoft Teams connector accept `{ text }`).
 * `formatRunMessage` and `webhookPayload` are pure and unit-tested.
 */

export function formatRunMessage(
  objective: string,
  answer: string,
  steps: number
): string {
  const trimmed = answer.trim();
  const body = trimmed.length > 3500 ? `${trimmed.slice(0, 3500)}…` : trimmed;
  return `Scheduled run — ${objective}\n(${steps} step${steps === 1 ? "" : "s"})\n\n${body}`;
}

export function webhookPayload(message: string): { text: string } {
  return { text: message };
}

/** Best-effort POST to an incoming webhook; never throws. */
export async function deliverWebhook(
  url: string,
  message: string
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(webhookPayload(message)),
    });
    return res.ok;
  } catch {
    return false;
  }
}
