// 从真实 Pi RPC 入口验证多轮加载、实际工具调用和缓存延续；日志只记录结构和 usage。
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const worktree = mkdtempSync(join(tmpdir(), "pi-web-access-lazy-"));
const logPath = process.env.PI_WEB_LAZY_E2E_LOG ?? join(worktree, "requests.jsonl");
const model = process.env.PI_WEB_LAZY_E2E_MODEL ?? "openai-codex/gpt-6.1-sol";
const upfront = /^(tencent-intranet|codebuddy)\//.test(model);
const native = /^openai-codex\/(gpt-6.1-sol|gpt-6-astra)$/.test(model);
const child = spawn(process.env.PI_WEB_LAZY_E2E_CLI ?? "pi", [
  "--mode", "rpc", "--no-session", "--no-extensions", "--no-skills",
  "--no-prompt-templates", "--no-context-files",
  "-e", process.env.PI_WEB_LAZY_E2E_EXTENSION ?? root,
  "-e", join(root, "tests/e2e-observer.ts"),
  "--model", model, "--thinking", "minimal",
  // 合成固定前缀超过缓存阈值，避免因默认提示词过短得出缓存结论。
  "--system-prompt", "Follow the user exactly. Reply briefly.\n" +
    Array.from({ length: 120 }, (_, i) => `Cache fixture ${i}: stable synthetic context for web tool activation.`).join("\n"),
], { cwd: worktree, env: { ...process.env, PI_WEB_LAZY_E2E_LOG: logPath }, stdio: ["pipe", "pipe", "pipe"] });
const lines = createInterface({ input: child.stdout });
let pending;
let stderr = "";
const messages = [];
child.stderr.on("data", chunk => { stderr += chunk; });
lines.on("line", line => {
  const event = JSON.parse(line);
  if (event.type === "message_end" && event.message.role === "assistant") {
    messages.push(event.message);
    if (["error", "aborted"].includes(event.message.stopReason)) {
      pending?.reject(new Error(event.message.errorMessage));
    }
  }
  if (event.type === "agent_settled") pending?.resolve();
  if (event.type === "response" && event.success === false) pending?.reject(new Error(JSON.stringify(event)));
});
child.on("exit", code => pending?.reject(new Error(`Pi exited ${code}: ${stderr}`)));

// 每轮等待 agent_settled，确保加载前至少有一轮可比较的缓存读取。
async function prompt(message) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Pi timed out: ${stderr}`)), 120_000);
    pending = { resolve: () => { clearTimeout(timeout); resolve(); }, reject: error => { clearTimeout(timeout); reject(error); } };
    child.stdin.write(JSON.stringify({ type: "prompt", message }) + "\n");
  });
  pending = undefined;
}

try {
  const fixture = process.env.PI_WEB_LAZY_E2E_LARGE
    ? Array.from({ length: 1900 }, (_, i) =>
      `Reference ${i}: stable synthetic background; preserve this text without processing. Alpha beta gamma delta epsilon zeta eta theta.\n`).join("")
    : "";
  await prompt(fixture + "\nDo not call tools. Reply exactly WARM_ONE.");
  await new Promise(resolve => setTimeout(resolve, 2000));
  await prompt("Do not call tools. Reply exactly WARM_TWO.");
  if (!messages.at(-1).usage.cacheRead) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    await prompt("Do not call tools. Reply exactly WARM_THREE.");
  }
  const beforeLoad = messages.length;
  await prompt("Call load_web_tools exactly once and no other tools. Then reply LOADED.");
  const afterLoad = messages.length;
  await prompt("Call fetch_content once with url https://example.com and mode raw. Do not use other tools. Then reply DONE.");
  const requests = readFileSync(logPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const initial = requests[0];
  assert.equal(initial.topLevelTools.includes("fetch_content"), upfront);
  assert.ok(messages.slice(beforeLoad, afterLoad).some(m => m.content.some(c => c.name === "load_web_tools")));
  assert.ok(messages.slice(afterLoad).some(m => m.content.some(c => c.name === "fetch_content")));
  const warm = messages[beforeLoad - 1].usage.cacheRead;
  console.log(JSON.stringify({ model, cacheRead: messages.map(m => m.usage.cacheRead),
    totalInput: messages.map(m => m.usage.input + m.usage.cacheRead + m.usage.cacheWrite),
    costUsd: messages.reduce((total, m) => total + m.usage.cost.total, 0),
    requests: requests.length, additionalTools: requests.some(r => r.hasAdditionalTools),
    searchOutput: requests.some(r => r.loadedTools.length > 0) }));
  assert.ok(warm > 0,
    `warm round must read cache: ${JSON.stringify(messages.map(m => m.usage))}`);
  if (native || upfront) {
    for (const message of messages.slice(beforeLoad)) {
      assert.ok(message.usage.cacheRead >= warm,
        `cache prefix lost: ${JSON.stringify(message.usage)}`);
    }
    for (const request of requests) assert.deepEqual(request.topLevelTools, initial.topLevelTools);
  }
  if (native) {
    assert.ok(requests.some(r => r.loadedTools.includes("fetch_content") || r.hasAdditionalTools));
    assert.ok(requests.every(r => r.instructionsHash === initial.instructionsHash));
  }
} finally {
  child.kill();
  lines.close();
  rmSync(worktree, { recursive: true, force: true });
}
