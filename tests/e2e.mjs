import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const worktree = mkdtempSync(join(tmpdir(), "pi-web-access-lazy-"));
const logPath = join(worktree, "requests.jsonl");
const model = process.env.PI_WEB_LAZY_E2E_MODEL ??
  "openai-codex/gpt-5.6-sol";

const result = spawnSync("pi", [
  "--no-session",
  "--no-extensions",
  "--no-skills",
  "--no-prompt-templates",
  "--no-context-files",
  "-e",
  root,
  "-e",
  join(root, "tests/e2e-observer.ts"),
  "--model",
  model,
  "--thinking",
  "minimal",
  "-p",
  "Call load_web_tools exactly once. Do not call any other tool. After it succeeds, reply exactly E2E_OK.",
], {
  cwd: worktree,
  encoding: "utf8",
  env: {
    ...process.env,
    PI_WEB_LAZY_E2E_LOG: logPath,
  },
  timeout: 180_000,
});

try {
  assert.equal(
    result.status,
    0,
    `pi failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  const requests = readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const loadedIndex = requests.findIndex(
    (request) => request.loadedTools.length > 0,
  );

  assert.ok(loadedIndex > 0, "no deferred tool_search_output was observed");

  const initial = requests[0];
  const loaded = requests[loadedIndex];
  assert.ok(initial.topLevelTools.includes("load_web_tools"));
  assert.equal(initial.hasWebPromptSnippet, false);
  assert.equal(loaded.hasWebPromptSnippet, false);
  assert.equal(loaded.instructionsHash, initial.instructionsHash);
  assert.deepEqual(loaded.topLevelTools, initial.topLevelTools);
  assert.ok(loaded.loadedTools.includes("web_search"));
  assert.ok(loaded.loadedTools.includes("fetch_content"));

  console.log(
    `e2e: passed (${requests.length} requests; loaded ${loaded.loadedTools.join(", ")})`,
  );
} finally {
  rmSync(worktree, { recursive: true, force: true });
}
