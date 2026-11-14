// 按通道选择网页工具加载时机；仅包装上游注册，保留执行和分支恢复语义。
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import piWebAccess from "pi-web-access/index.ts";
import { Type } from "typebox";
import {
  initialActiveTools,
  interceptToolRegistration,
  newlyAvailableTools,
  declaredToolNames,
  webToolMode,
} from "./lazy.ts";

const LOADER_NAME = "load_web_tools";

// 只包装上游工具注册和激活时机，保留上游命令、配置及执行行为。
export default async function piWebAccessLazy(
  pi: ExtensionAPI,
): Promise<void> {
  const deferredTools = new Set<string>();
  await piWebAccess(interceptToolRegistration(pi, deferredTools));

  // 激活只追加缺少的网页工具，避免改变其他扩展的工具顺序。
  function activateWebTools(): string[] {
    const registered = new Set(pi.getAllTools().map((tool) => tool.name));
    const active = pi.getActiveTools();
    const added = newlyAvailableTools(active, registered, deferredTools);
    if (added.length > 0) pi.setActiveTools([...active, ...added]);
    return added;
  }

  pi.on("before_agent_start", (_event, ctx) => {
    const mode = webToolMode(ctx.model);
    // DMIT 保持查询前加载；upfront 同时覆盖运行前切换模型的场景。
    if (mode === "before-run" || mode === "upfront") activateWebTools();
  });

  pi.on("model_select", (event) => {
    if (webToolMode(event.model) === "upfront") activateWebTools();
  });

  pi.registerTool({
    name: LOADER_NAME,
    label: "Load Web Tools",
    description:
      "Enable pi-web-access tools for web search, source verification, URL fetching, and stored web content retrieval.",
    promptSnippet:
      "Enable web tools before searching, verifying claims, fetching URLs, or retrieving stored web content.",
    parameters: Type.Object({}),
    async execute() {
      const added = activateWebTools();

      return {
        content: [{
          type: "text" as const,
          text: added.length > 0
            ? `Loaded web tools: ${added.join(", ")}`
            : "Web tools are already loaded.",
        }],
        details: { added },
      };
    },
  });

  pi.on("session_start", (_event, ctx) => {
    const registered = new Set(pi.getAllTools().map((tool) => tool.name));
    pi.setActiveTools(initialActiveTools(
      pi.getActiveTools(),
      deferredTools,
      registered.has(LOADER_NAME) ? LOADER_NAME : undefined,
      webToolMode(ctx.model) === "upfront"
        ? deferredTools
        : declaredToolNames(ctx.sessionManager.getBranch()),
    ));
    if (webToolMode(ctx.model) === "upfront") activateWebTools();
  });
}
