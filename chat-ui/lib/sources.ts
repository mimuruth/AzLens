/**
 * Extract cited sources (links) from an assistant answer so they can be shown
 * as a numbered "Sources" list under the message. Pure and unit-tested.
 */

export type Source = { title: string; url: string };

const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL = /(?<![([])\bhttps?:\/\/[^\s)\]]+/g;

export function extractSources(markdown: string): Source[] {
  const md = markdown ?? "";
  const out: Source[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  MD_LINK.lastIndex = 0;
  while ((m = MD_LINK.exec(md)) !== null) {
    const url = m[2];
    if (!seen.has(url)) {
      seen.add(url);
      out.push({ title: m[1].trim() || url, url });
    }
  }

  BARE_URL.lastIndex = 0;
  while ((m = BARE_URL.exec(md)) !== null) {
    const url = m[0].replace(/[.,;:]+$/, "");
    if (!seen.has(url)) {
      seen.add(url);
      out.push({ title: url, url });
    }
  }

  return out;
}
