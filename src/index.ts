#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  // stdout is reserved for MCP JSON-RPC — log only to stderr.
  console.error("event-live-mcp: starting (stdio)");
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("event-live-mcp: ready");
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`event-live-mcp: fatal: ${message}`);
  process.exit(1);
});
