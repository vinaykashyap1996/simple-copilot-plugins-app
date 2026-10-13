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
2. Open each plugin folder to view its assets. For the working local-tools MCP
   server, follow the [setup and safety guide](plugins/mcp-local-tools/README.md).
3. Use this repository URL in compatible Copilot plugin/marketplace settings.

The local-tools MCP server requires Node.js 18+ and no dependencies. Its default
file-access root is `plugins/mcp-local-tools`; broader workspace access requires
an explicit `--root` argument. From the repository workspace, run its protocol
and safety smoke tests with:

```sh
node --test plugins/mcp-local-tools/scripts/smoke-test.js
```

## Notes

Support for marketplace URLs and plugin component types varies by client (VS Code, Copilot CLI, Copilot app). See GitHub docs for current compatibility.
