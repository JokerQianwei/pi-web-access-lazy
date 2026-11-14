import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ObjectValue = Record<string, unknown>;

function objects(value: unknown): ObjectValue[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ObjectValue =>
      typeof item === "object" && item !== null,
  );
}

function toolNames(value: unknown): string[] {
  return objects(value)
    .map((tool) => tool.name)
    .filter((name): name is string => typeof name === "string");
}

export default function observeRequests(pi: ExtensionAPI): void {
  const logPath = process.env.PI_WEB_LAZY_E2E_LOG;
  if (!logPath) throw new Error("PI_WEB_LAZY_E2E_LOG is required");

  // 对照实验只在此测试扩展里选择搜索路径，生产扩展保持通道策略。
  pi.on("before_agent_start", (_event, ctx) => {
    const model = ctx.model;
    if (process.env.PI_WEB_LAZY_E2E_SEARCH === "1" && model?.provider === "openai-codex") {
      const compat = { ...model.compat, supportsAdditionalTools: false, supportsToolSearch: true };
      model.compat = compat;
    }
  });

  pi.on("before_provider_request", (event) => {
    const payload = event.payload as ObjectValue;
    const instructions =
      typeof payload.instructions === "string" ? payload.instructions : "";
    const loadedTools = objects(payload.input)
      .filter((item) => item.type === "tool_search_output")
      .flatMap((item) => toolNames(item.tools));

    appendFileSync(logPath, `${JSON.stringify({
      instructionsHash: createHash("sha256")
        .update(instructions)
        .digest("hex"),
      hasWebPromptSnippet: /(?:^|\n)- (?:web_search|source_check|fetch_content|get_search_content):/.test(
        instructions,
      ),
      topLevelTools: objects(payload.tools).flatMap(tool =>
        typeof tool.name === "string" ? [tool.name] : toolNames([tool.function])),
      loadedTools,
      hasAdditionalTools: objects(payload.input).some(item => item.type === "additional_tools"),
    })}\n`);
    // 对照实验可固定路由键；两种路径取值相同，缓存效果仍以服务端 usage 为准。
    if (process.env.PI_WEB_LAZY_E2E_CACHE_KEY) {
      return { ...payload, prompt_cache_key: process.env.PI_WEB_LAZY_E2E_CACHE_KEY };
    }
  });
  pi.on("message_end", (event) => {
    if (event.message.role === "assistant") {
      appendFileSync(`${logPath}.usage`, `${JSON.stringify({
        model: event.message.model, usage: event.message.usage,
        stopReason: event.message.stopReason,
      })}\n`);
    }
  });
}
