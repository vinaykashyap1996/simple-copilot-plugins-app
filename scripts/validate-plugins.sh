#!/usr/bin/env bash
set -euo pipefail

echo "Validating plugin descriptors..."
find plugins -name plugin.json -type f -print
