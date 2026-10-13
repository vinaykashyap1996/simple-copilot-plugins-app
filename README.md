# Simple Copilot Plugins App

A marketplace-style repository for fullstack JavaScript workflows with GitHub Copilot and Claude. Includes existing Copilot samples and a multi-provider draft catalog of skills, prompts, MCP connections, instructions, agents, scripts, and references.

## Structure

- `.github/plugin/marketplace.json` — plugin marketplace catalog
- `plugins/skill-summarizer/` — sample skill plugin
- `plugins/agent-triage/` — sample custom agent plugin
- `plugins/mcp-local-tools/` — sample MCP plugin
- `shared/` — reusable prompts, scripts, and references
- `catalog/registry.json` — multi-provider browsing metadata and draft collections
- `catalog/index.html` — dependency-free catalog UI with type, provider, and bundle filters

## Draft catalog

From a checkout, serve the repository with a static HTTP server (for example,
`python3 -m http.server 8000 --bind 127.0.0.1` from the repository root), then open
`http://127.0.0.1:8000/catalog/`. Opening the HTML directly via `file://` does not
support loading the registry. No npm install or build is required.

The **Beautiful Website bundle** and **Fullstack JS bundle** are starter
collections, not installers. Framework/database integrations and automated
installation are future work. The existing Copilot marketplace and installation
commands below remain unchanged; drafts are deliberately excluded from it.

All 17 requested names are **draft / unverified placeholders**: code review,
ponztail, claude mem, obsidan skill, superpowers, remotion, strix, claude code setup,
taste skill, web design, guidlianve skill, awesome design, image to code,
plazwright cli, herder, graphifz, and task observer. Original spellings are
preserved; suggested roles, types, and bundle membership are provisional, not
claims about an upstream project.

### Registry schema and additions

`catalog/registry.json` is a versioned browsing registry, separate from the
Copilot client's `.github/plugin/marketplace.json` installation format:

- `schemaVersion`: currently `1`.
- `types`: allowed component types: `skills`, `prompts`, `mcp`, `instructions`,
  `agents`, `scripts`, `references`. A plugin can contain multiple types.
- `providers`: stable provider IDs mapped to display names (`github_copilot`,
  `claude`).
- `compatibilityStatuses`: `native` (works directly), `adapted` (requires
  documented adaptation), `unsupported` (known not to work), or `unverified`
  (not tested/confirmed). This is per plugin/provider, not a guarantee that every
  client supports every listed component.
- `plugins`: entries with unique kebab-case `id`, `name`, `description`, `types`,
  `status` (`draft` or `available`), `source`, and `compatibility`.
  `source` is `null` for drafts, or a local plugin directory relative to
  `catalog/` for available entries. `compatibility` must explicitly map every
  provider ID to a compatibility status.
- `bundles`: collections with unique `id`, `name`, `description`, `status`, and
  `pluginIds` referencing existing entries.

To add a plugin, append an entry using those fields and optionally include its
ID in a bundle. Start uncertain identities as `draft`, with `source: null` and
both providers `unverified`. Verify source, license, permissions, setup, and
provider behavior before marking it available or claiming native/adapted
compatibility; document any adaptation in the plugin's own guide. For a
verified local Copilot plugin, also follow the existing plugin layout and add it
to `.github/plugin/marketplace.json`.

Provider filters include **only native/adapted** entries. Choose “All providers /
unverified” to see wishlist entries. Existing sample plugins are native Copilot
entries; their Claude compatibility remains unverified. Browsing never executes
commands or installs anything.

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

### MCP startup troubleshooting

If `mcp-local-tools` logs `spawn node ENOENT` for `local-tools` (common in
VS Code with nvm-installed Node), update/reinstall the plugin: its MCP launch now
goes through a login shell so nvm's `node` is found. Then start a new chat
session and, in VS Code, run **MCP: List Servers** > `local-tools` > **Show
Output** to read the logs. Verify that `list_directory`, `read_text_file`, and
`grep_in_files` appear. See `plugins/mcp-local-tools/README.md` for the
absolute-node-path fallback.

### Verification

From a local checkout, validate JSON, metadata, and plugin source directories:

```sh
bash scripts/validate-plugins.sh
node --test scripts/validate-plugins.test.js
node --test scripts/catalog.test.js
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
