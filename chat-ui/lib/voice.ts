/**
 * Voice helpers for the composer (speech-to-text) and answers (text-to-speech).
 * Uses the browser Web Speech API — no dependencies. `stripMarkdownForSpeech`
 * is pure and unit-tested; the detection helpers guard the UI at runtime.
 */

export function sttSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );
}

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Flatten markdown into clean prose so TTS doesn't read syntax aloud. */
export function stripMarkdownForSpeech(md: string): string {
  return (md ?? "")
    .replace(/```[\s\S]*?```/g, " code block. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_~>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Create a one-shot SpeechRecognition instance, or null if unsupported. */
export function createRecognition(): any | null {
  if (!sttSupported()) return null;
  const Ctor =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.continuous = false;
  return rec;
}
