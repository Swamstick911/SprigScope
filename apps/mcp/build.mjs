import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: 'dist/index.js',
  // Bundled CommonJS deps (e.g. pngjs) call require() for Node built-ins; in an
  // ESM bundle that needs a real require, provided via createRequire.
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'module';\nconst require = createRequire(import.meta.url);",
  },
});

console.log('built dist/index.js');
