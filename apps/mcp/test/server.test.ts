import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PNG } from 'pngjs';
import { EngineBackend } from '@sprigscope/core';
import { createSprigMcpServer } from '../src/server';

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
  const server = createSprigMcpServer(new EngineBackend());
  const client = new Client({ name: 'test', version: '0.0.0' });
  await server.connect(serverT);
  await client.connect(clientT);
  return client;
}

describe('SprigScope MCP server', () => {
  it('exposes the expected tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['get_screen', 'get_state', 'get_status', 'load_game', 'press_button', 'reset']);
  });

  it('loads a game, reports state, and presses buttons', async () => {
    const client = await connect();

    await client.callTool({ name: 'load_game', arguments: { source: GAME } });

    const state1 = JSON.parse(((await client.callTool({ name: 'get_state', arguments: {} })).content as any)[0].text);
    expect(state1.dimensions).toEqual({ width: 10, height: 8 });
    expect(state1.sprites).toContainEqual({ type: 'r', x: 0, y: 0 });

    await client.callTool({ name: 'press_button', arguments: { button: 'd' } });

    const state2 = JSON.parse(((await client.callTool({ name: 'get_state', arguments: {} })).content as any)[0].text);
    expect(state2.sprites).toContainEqual({ type: 'r', x: 1, y: 0 }); // moved right
  });

  it('returns a valid PNG screenshot', async () => {
    const client = await connect();
    await client.callTool({ name: 'load_game', arguments: { source: GAME } });
    const res = await client.callTool({ name: 'get_screen', arguments: {} });
    const img = (res.content as any)[0];
    expect(img.type).toBe('image');
    expect(img.mimeType).toBe('image/png');
    const png = PNG.sync.read(Buffer.from(img.data, 'base64'));
    expect(png.width).toBe(640);
    expect(png.height).toBe(512);
  });

  it('reports a clear error for broken game source', async () => {
    const client = await connect();
    const res = await client.callTool({ name: 'load_game', arguments: { source: 'not ( valid js' } });
    expect(res.isError).toBe(true);
    expect(((res.content as any)[0].text as string)).toMatch(/Failed to load game/);
  });
});
