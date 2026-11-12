// 负责上游工具注册拦截和激活集计算，不持有跨会话运行时状态。
import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

export function withoutPromptMetadata(
  tool: ToolDefinition,
): ToolDefinition {
  const {
    promptSnippet: _promptSnippet,
    promptGuidelines: _promptGuidelines,
    ...definition
  } = tool;
  return definition;
}

export function interceptToolRegistration(
  pi: ExtensionAPI,
  deferredTools: Set<string>,
): ExtensionAPI {
  const registerTool = ((tool: ToolDefinition) => {
    deferredTools.add(tool.name);
    pi.registerTool(withoutPromptMetadata(tool));
  }) as ExtensionAPI["registerTool"];

  return new Proxy(pi, {
    get(target, property) {
      if (property === "registerTool") return registerTool;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// 只读取当前分支的工具声明；结构类型同时支持没有 system 消息的旧版 Pi。
export function declaredToolNames(
  branch: readonly {
    type: string;
    message?: {
      role: string;
      toolsAdded?: readonly { name: string }[];
      toolsRemoved?: readonly { name: string }[];
    };
  }[],
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const entry of branch) {
    if (entry.type !== "message" || entry.message?.role !== "system") continue;
    for (const tool of entry.message.toolsRemoved ?? []) names.delete(tool.name);
    for (const tool of entry.message.toolsAdded ?? []) names.add(tool.name);
  }
  return names;
}

// 新会话保持冷启动；恢复时只保留已声明的网页工具，其他工具顺序不变。
export function initialActiveTools(
  activeTools: string[],
  deferredTools: ReadonlySet<string>,
  loaderName?: string,
  previouslyDeclared: ReadonlySet<string> = new Set(),
): string[] {
  const tools = activeTools.filter(
    (name) => !deferredTools.has(name) || previouslyDeclared.has(name),
  );
  if (loaderName && !tools.includes(loaderName)) {
    tools.push(loaderName);
  }
  return tools;
}

export function newlyAvailableTools(
  activeTools: string[],
  registeredTools: ReadonlySet<string>,
  deferredTools: Iterable<string>,
): string[] {
  const active = new Set(activeTools);
  return [...deferredTools].filter(
    (name) => registeredTools.has(name) && !active.has(name),
  );
}
