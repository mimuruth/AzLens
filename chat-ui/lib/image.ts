/**
 * Image-generation helpers. Pure parsing/formatting so the /api/image route and
 * UI share one shape. Unit-tested; the route does the provider call.
 */

export type ImageResult = { url?: string; b64?: string };

/** Extract the first image from an OpenAI/Azure images response, or null. */
export function parseImageResult(json: unknown): ImageResult | null {
  const d = (json as { data?: { url?: string; b64_json?: string }[] })
    ?.data?.[0];
  if (!d) return null;
  if (d.url) return { url: d.url };
  if (d.b64_json) return { b64: d.b64_json };
  return null;
}

/** Markdown image referencing a URL or inline base64 data. */
export function imageMarkdown(prompt: string, r: ImageResult): string {
  const src = r.url ?? (r.b64 ? `data:image/png;base64,${r.b64}` : "");
  if (!src) return "";
  const alt = prompt.replace(/\s+/g, " ").slice(0, 80);
  return `![${alt}](${src})`;
}
