import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { EngineBackend } from '@sprigscope/core';
import { createSprigMcpServer } from './server.js';

// stdout is the MCP JSON-RPC channel — all logging must go to stderr.
const device = new EngineBackend();
const server = createSprigMcpServer(device);
const transport = new StdioServerTransport();

await server.connect(transport);
console.error('SprigScope MCP server running on stdio.');
