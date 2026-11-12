import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  initialActiveTools,
  declaredToolNames,
  interceptToolRegistration,
  newlyAvailableTools,
  withoutPromptMetadata,
} from "../lazy.ts";

function tool(name = "web_search"): ToolDefinition {
  return {
    name,
    label: "Web Search",
    description: "Search the web",
    promptSnippet: "Use for web research.",
    promptGuidelines: ["Use web_search for current information."],
    parameters: Type.Object({}),
    async execute() {
      return { content: [{ type: "text", text: "ok" }], details: {} };
    },
  };
}

test("withoutPromptMetadata preserves the callable tool definition", () => {
  const definition = withoutPromptMetadata(tool());

  assert.equal(definition.name, "web_search");
  assert.equal(definition.description, "Search the web");
  assert.equal(definition.promptSnippet, undefined);
  assert.equal(definition.promptGuidelines, undefined);
  assert.equal(typeof definition.execute, "function");
});

test("interceptToolRegistration captures names and strips prompt metadata", () => {
  const registered: ToolDefinition[] = [];
  const pi = {
    registerTool(definition: ToolDefinition) {
      registered.push(definition);
    },
  } as unknown as ExtensionAPI;
  const deferred = new Set<string>();

  interceptToolRegistration(pi, deferred).registerTool(tool("fetch_content"));

  assert.deepEqual([...deferred], ["fetch_content"]);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].promptSnippet, undefined);
  assert.equal(registered[0].promptGuidelines, undefined);
});

test("initialActiveTools removes deferred tools without reordering others", () => {
  assert.deepEqual(
    initialActiveTools(
      ["read", "web_search", "bash", "fetch_content"],
      new Set(["web_search", "fetch_content"]),
      "load_web_tools",
    ),
    ["read", "bash", "load_web_tools"],
  );
});

test("newlyAvailableTools returns registered inactive tools in source order", () => {
  assert.deepEqual(
    newlyAvailableTools(
      ["read", "web_search"],
      new Set(["web_search", "source_check", "fetch_content"]),
      ["web_search", "source_check", "missing", "fetch_content"],
    ),
    ["source_check", "fetch_content"],
  );
});

const deferred = new Set(["custom_search", "fetch_content"]);
const refreshed = ["read", "custom_search", "bash", "fetch_content", "load_web_tools"];

// 模拟 registry 在 reload 时激活所有直接注册工具；历史声明决定网页工具子集。
function restore(branch: Parameters<typeof declaredToolNames>[0]) {
  return initialActiveTools(refreshed, deferred, "load_web_tools", declaredToolNames(branch));
}

test("fresh sessions and never-loaded reloads stay cold", () => {
  assert.deepEqual(restore([]), ["read", "bash", "load_web_tools"]);
  assert.deepEqual(restore([
    { type: "message", message: { role: "system", toolsAdded: [{ name: "read" }] } },
    { type: "message", message: { role: "user" } },
  ]), ["read", "bash", "load_web_tools"]);
});

test("loaded sessions restore the exact declared subset in active order", () => {
  assert.deepEqual(restore([
    { type: "message", message: { role: "system", toolsAdded: [{ name: "custom_search" }] } },
  ]), ["read", "custom_search", "bash", "load_web_tools"]);
});

test("declarations replay removals, re-additions and ignore non-system messages", () => {
  assert.deepEqual(restore([
    { type: "message", message: { role: "system", toolsAdded: [...deferred].map(name => ({ name })) } },
    { type: "message", message: { role: "system", toolsRemoved: [{ name: "custom_search" }, { name: "fetch_content" }] } },
    { type: "message", message: { role: "assistant", toolsAdded: [{ name: "fetch_content" }] } },
    { type: "message", message: { role: "system", toolsRemoved: [{ name: "custom_search" }], toolsAdded: [{ name: "custom_search" }] } },
  ]), ["read", "custom_search", "bash", "load_web_tools"]);
});

test("restoring an earlier branch excludes declarations on the abandoned branch", () => {
  const shared = { type: "message", message: { role: "system", toolsAdded: [{ name: "read" }] } };
  const loaded = { type: "message", message: { role: "system", toolsAdded: [{ name: "fetch_content" }] } };
  assert.deepEqual(restore([shared, loaded]), ["read", "bash", "fetch_content", "load_web_tools"]);
  assert.deepEqual(restore([shared]), ["read", "bash", "load_web_tools"]);
});
