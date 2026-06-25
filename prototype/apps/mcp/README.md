# @sprigscope/mcp

An MCP server that exposes a headless Sprig device so an AI (Claude, or any MCP
client) can observe the screen and play Sprig games autonomously.

## Tools

| Tool | Args | Returns |
|------|------|---------|
| `get_screen` | — | the current screen as a PNG (160×128, upscaled 4×) |
| `get_state` | — | symbolic state: map dimensions, sprites (`type`,`x`,`y`), on-screen text |
| `press_button` | `button` (`w a s d i j k l`) | presses for one input tick |
| `load_game` | `source` (JS) **or** `path` (.js file) | loads a game |
| `reset` | — | resets the current game |
| `get_status` | — | `{ running, loaded, backend, title }` |

`get_state` is far cheaper for reasoning than the screen image — prefer it, and
use `get_screen` when you need to actually see pixels.

## Build & run

```bash
npm install
npm run build -w @sprigscope/mcp   # bundles to apps/mcp/dist/index.js
node apps/mcp/dist/index.js        # speaks MCP over stdio
```

## Use with Claude Code / Desktop

Add a project-scoped `.mcp.json` in the repo root (Claude Code) or the equivalent
entry in your client's MCP config:

```json
{
  "mcpServers": {
    "sprigscope": { "command": "node", "args": ["apps/mcp/dist/index.js"] }
  }
}
```

Typical autonomous loop: `load_game` → `get_state` / `get_screen` → `press_button` → repeat.
