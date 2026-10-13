"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_ENTRIES = 1000;
const MAX_SEARCH_BYTES = 10 * MAX_FILE_BYTES;
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const decoder = new TextDecoder("utf-8", { fatal: true });
let root;
let initialized = false;
let ready = false;

const tools = [
  {
    name: "read_text_file",
    description: "Read a UTF-8 text file (at most 1 MiB) inside the configured root.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", minLength: 1 } },
      required: ["path"],
      additionalProperties: false
    }
  },
  {
    name: "list_directory",
    description: "List immediate entries inside the root, without following symlinks (at most 1000 entries).",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", minLength: 1 } },
      required: ["path"],
      additionalProperties: false
    }
  },
  {
    name: "grep_in_files",
    description: "Recursively find case-sensitive literal text in UTF-8 files. Bounded search; skips symlinks, binary and large files.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 1024 },
        directory: { type: "string", minLength: 1 }
      },
      required: ["query", "directory"],
      additionalProperties: false
    }
  }
];

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function insideRoot(target) {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolvePath(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096 ||
      /[\x00-\x1f\\]/.test(value) || value.split("/").includes("..")) {
    throw new Error("Invalid path: use a nonempty path without '..', backslashes or control characters.");
  }
  const target = path.resolve(root, value);
  if (!insideRoot(target)) throw new Error("Path is outside the allowed root.");
  const real = fs.realpathSync(target);
  if (!insideRoot(real)) throw new Error("Symlink target is outside the allowed root.");
  return real;
}

function directory(value) {
  const target = resolvePath(value);
  if (!fs.statSync(target).isDirectory()) throw new Error("Path must be a directory.");
  return target;
}

function readText(target, budget = MAX_FILE_BYTES) {
  const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error("Path must be a regular file.");
    if (stat.size > MAX_FILE_BYTES) throw new Error("File exceeds the 1 MiB limit.");
    if (stat.size > budget) throw new Error("Search byte limit reached.");
    // Read one extra byte to detect files that grow after the size check.
    const buffer = Buffer.alloc(Math.min(MAX_FILE_BYTES, budget) + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > MAX_FILE_BYTES) throw new Error("File exceeds the 1 MiB limit.");
    if (length > budget) throw new Error("Search byte limit reached.");
    const bytes = buffer.subarray(0, length);
    if (bytes.includes(0)) return { binary: true, bytes: length };
    let text;
    try {
      text = decoder.decode(bytes);
    } catch {
      return { binary: true, bytes: length };
    }
    if (/[\x01-\x08\x0e-\x1f\x7f]/.test(text)) return { binary: true, bytes: length };
    return { text, bytes: length, binary: false };
  } finally {
    fs.closeSync(fd);
  }
}

function listDirectory(value) {
  const handle = fs.opendirSync(directory(value));
  const entries = [];
  let truncated = false;
  try {
    let entry;
    while ((entry = handle.readSync()) !== null) {
      if (entries.length === MAX_ENTRIES) {
        truncated = true;
        break;
      }
      entries.push({
        name: entry.name,
        type: entry.isSymbolicLink() ? "symlink" : entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other"
      });
    }
  } finally {
    handle.closeSync();
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { entries, truncated };
}

function grep(query, value) {
  const start = directory(value);
  const stack = [{ target: start, depth: 0 }];
  const matches = [];
  let entries = 0;
  let files = 0;
  let bytes = 0;
  let skipped = 0;
  let truncated = false;
  search: while (stack.length) {
    const { target, depth } = stack.pop();
    let handle;
    try {
      handle = fs.opendirSync(directory(target));
      let entry;
      while ((entry = handle.readSync()) !== null) {
        if (++entries > MAX_ENTRIES) {
          truncated = true;
          break search;
        }
        const child = path.join(target, entry.name);
        if (entry.isDirectory()) {
          if (depth >= 32) truncated = true;
          else stack.push({ target: child, depth: depth + 1 });
          continue;
        }
        if (!entry.isFile()) {
          skipped++;
          continue;
        }
        if (files >= 100 || bytes >= MAX_SEARCH_BYTES) {
          truncated = true;
          break search;
        }
        files++;
        let content;
        try {
          content = readText(resolvePath(child), MAX_SEARCH_BYTES - bytes);
        } catch (error) {
          if (error.message === "Search byte limit reached.") {
            truncated = true;
            break search;
          }
          skipped++;
          continue;
        }
        bytes += content.bytes;
        if (content.binary) {
          skipped++;
          continue;
        }
        const lines = content.text.split(/\r\n|\n|\r/);
        for (let i = 0; i < lines.length; i++) {
          const column = lines[i].indexOf(query);
          if (column === -1) continue;
          const offset = Math.max(0, column - 100);
          matches.push({
            path: path.relative(root, child).split(path.sep).join("/"),
            line: i + 1,
            text: lines[i].slice(offset, offset + 1200),
            textTruncated: offset > 0 || lines[i].length > offset + 1200
          });
          if (matches.length === 100) {
            truncated = true;
            break search;
          }
        }
      }
    } catch {
      skipped++;
    } finally {
      if (handle) handle.closeSync();
    }
  }
  return { matches, truncated, skipped };
}

function callTool(name, args) {
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) throw new Error("Unknown tool.");
  if (!object(args) || Object.keys(args).some((key) => !Object.hasOwn(tool.inputSchema.properties, key)) ||
      tool.inputSchema.required.some((key) => typeof args[key] !== "string" || !args[key].trim())) {
    throw new Error("Invalid tool arguments: provide only the required nonempty string fields.");
  }
  if (name === "read_text_file") {
    const content = readText(resolvePath(args.path));
    if (content.binary) throw new Error("File is binary or is not valid UTF-8 text.");
    return content.text;
  }
  if (name === "list_directory") return JSON.stringify(listDirectory(args.path));
  if (args.query.length > 1024 || /[\x00\r\n]/.test(args.query)) {
    throw new Error("Query must be a single-line literal string of at most 1024 characters.");
  }
  return JSON.stringify(grep(args.query, args.directory));
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function dispatch(request) {
  if (!object(request) || request.jsonrpc !== "2.0" || typeof request.method !== "string" ||
      (Object.hasOwn(request, "id") && typeof request.id !== "string" &&
       !(typeof request.id === "number" && Number.isFinite(request.id)))) {
    return rpcError(null, -32600, "Invalid Request");
  }
  if (!Object.hasOwn(request, "id")) {
    if (request.method === "notifications/initialized" && initialized) ready = true;
    return null;
  }
  const { id, method } = request;
  const params = request.params === undefined ? {} : request.params;
  if (!object(params)) return rpcError(id, -32602, "Invalid params");
  let result;
  if (method === "initialize") {
    if (initialized || typeof params.protocolVersion !== "string" ||
        !object(params.capabilities) || !object(params.clientInfo)) {
      return rpcError(id, -32602, "Invalid initialization");
    }
    initialized = true;
    result = {
      protocolVersion: PROTOCOL_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "mcp-local-tools", version: "1.0.0" }
    };
  } else if (method === "ping") {
    result = {};
  } else if (method === "tools/list" || method === "tools/call") {
    if (!ready) return rpcError(id, -32600, "Complete initialization before using tools.");
    if (method === "tools/list") result = { tools };
    else {
      if (typeof params.name !== "string") return rpcError(id, -32602, "Tool name must be a string.");
      try {
        result = { content: [{ type: "text", text: callTool(params.name, params.arguments) }] };
      } catch (error) {
        const message = error.code ? "File access failed (missing, inaccessible, or unsafe path)." : error.message;
        result = { isError: true, content: [{ type: "text", text: message }] };
      }
    }
  } else {
    return rpcError(id, -32601, "Method not found");
  }
  return { jsonrpc: "2.0", id, result };
}

async function send(response) {
  if (response) {
    await new Promise((resolve, reject) => {
      process.stdout.write(`${JSON.stringify(response)}\n`, (error) => error ? reject(error) : resolve());
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--root")) {
    throw new Error("Usage: node server.js [--root /absolute/allowed/directory]");
  }
  if (args.length && !path.isAbsolute(args[1])) throw new Error("--root must be an absolute directory path.");
  root = fs.realpathSync(args[1] || path.resolve(__dirname, ".."));
  if (!fs.statSync(root).isDirectory()) throw new Error("Root must be a directory.");
  let pending = Buffer.alloc(0);
  let oversized = false;
  for await (const chunk of process.stdin) {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline === -1 ? chunk.length : newline;
      const part = chunk.subarray(offset, end);
      if (!oversized) {
        if (pending.length + part.length > MAX_REQUEST_BYTES) {
          oversized = true;
          pending = Buffer.alloc(0);
        } else pending = Buffer.concat([pending, part]);
      }
      if (newline === -1) break;
      if (oversized) await send(rpcError(null, -32600, "Request exceeds the 64 KiB limit."));
      else {
        let request;
        try {
          request = JSON.parse(decoder.decode(pending));
        } catch {
          await send(rpcError(null, -32700, "Parse error"));
        }
        if (request !== undefined) await send(dispatch(request));
      }
      pending = Buffer.alloc(0);
      oversized = false;
      offset = newline + 1;
    }
  }
  if (pending.length || oversized) await send(rpcError(null, -32700, "Incomplete JSON-RPC line at EOF."));
}

main().catch(() => {
  process.stderr.write("MCP server failed: check startup arguments, root access, and stdio transport.\n");
  process.exitCode = 1;
});
