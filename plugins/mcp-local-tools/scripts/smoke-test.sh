#!/usr/bin/env bash
set -euo pipefail

echo "Running MCP local-tools smoke check..."
node plugins/mcp-local-tools/mcp/server.js
