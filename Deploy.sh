#!/usr/bin/env bash

npm install
npx --yes @anthropic-ai/mcpb pack
npm publish --access public

