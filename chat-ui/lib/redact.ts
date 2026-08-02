/**
 * Best-effort PII redaction for free-text we persist or log (feedback reasons,
 * captured prompts/answers). Pure and unit-tested. Not a substitute for a full
 * DLP solution — it covers the common high-signal identifiers.
 */

const PATTERNS: [RegExp, string][] = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]"],
  // Credit-card-like: 13–16 digits, optional spaces/dashes.
  [/\b(?:\d[ -]?){13,16}\b/g, "[card]"],
  // US SSN-like.
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]"],
  // Phone-like (7+ digits with separators / country code).
  [/(?:\+?\d[\d -]{7,}\d)/g, "[phone]"],
  // Bearer / API-key-like tokens.
  [/\b(?:sk|pk|ghp|xox[baprs])[-_][A-Za-z0-9-_]{16,}\b/g, "[token]"],
];

export function redactPII(text: string): string {
  let out = text ?? "";
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl);
  return out;
}

/** Redact then clamp to a max length (for stored/exported text). */
export function redactAndClamp(text: string, max = 2000): string {
  const r = redactPII(text ?? "");
  return r.length > max ? `${r.slice(0, max)}…` : r;
}
