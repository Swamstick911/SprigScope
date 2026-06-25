#!/usr/bin/env bash
# Publish the virtual Sprig web app to Vercel.
#
# We build locally and ship the finished static output with `--prebuilt`, which
# skips Vercel's remote install/build step entirely. The web app is a plain
# static SPA (everything is bundled by Vite), so there's nothing for the server
# side to do — and it sidesteps the monorepo install quirks we hit going the
# git-integration route.
#
# Usage: npm run deploy   (runs this; deploys to production)

set -euo pipefail

npm run build -w @sprigscope/web

rm -rf .vercel/output
mkdir -p .vercel/output/static
cp -r apps/web/dist/. .vercel/output/static/
printf '{"version":3}\n' > .vercel/output/config.json

vercel deploy --prebuilt --prod
