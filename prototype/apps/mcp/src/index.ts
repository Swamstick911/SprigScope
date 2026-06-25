import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { EngineBackend } from '@sprigscope/core';
import { Rp2040Backend } from '@sprigscope/rp2040';
import { createSprigMcpServer } from './server.js';

// stdout is the MCP JSON-RPC channel — all logging must go to stderr.
const engine = new EngineBackend();
const server = createSprigMcpServer({ engine, makeChip: () => new Rp2040Backend() });
const transport = new StdioServerTransport();

await server.connect(transport);
console.error('SprigScope MCP server running on stdio (engine + chip backends).');
