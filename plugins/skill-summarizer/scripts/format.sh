#!/usr/bin/env bash
set -euo pipefail

echo "Formatting plugin markdown files..."
find plugins/skill-summarizer -type f \( -name "*.md" -o -name "*.prompt.md" \) -print
