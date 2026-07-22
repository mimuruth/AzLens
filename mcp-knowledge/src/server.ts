/**
 * mcp-knowledge — server factory
 * -----------------------------------------------------------------------------
 * Retrieval-Augmented Generation (RAG) over Azure AI Search. Exposes tools to
 * search an index and fetch documents so an agent can ground answers in your
 * knowledge base and cite sources. Authentication is either a query API key or
 * `DefaultAzureCredential` (az login locally / managed identity in Azure —
 * needs the Search Index Data Reader role). Tool logic lives here and is shared
 * by the stdio (index.ts) and HTTP (http.ts) entry points.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  SearchClient,
  AzureKeyCredential,
  type SearchDocumentsResult,
} from "@azure/search-documents";
import { DefaultAzureCredential } from "@azure/identity";

const ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT ?? "";
const INDEX = process.env.AZURE_SEARCH_INDEX ?? "";
const API_KEY = process.env.AZURE_SEARCH_API_KEY ?? "";
const CONTENT_FIELD = process.env.AZURE_SEARCH_CONTENT_FIELD || "content";
const TITLE_FIELD = process.env.AZURE_SEARCH_TITLE_FIELD || "title";
const SEMANTIC_CONFIG = process.env.AZURE_SEARCH_SEMANTIC_CONFIG || "";

type Doc = Record<string, unknown>;

const credential = new DefaultAzureCredential();
let client: SearchClient<Doc> | undefined;

function getClient(): SearchClient<Doc> {
  if (!ENDPOINT || !INDEX) {
    throw new Error(
      "Azure AI Search is not configured: set AZURE_SEARCH_ENDPOINT and " +
        "AZURE_SEARCH_INDEX in the environment."
    );
  }
  if (!client) {
    const cred = API_KEY ? new AzureKeyCredential(API_KEY) : credential;
    client = new SearchClient<Doc>(ENDPOINT, INDEX, cred);
  }
  return client;
}

/** Returns a human-readable hint when NOT ready, or null when good to go. */
async function checkAuth(): Promise<string | null> {
  if (!ENDPOINT || !INDEX) {
    return (
      "Azure AI Search is not configured: set AZURE_SEARCH_ENDPOINT and " +
      "AZURE_SEARCH_INDEX (and optionally AZURE_SEARCH_API_KEY) in the " +
      "environment."
    );
  }
  if (API_KEY) return null;
  try {
    const token = await credential.getToken(
      "https://search.azure.com/.default"
    );
    if (!token) {
      return (
        "Not authenticated to Azure AI Search. Run `az login` locally, or " +
        "assign a managed identity with the Search Index Data Reader role."
      );
    }
    return null;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return (
      "Not authenticated to Azure AI Search. Provide AZURE_SEARCH_API_KEY, or " +
      `run \`az login\` / assign a managed identity.\n\nDetails: ${detail}`
    );
  }
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function fieldStr(doc: Doc, field: string): string {
  const v = doc[field];
  return typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
}

/** Create a fully configured mcp-knowledge server instance. */
export function createServer(): McpServer {
  const server = new McpServer({ name: "mcp-knowledge", version: "1.0.0" });

  // ------------------------------------------------------------------------
  // Tool: search_knowledge
  // ------------------------------------------------------------------------
  server.registerTool(
    "search_knowledge",
    {
      title: "Search Knowledge Base",
      description:
        "Search the Azure AI Search index for passages relevant to a query. " +
        "Returns the top matches with their title, a content snippet, and a " +
        "score so answers can cite sources.",
      inputSchema: {
        query: z.string().min(1).describe("Natural-language search query."),
        top: z.number().int().min(1).max(20).default(5).optional(),
      },
    },
    async ({ query, top }) => {
      const notReady = await checkAuth();
      if (notReady) return text(notReady);

      const count = top ?? 5;
      const results: SearchDocumentsResult<Doc> = await getClient().search(
        query,
        SEMANTIC_CONFIG
          ? {
              top: count,
              queryType: "semantic",
              semanticSearchOptions: { configurationName: SEMANTIC_CONFIG },
            }
          : { top: count }
      );

      const lines: string[] = [];
      let n = 0;
      for await (const r of results.results) {
        n += 1;
        const doc = r.document;
        const title = fieldStr(doc, TITLE_FIELD) || `Result ${n}`;
        const body = fieldStr(doc, CONTENT_FIELD).replace(/\s+/g, " ").trim();
        const snippet = body.length > 500 ? `${body.slice(0, 500)}…` : body;
        const score =
          typeof r.score === "number" ? ` (score ${r.score.toFixed(2)})` : "";
        lines.push(`### ${title}${score}\n${snippet || "(no content field)"}`);
      }

      if (lines.length === 0) return text(`No results for "${query}".`);
      return text(
        `Top ${lines.length} results for "${query}":\n\n${lines.join("\n\n")}`
      );
    }
  );

  // ------------------------------------------------------------------------
  // Tool: get_document
  // ------------------------------------------------------------------------
  server.registerTool(
    "get_document",
    {
      title: "Get Document",
      description: "Fetch a single document from the index by its key.",
      inputSchema: {
        key: z.string().min(1).describe("The document key."),
      },
    },
    async ({ key }) => {
      const notReady = await checkAuth();
      if (notReady) return text(notReady);
      try {
        const doc = await getClient().getDocument(key);
        const title = fieldStr(doc, TITLE_FIELD) || key;
        const body = fieldStr(doc, CONTENT_FIELD);
        return text(`# ${title}\n\n${body || JSON.stringify(doc, null, 2)}`);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return text(`Could not fetch document "${key}": ${detail}`);
      }
    }
  );

  // ------------------------------------------------------------------------
  // Resource: index context
  // ------------------------------------------------------------------------
  server.registerResource(
    "context",
    "knowledge://context",
    {
      title: "Knowledge Base Context",
      description: "The Azure AI Search index and auth status.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const notReady = await checkAuth();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text:
              `Endpoint: ${ENDPOINT || "(not set)"}\n` +
              `Index: ${INDEX || "(not set)"}\n` +
              `Auth: ${API_KEY ? "api-key" : "managed identity / az login"}\n` +
              `Semantic: ${SEMANTIC_CONFIG ? SEMANTIC_CONFIG : "off"}\n` +
              (notReady ? `Hint: ${notReady}` : "Ready to search."),
          },
        ],
      };
    }
  );

  // ------------------------------------------------------------------------
  // Prompt: grounded answer
  // ------------------------------------------------------------------------
  server.registerPrompt(
    "rag-answer",
    {
      title: "Answer from the knowledge base",
      description: "Retrieve relevant passages and answer with citations.",
      argsSchema: {
        question: z.string().describe("The question to answer."),
      },
    },
    ({ question }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Use search_knowledge to find passages relevant to: "${question}". Then answer the question using only those passages, and cite the source titles you relied on. If nothing relevant is found, say so.`,
          },
        },
      ],
    })
  );

  return server;
}
