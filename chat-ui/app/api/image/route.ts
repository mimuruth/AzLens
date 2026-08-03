/**
 * Image generation. Calls Azure OpenAI or OpenAI images endpoints (whichever is
 * configured) and returns { url } or { b64 }. Prompt is moderated first.
 *   POST /api/image  -> { prompt }
 */
export const runtime = "nodejs";
export const maxDuration = 60;

import { moderateText } from "@/lib/safety";
import { parseImageResult } from "@/lib/image";

export async function POST(req: Request): Promise<Response> {
  const { prompt } = await req.json().catch(() => ({}));
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return Response.json({ error: "Missing prompt." }, { status: 400 });
  }
  const moderation = await moderateText(prompt);
  if (!moderation.allowed) {
    return Response.json(
      {
        error: `Prompt blocked by the safety filter (${moderation.categories.join(", ")}).`,
      },
      { status: 400 }
    );
  }

  const size = process.env.IMAGE_SIZE || "1024x1024";
  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  if (
    process.env.AZURE_OPENAI_API_KEY &&
    process.env.AZURE_OPENAI_RESOURCE_NAME &&
    process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT
  ) {
    const api = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
    url = `https://${process.env.AZURE_OPENAI_RESOURCE_NAME}.openai.azure.com/openai/deployments/${process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT}/images/generations?api-version=${api}`;
    headers = {
      "content-type": "application/json",
      "api-key": process.env.AZURE_OPENAI_API_KEY,
    };
    body = { prompt: prompt.trim(), n: 1, size };
  } else if (process.env.OPENAI_API_KEY) {
    url = "https://api.openai.com/v1/images/generations";
    headers = {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    };
    body = {
      model: process.env.OPENAI_IMAGE_MODEL || "dall-e-3",
      prompt: prompt.trim(),
      n: 1,
      size,
    };
  } else {
    return Response.json(
      {
        error:
          "No image provider configured (set OPENAI_API_KEY or Azure OpenAI image deployment).",
      },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return Response.json(
        { error: `Image provider error (HTTP ${res.status}).` },
        { status: 502 }
      );
    }
    const result = parseImageResult(await res.json());
    if (!result)
      return Response.json({ error: "No image returned." }, { status: 502 });
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
