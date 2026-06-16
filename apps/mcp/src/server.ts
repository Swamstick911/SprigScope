import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import type { SprigDevice } from '@sprigscope/core';
import { framebufferToPngBase64 } from './png.js';

const buttonEnum = z.enum(['w', 'a', 's', 'd', 'i', 'j', 'k', 'l']);

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const error = (t: string) => ({ isError: true, content: [{ type: 'text' as const, text: t }] });

/**
 * Build an MCP server that exposes a SprigDevice so an AI can observe and play it.
 * Transport-agnostic: pass the returned server a stdio or in-memory transport.
 */
export function createSprigMcpServer(device: SprigDevice): McpServer {
  const server = new McpServer({ name: 'sprigscope', version: '0.1.0' });

  server.registerTool(
    'get_screen',
    { description: 'Capture the current Sprig screen as a PNG image (160×128, upscaled 4×).' },
    async () => ({
      content: [
        { type: 'image' as const, data: framebufferToPngBase64(device.getFramebuffer()), mimeType: 'image/png' },
      ],
    }),
  );

  server.registerTool(
    'get_state',
    {
      description:
        'Get the symbolic game state (map dimensions, sprites with type+position, on-screen text). Cheaper and clearer for reasoning than the screen image.',
    },
    async () => {
      const st = device.getState?.() ?? null;
      if (st === null) return text('No symbolic state available (no game loaded, or a pixel-only backend).');
      return text(JSON.stringify(st, null, 2));
    },
  );

  server.registerTool(
    'press_button',
    {
      description: 'Press one Sprig button for a single input tick: w a s d (left pad) or i j k l (right pad).',
      inputSchema: { button: buttonEnum },
    },
    async ({ button }) => {
      device.pressButton(button);
      return text(`pressed ${button}`);
    },
  );

  server.registerTool(
    'load_game',
    {
      description: 'Load a Sprig game. Provide JS "source" inline, or a filesystem "path" to a .js file.',
      inputSchema: { source: z.string().optional(), path: z.string().optional() },
    },
    async ({ source, path }) => {
      const code = source ?? (path ? safeRead(path) : undefined);
      if (code === undefined) return error('Provide either "source" or a readable "path".');
      try {
        device.loadGame(code, path);
        return text('game loaded');
      } catch (e) {
        return error((e as Error).message);
      }
    },
  );

  server.registerTool('reset', { description: 'Reset the current game to its initial state.' }, async () => {
    device.reset();
    return text('reset');
  });

  server.registerTool('get_status', { description: 'Get device status (loaded, backend, title).' }, async () =>
    text(JSON.stringify(device.getStatus())),
  );

  return server;
}

function safeRead(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}
