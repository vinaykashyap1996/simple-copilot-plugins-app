# Simple Copilot Plugins App

A marketplace-style repository for Copilot plugins, including skills, agents, MCP config, prompts, scripts, and references.

## Structure

- `.github/plugin/marketplace.json` — plugin marketplace catalog
- `plugins/skill-summarizer/` — sample skill plugin
- `plugins/agent-triage/` — sample custom agent plugin
- `plugins/mcp-local-tools/` — sample MCP plugin
- `shared/` — reusable prompts, scripts, and references

## Usage

1. Browse available plugins in `.github/plugin/marketplace.json`.
2. Open each plugin folder to view installation instructions and assets.
3. Use this repository URL in compatible Copilot plugin/marketplace settings.

## Notes

Support for marketplace URLs and plugin component types varies by client (VS Code, Copilot CLI, Copilot app). See GitHub docs for current compatibility.
