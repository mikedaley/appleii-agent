#!/usr/bin/env bash

npm install
npm exec --yes -- @anthropic-ai/mcpb pack
npm publish --access public

