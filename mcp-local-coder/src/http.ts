#!/usr/bin/env node
/**
 * mcp-local-coder — HTTP entry point (Streamable HTTP transport)
 * -----------------------------------------------------------------------------
 * Serves the MCP server over HTTP so it can be hosted on Azure Container Apps.
 * Implements the Streamable HTTP transport with per-session server instances.
 *
 *   POST   /mcp   client -> server messages (initialize + subsequent calls)
 *   GET    /mcp   server -> client notifications (SSE stream)
 *   DELETE /mcp   explicit session termination
 *   GET    /health  liveness/readiness probe for Container Apps
 */

import "./telemetry.js";
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 3000);

/** Active transports keyed by MCP session ID. */
const transports: Record<string, StreamableHTTPServerTransport> = {};

const app = express();
app.use(express.json());

// Liveness/readiness probe.
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// Client -> server messages.
app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse the transport for an existing session.
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // Brand new session: create a transport and wire up a fresh server.
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    const server = createServer();
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: no valid session ID provided.",
      },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// Shared handler for GET (SSE) and DELETE (termination).
async function handleSessionRequest(
  req: Request,
  res: Response
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
}

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

app.listen(PORT, "0.0.0.0", () => {
  console.error(`mcp-local-coder HTTP transport listening on port ${PORT}`);
});
