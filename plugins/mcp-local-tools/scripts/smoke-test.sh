#!/usr/bin/env bash
set -euo pipefail

node --test "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/smoke-test.js"
