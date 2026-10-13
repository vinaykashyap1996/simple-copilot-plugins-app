"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const readline = require("node:readline");
const { test } = require("node:test");

const server = path.resolve(__dirname, "../mcp/server.js");
const workspace = path.resolve(__dirname, "../../..");

function client(t, args, cwd = os.tmpdir()) {
  const child = spawn(process.execPath, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
  const lines = readline.createInterface({ input: child.stdout });
  let pending;
  let stderr = "";
  let id = 0;
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  lines.on("line", (line) => {
    assert.ok(pending, `Unexpected stdout: ${line}`);
    const { resolve, timer } = pending;
    pending = undefined;
    clearTimeout(timer);
    resolve(JSON.parse(line));
  });
  child.on("error", (error) => {
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      pending = undefined;
    }
  });
  t.after(() => {
    if (pending) clearTimeout(pending.timer);
    lines.close();
    child.kill();
  });
  function raw(text) {
    return new Promise((resolve, reject) => {
      assert.equal(pending, undefined);
      const timer = setTimeout(() => {
        pending = undefined;
        reject(new Error(`MCP response timed out. stderr: ${stderr}`));
      }, 3000);
      pending = { resolve, reject, timer };
      child.stdin.write(text);
    });
  }
  return {
    child,
    raw,
    async request(method, params) {
      const requestId = ++id;
      const response = await raw(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`);
      assert.equal(response.jsonrpc, "2.0");
      assert.equal(response.id, requestId);
      return response;
    },
    async initialize(protocolVersion = "2025-11-25") {
      const response = await this.request("initialize", {
        protocolVersion, capabilities: {}, clientInfo: { name: "smoke-test", version: "1.0.0" }
      });
      assert.equal(response.result.protocolVersion, protocolVersion);
      assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
      child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    },
    async tool(name, args) {
      const response = await this.request("tools/call", { name, arguments: args });
      assert.ok(response.result);
      return response.result;
    },
    async close() {
      const closed = once(child, "close");
      child.stdin.end();
      const [code] = await closed;
      assert.equal(code, 0);
      assert.equal(stderr, "");
    }
  };
}

test("stdio MCP protocol, tools, and filesystem safety", { timeout: 20000 }, async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-local-tools-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, "assets");
  const outside = path.join(temporary, "assets-outside");
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(root, "nested"));
  fs.writeFileSync(path.join(root, "hello.txt"), "Hello café\nneedle [literal]\n");
  fs.writeFileSync(path.join(root, "nested", "match.txt"), "first\r\nneedle [literal]\r\n");
  fs.writeFileSync(path.join(root, "binary.dat"), Buffer.from([110, 0, 255]));
  fs.writeFileSync(path.join(root, "invalid-utf8.dat"), Buffer.from([255, 254]));
  fs.writeFileSync(path.join(root, "large.txt"), Buffer.alloc(1024 * 1024 + 1, 97));
  fs.writeFileSync(path.join(root, "empty.txt"), "");
  fs.writeFileSync(path.join(outside, "secret.txt"), "needle [literal] outside");
  fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "escape.txt"));
  fs.symlinkSync(outside, path.join(root, "escape-dir"), "dir");
  fs.symlinkSync(root, path.join(root, "loop"), "dir");
  fs.symlinkSync(path.join(root, "hello.txt"), path.join(root, "safe-link.txt"));
  const mcp = client(t, [server, "--root", root]);

  assert.equal((await mcp.request("tools/list")).error.code, -32600);
  await mcp.initialize();
  const catalog = (await mcp.request("tools/list")).result.tools;
  assert.deepEqual(catalog.map((tool) => tool.name), ["read_text_file", "list_directory", "grep_in_files"]);
  assert.deepEqual((await mcp.request("ping")).result, {});
  assert.equal((await mcp.request("unknown")).error.code, -32601);
  assert.equal((await mcp.request("tools/call", [])).error.code, -32602);
  assert.equal((await mcp.raw("not-json\n")).error.code, -32700);
  assert.equal((await mcp.raw('{"jsonrpc":"2.0","id":{},"method":"ping"}\n')).error.code, -32600);
  assert.equal((await mcp.raw(`${"x".repeat(64 * 1024 + 1)}\n`)).error.code, -32600);
  assert.deepEqual((await mcp.request("ping")).result, {});
  assert.equal((await mcp.request("initialize", {
    protocolVersion: "2025-11-25", capabilities: {}, clientInfo: {}
  })).error.code, -32602);
  const fragmented = Buffer.from('{"jsonrpc":"2.0","id":"café","method":"ping"}\n');
  const split = fragmented.indexOf(Buffer.from("é")) + 1;
  mcp.child.stdin.write(fragmented.subarray(0, split));
  const fragmentedResponse = await mcp.raw(fragmented.subarray(split));
  assert.equal(fragmentedResponse.id, "café");
  assert.deepEqual(fragmentedResponse.result, {});

  for (const file of ["hello.txt", path.join(root, "hello.txt"), "safe-link.txt"]) {
    const result = await mcp.tool("read_text_file", { path: file });
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].text, "Hello café\nneedle [literal]\n");
  }
  assert.equal((await mcp.tool("read_text_file", { path: "empty.txt" })).content[0].text, "");
  const listing = JSON.parse((await mcp.tool("list_directory", { path: "." })).content[0].text);
  assert.equal(listing.truncated, false);
  assert.ok(listing.entries.some((entry) => entry.name === "nested" && entry.type === "directory"));
  assert.ok(listing.entries.some((entry) => entry.name === "escape.txt" && entry.type === "symlink"));

  const found = JSON.parse((await mcp.tool("grep_in_files", {
    query: "needle [literal]", directory: "."
  })).content[0].text);
  assert.deepEqual(found.matches.map((match) => [match.path, match.line]).sort(),
    [["hello.txt", 2], ["nested/match.txt", 2]]);
  assert.equal(found.truncated, false);
  assert.ok(found.skipped >= 6);
  assert.equal(JSON.parse((await mcp.tool("grep_in_files", {
    query: "not present", directory: "."
  })).content[0].text).matches.length, 0);

  for (const file of ["../assets-outside/secret.txt", "nested/../hello.txt", "../assets/hello.txt",
    path.join(outside, "secret.txt"), "escape.txt", "escape-dir/secret.txt",
    "binary.dat", "invalid-utf8.dat", "large.txt", "nested", "missing", "", "\0", "..\\hello.txt"]) {
    assert.equal((await mcp.tool("read_text_file", { path: file })).isError, true, file);
  }
  for (const args of [{}, { path: 42 }, { path: "hello.txt", extra: true },
    JSON.parse('{"path":"hello.txt","__proto__":{}}')]) {
    assert.equal((await mcp.tool("read_text_file", args)).isError, true);
  }
  assert.equal((await mcp.tool("unknown", {})).isError, true);
  for (const target of ["hello.txt", "escape-dir", outside, "../assets-outside"]) {
    assert.equal((await mcp.tool("list_directory", { path: target })).isError, true);
    assert.equal((await mcp.tool("grep_in_files", { query: "needle", directory: target })).isError, true);
  }
  for (const query of ["", "x".repeat(1025), "\n", "\0", 1]) {
    assert.equal((await mcp.tool("grep_in_files", { query, directory: "." })).isError, true);
  }
  fs.mkdirSync(path.join(root, "many"));
  for (let i = 0; i < 1001; i++) fs.writeFileSync(path.join(root, "many", `${i}.txt`), "");
  const many = JSON.parse((await mcp.tool("list_directory", { path: "many" })).content[0].text);
  assert.equal(many.entries.length, 1000);
  assert.equal(many.truncated, true);
  const bounded = JSON.parse((await mcp.tool("grep_in_files", { query: "absent", directory: "many" })).content[0].text);
  assert.equal(bounded.truncated, true);
  fs.mkdirSync(path.join(root, "matches"));
  fs.writeFileSync(path.join(root, "matches", "many.txt"), "needle\n".repeat(101));
  const capped = JSON.parse((await mcp.tool("grep_in_files", { query: "needle", directory: "matches" })).content[0].text);
  assert.equal(capped.matches.length, 100);
  assert.equal(capped.truncated, true);
  fs.mkdirSync(path.join(root, "byte-limit"));
  for (let i = 0; i < 11; i++) {
    fs.writeFileSync(path.join(root, "byte-limit", `${i}.txt`), Buffer.alloc(1024 * 1024, 97));
  }
  const exact = await mcp.tool("read_text_file", { path: "byte-limit/0.txt" });
  assert.equal(exact.isError, undefined);
  assert.equal(exact.content[0].text.length, 1024 * 1024);
  const byteLimit = JSON.parse((await mcp.tool("grep_in_files", {
    query: "absent", directory: "byte-limit"
  })).content[0].text);
  assert.equal(byteLimit.truncated, true);
  let deep = path.join(root, "deep");
  fs.mkdirSync(deep);
  for (let i = 0; i < 34; i++) {
    deep = path.join(deep, "child");
    fs.mkdirSync(deep);
  }
  fs.writeFileSync(path.join(deep, "hidden.txt"), "needle");
  const depthLimit = JSON.parse((await mcp.tool("grep_in_files", {
    query: "needle", directory: "deep"
  })).content[0].text);
  assert.equal(depthLimit.truncated, true);
  assert.deepEqual(depthLimit.matches, []);
  await mcp.close();
});

test("sample config launches from workspace with plugin-only default root", { timeout: 10000 }, async (t) => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../mcp/server.json"), "utf8"));
  const entry = config.mcpServers["local-tools"];
  assert.equal(entry.command, "node");
  const mcp = client(t, entry.args, workspace);
  await mcp.initialize("2024-11-05");
  const descriptor = await mcp.tool("read_text_file", { path: "plugin.json" });
  assert.equal(JSON.parse(descriptor.content[0].text).name, "mcp-local-tools");
  assert.equal((await mcp.tool("read_text_file", { path: path.join(workspace, "README.md") })).isError, true);
  await mcp.close();
});

test("plugin config launches outside workspace with plugin-only default root", { timeout: 10000 }, async (t) => {
  const pluginRoot = path.resolve(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, "plugin.json"), "utf8"));
  const entry = manifest.mcpServers["local-tools"];
  assert.equal(entry.command, "node");
  assert.deepEqual(entry.args, ["${PLUGIN_ROOT}/mcp/server.js"]);
  const mcp = client(t, entry.args.map((arg) => arg.replace("${PLUGIN_ROOT}", pluginRoot)));
  await mcp.initialize();
  const descriptor = await mcp.tool("read_text_file", { path: "plugin.json" });
  assert.equal(JSON.parse(descriptor.content[0].text).name, "mcp-local-tools");
  assert.equal((await mcp.tool("read_text_file", { path: path.join(workspace, "README.md") })).isError, true);
  await mcp.close();
});

test("batch-requiring protocol version negotiates a supported version", { timeout: 10000 }, async (t) => {
  const mcp = client(t, [server]);
  const response = await mcp.request("initialize", {
    protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke-test", version: "1.0.0" }
  });
  assert.equal(response.result.protocolVersion, "2025-11-25");
  await mcp.close();
});
