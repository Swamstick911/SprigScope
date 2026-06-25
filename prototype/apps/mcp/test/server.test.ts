import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PNG } from 'pngjs';
import { EngineBackend } from '@sprigscope/core';
import { Rp2040Backend } from '@sprigscope/rp2040';
import { createSprigMcpServer } from '../src/server';

const STOCK_FW = fileURLToPath(new URL('../../../firmware/pico-os.uf2', import.meta.url));

const GAME = `
const r = bitmap\`
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333\`;
setLegend(['r', r]);
setMap(map\`
r.........
..........
..........
..........
..........
..........
..........
..........\`);
onInput('d', () => { getFirst('r').x += 1; });
`;

async function connect() {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createSprigMcpServer({ engine: new EngineBackend(), makeChip: () => new Rp2040Backend() });
  const client = new Client({ name: 'test', version: '0.0.0' });
  await server.connect(serverT);
  await client.connect(clientT);
  return client;
}
const textOf = (res: any) => res.content[0].text as string;

describe('SprigScope MCP server', () => {
  it('exposes the expected tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_screen', 'get_state', 'get_status', 'load_firmware', 'load_game', 'press_button', 'reset',
    ]);
  });

  it('loads a game, reports state, and presses buttons (engine backend)', async () => {
    const client = await connect();
    await client.callTool({ name: 'load_game', arguments: { source: GAME } });

    const state1 = JSON.parse(textOf(await client.callTool({ name: 'get_state', arguments: {} })));
    expect(state1.dimensions).toEqual({ width: 10, height: 8 });
    expect(state1.sprites).toContainEqual({ type: 'r', x: 0, y: 0 });

    await client.callTool({ name: 'press_button', arguments: { button: 'd' } });
    const state2 = JSON.parse(textOf(await client.callTool({ name: 'get_state', arguments: {} })));
    expect(state2.sprites).toContainEqual({ type: 'r', x: 1, y: 0 });
  });

  it('returns a valid PNG screenshot', async () => {
    const client = await connect();
    await client.callTool({ name: 'load_game', arguments: { source: GAME } });
    const img = (await client.callTool({ name: 'get_screen', arguments: {} })).content as any;
    expect(img[0].type).toBe('image');
    const png = PNG.sync.read(Buffer.from(img[0].data, 'base64'));
    expect(png.width).toBe(640);
    expect(png.height).toBe(512);
  });

  it('boots a raw firmware image via the chip backend (load_firmware)', async () => {
    const client = await connect();
    const res = await client.callTool({ name: 'load_firmware', arguments: { path: STOCK_FW } });
    expect(textOf(res)).toMatch(/chip backend/);
    const status = JSON.parse(textOf(await client.callTool({ name: 'get_status', arguments: {} })));
    expect(status.backend).toBe('rp2040');
    // the firmware drew its boot screen
    const png = PNG.sync.read(Buffer.from(((await client.callTool({ name: 'get_screen', arguments: {} })).content as any)[0].data, 'base64'));
    expect(png.width).toBe(640);
  });

  it('reports a clear error for broken game source', async () => {
    const client = await connect();
    const res = await client.callTool({ name: 'load_game', arguments: { source: 'not ( valid js' } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/Failed to load game/);
  });
});
