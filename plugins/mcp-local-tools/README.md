# Local Tools MCP

A dependency-free, read-only Node.js MCP server over stdio. Requires Node.js 18
or newer. It supports `initialize`, `notifications/initialized`, `ping`,
`tools/list`, and `tools/call`, with newline-delimited JSON-RPC 2.0 messages.
Stdout is reserved for protocol responses; startup failures go to stderr.
Supported protocol versions: `2024-11-05`, `2025-06-18`, and `2025-11-25`.
Other versions negotiate `2025-11-25`. The batch-requiring `2025-03-26` version
is not supported.

## Setup

When installed as a Copilot CLI plugin, `plugin.json` registers the server using
`${PLUGIN_ROOT}/mcp/server.js`, independent of the client's working directory.
Keep server code in `mcp/` and register additional servers in `mcpServers`.
The manual configuration below is separate from plugin installation.

Copy the `mcpServers` entry from `mcp/server.json` into a compatible MCP client's
configuration. That sample assumes the client launches Node from the repository
workspace directory. For other working directories, replace the script argument
with the **absolute path** to `plugins/mcp-local-tools/mcp/server.js` in your clone.
No `npm install` is needed. Client configuration formats vary; clients using
`servers` rather than `mcpServers` must adapt the outer key.

By default, the allowed root is this plugin directory, independent of the working
directory. To explicitly grant access to a repository workspace or a narrower
subtree, append `--root` and its absolute directory path to the Node arguments:

```sh
node /absolute/clone/plugins/mcp-local-tools/mcp/server.js --root /absolute/clone
```

The root is chosen only at startup, never by a tool call. Do not choose a home
directory or a directory containing credentials. These tools can read **all**
text files in the chosen root, including dotfiles.

## Tools

All arguments are required strings; extra arguments are rejected. Paths are
relative to the allowed root, or absolute paths within it. Use `.` for the root.

- `read_text_file({ "path": "plugin.json" })`: returns UTF-8 file content as MCP
  text. Rejects nonregular files, binary/invalid UTF-8 content, and files larger
  than 1 MiB. Empty files are valid.
- `list_directory({ "path": "." })`: returns JSON text with `entries` (name and
  type: `file`, `directory`, `symlink`, or `other`) and `truncated`. Lists immediate
  children only, sorts the returned entries, and stops at 1,000 entries.
- `grep_in_files({ "query": "MCP", "directory": "." })`: recursively searches for
  a case-sensitive **literal**, not a regex. Returns JSON text with `matches`
  (root-relative path, one-based line, text excerpt, `textTruncated`), `skipped`
  count, and `truncated`. Queries must be nonblank, single-line strings of at most
  1,024 characters. Returns one match per matching line; excerpts are capped at
  1,200 characters. Search skips symlinks, special files, inaccessible files,
  binary/invalid UTF-8 files, and files larger than 1 MiB.

Search stops at 100 matches, 100 attempted files, 1,000 examined entries, or 10 MiB
read, and does not descend beyond 32 directory levels. `truncated: true` means
results may be incomplete; traversal order is unspecified. `skipped` includes
entries that could not be searched. Directory listings and search do not hide
dotfiles or honor `.gitignore`.

## Safety and errors

Paths containing a `..` component, backslashes, control characters, or an
absolute path outside the root are rejected. Canonical paths are checked to
prevent symlink escapes. Direct calls may follow symlinks only when their targets
stay within the root; recursive search never intentionally follows symlinks.
Opened files must be regular files, and reads remain bounded even if files grow.

This is a basic local filesystem boundary, **not an OS sandbox**. Use a trusted
workspace: another process that can concurrently rename directories or change
symlinks can race path validation. Do not run against an adversarially writable
tree. Hard links are indistinguishable from ordinary files; the root must not
contain hard links to sensitive content.

Tool failures return MCP `isError: true` with a text explanation, without ending
the session. Invalid protocol requests return JSON-RPC errors. Requests are
limited to 64 KiB per line. Clients must complete the initialization handshake
before invoking tools. EOF closes the server.

## Smoke tests

From the repository workspace:

```sh
node --test plugins/mcp-local-tools/scripts/smoke-test.js
# Or:
bash plugins/mcp-local-tools/scripts/smoke-test.sh
```

The shell wrapper also works from other working directories. Tests spawn the
actual stdio server with timeouts, complete initialization, exercise all tools
and error responses, check traversal/symlink/binary/size restrictions and result
limits, then verify the sample configuration and default root. Fixtures live in
the OS temporary directory and are removed after testing.
