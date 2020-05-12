#!/usr/bin/env bash

set -x -e

npx tsc
npm run build:wasm
cp -r src/js lib/
