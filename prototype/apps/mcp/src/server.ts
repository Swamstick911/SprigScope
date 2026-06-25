import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import type { SprigDevice } from '@sprigscope/core';
import { framebufferToPngBase64 } from './png.js';

const buttonEnum = z.enum(['w', 'a', 's', 'd', 'i', 'j', 'k', 'l']);

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const error = (t: string) => ({ isError: true, content: [{ type: 'text' as const, text: t }] });

/** A backend that can also boot raw firmware images (the rp2040 chip backend). */
export interface ChipBackend extends SprigDevice {
  loadFirmware(uf2: Uint8Array, title?: string): void;
}

export interface SprigMcpDeps {
  /** Default backend: runs Sprig game JS. */
  engine: SprigDevice;
  /** Optional factory for the hardware (rp2040) backend, enabling load_firmware. */
  makeChip?: () => ChipBackend;
}

/**
 * Build an MCP server exposing a SprigDevice (and, if provided, a chip backend) so
 * an AI can observe and drive it. Accepts either a bare device or {engine, makeChip}.
 */
export function createSprigMcpServer(deps: SprigDevice | SprigMcpDeps): McpServer {
  const isDeps = (d: SprigDevice | SprigMcpDeps): d is SprigMcpDeps =>
    (d as SprigMcpDeps).engine !== undefined;
  const engine = isDeps(deps) ? deps.engine : deps;
  const makeChip = isDeps(deps) ? deps.makeChip : undefined;

  let current: SprigDevice = engine;
  const server = new McpServer({ name: 'sprigscope', version: '0.1.0' });

  server.registerTool(
    'get_screen',
    { description: 'Capture the current Sprig screen as a PNG image (160×128, upscaled 4×).' },
    async () => ({
      content: [
        { type: 'image' as const, data: framebufferToPngBase64(current.getFramebuffer()), mimeType: 'image/png' },
      ],
    }),
  );

  server.registerTool(
    'get_state',
    {
      description:
        'Get the symbolic game state (map dimensions, sprites with type+position, on-screen text). Engine backend only; cheaper than the screen image.',
    },
    async () => {
      const st = current.getState?.() ?? null;
      if (st === null) return text('No symbolic state available (no game loaded, or the firmware/chip backend is active — use get_screen).');
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
      current.pressButton(button);
      return text(`pressed ${button}`);
    },
  );

  server.registerTool(
    'load_game',
    {
      description: 'Load a Sprig game (engine backend). Provide JS "source" inline, or a "path" to a .js file.',
      inputSchema: { source: z.string().optional(), path: z.string().optional() },
    },
    async ({ source, path }) => {
      const code = source ?? (path ? safeRead(path) : undefined);
      if (code === undefined) return error('Provide either "source" or a readable "path".');
      try {
        current = engine;
        engine.loadGame(code, path);
        return text('game loaded (engine backend)');
      } catch (e) {
        return error((e as Error).message);
      }
    },
  );

  server.registerTool(
    'load_firmware',
    {
      description:
        'Boot a raw RP2040 firmware image (.uf2) on the hardware (chip) backend — runs ANY firmware/OS, not just Sprig games. Provide a "path" to the .uf2.',
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      if (!makeChip) return error('Firmware (chip) backend not available in this server build.');
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(readFileSync(path));
      } catch {
        return error(`Could not read firmware at "${path}".`);
      }
      try {
        const chip = makeChip();
        chip.loadFirmware(bytes, path);
        current = chip;
        return text('firmware booted (chip backend)');
      } catch (e) {
        return error((e as Error).message);
      }
    },
  );

  server.registerTool('reset', { description: 'Reset the current game/firmware to its initial state.' }, async () => {
    current.reset();
    return text('reset');
  });

  server.registerTool('get_status', { description: 'Get device status (loaded, backend, title).' }, async () =>
    text(JSON.stringify(current.getStatus())),
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
