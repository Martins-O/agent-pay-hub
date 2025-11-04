#!/usr/bin/env bash
set -euo pipefail
node --import data:text/javascript,import%20{register}%20from%20'node:module';import%20{pathToFileURL}%20from%20'node:url';register('ts-node/esm',%20pathToFileURL('./')); packages/server/scripts/dev.ts
