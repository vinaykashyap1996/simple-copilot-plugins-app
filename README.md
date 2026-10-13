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
3. Use `https://github.com/vinaykashyap1996/simple-copilot-plugins-app` in
   compatible Copilot plugin/marketplace settings.

### Marketplace troubleshooting

The marketplace source must be a **repository URL**, not a browser page or file
mention. Do not use URLs ending in `/tree/*`, `/blob/*`, or `/files/*`, or a
reference such as `@vinaykashyap1996/simple-copilot-plugins-app/files/...`.
These are not cloneable repository addresses. The `.git` suffix is valid for
Git clone-based clients; use the plain repository URL above in marketplace UIs.

If the client reports **“No plugins found”**, check that
`.github/plugin/marketplace.json` is present on the default branch (`master`).
Merge this compatibility fix into `master` before retrying the repository URL,
then refresh the marketplace catalog. The catalog uses the
[documented marketplace format](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-marketplace):
`name`, `owner`, `metadata`, and plugin entries with repository-root-relative
`source` paths (not the old custom `id`/`path` fields).

### Verification

From a local checkout, validate JSON, metadata, and plugin source directories:

```sh
bash scripts/validate-plugins.sh
node --test scripts/validate-plugins.test.js
```

After the fix is merged into `master`, register and browse it with Copilot CLI:

```sh
copilot plugin marketplace add vinaykashyap1996/simple-copilot-plugins-app
copilot plugin marketplace list
copilot plugin marketplace browse simple-copilot-plugins-app
copilot plugin install skill-summarizer@simple-copilot-plugins-app
copilot plugin list
```

Browsing should list `skill-summarizer`, `agent-triage`, and `mcp-local-tools`.
For an already registered marketplace, run
`copilot plugin marketplace update simple-copilot-plugins-app` before browsing.
To test an unmerged checkout locally, use `copilot plugin marketplace add .`
instead of the GitHub source.

### Plugin layout

Each catalog `source` points to a plugin directory containing `plugin.json`.
Plugin names match the catalog's kebab-case names. Component paths are relative
to that plugin directory, following the
[Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference):

- Skills: `skills/<skill-name>/SKILL.md` with `name` and `description` frontmatter.
- Agents: `agents/*.agent.md` with `name` and `description` frontmatter.
- MCP: `mcpServers` in `plugin.json`; this sample uses
  `${PLUGIN_ROOT}/mcp/server.js` so it works outside the repository workspace.
  `mcp/server.json` remains a manual, repository-workspace configuration example.
- Prompts, scripts, and references remain supporting sample assets; they are not
  automatically registered as standalone plugin components.

The local-tools MCP server requires Node.js 18+ and no dependencies. Its default
file-access root is `plugins/mcp-local-tools`; broader workspace access requires
an explicit `--root` argument. From the repository workspace, run its protocol
and safety smoke tests with:

```sh
node --test plugins/mcp-local-tools/scripts/smoke-test.js
```

## Notes

Support for marketplace URLs and plugin component types varies by client (VS Code, Copilot CLI, Copilot app). See GitHub docs for current compatibility.
