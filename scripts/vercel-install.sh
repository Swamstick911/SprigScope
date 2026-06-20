#!/usr/bin/env bash
# Install dependencies for the Vercel build of @sprigscope/web.
#
# Vercel's build environment was installing only the dev dependency group and
# dropping every production dep (three, sprig, rp2040js, uf2), which broke the
# Vite build ("Rollup failed to resolve import 'three'"). We force a full
# install and print enough diagnostics to see exactly what npm is doing.

set -uo pipefail

rm -rf node_modules apps/*/node_modules packages/*/node_modules

echo "DIAG_NODE_ENV=[${NODE_ENV:-unset}]"
echo "DIAG_NPM_VERSION=$(npm --version)"
echo "DIAG_PROD=$(npm config get production 2>&1)"
echo "DIAG_OMIT=$(npm config get omit 2>&1)"
echo "DIAG_ONLY=$(npm config get only 2>&1)"
echo "--- npm config (env-derived included) ---"
npm config list 2>&1 | grep -iE 'omit|production|only|dev|include|node_env|; "' | head -30
echo "--- installing (forcing full dependency tree) ---"
NODE_ENV=development \
  npm_config_production=false \
  npm_config_only= \
  npm_config_omit= \
  npm_config_include=dev,optional \
  npm install --no-audit --no-fund

echo "DIAG_THREE=$([ -d node_modules/three ] && echo YES || echo NO)"
echo "DIAG_SPRIG=$([ -d node_modules/sprig ] && echo YES || echo NO)"
echo "DIAG_RP2040JS=$([ -d node_modules/rp2040js ] && echo YES || echo NO)"
echo "DIAG_COUNT=$(ls node_modules 2>/dev/null | wc -l)"
echo "DIAG_WEB_NM=$([ -d apps/web/node_modules ] && ls apps/web/node_modules | wc -l || echo none)"
