// 负责上游工具注册拦截和激活集计算，不持有跨会话运行时状态。
import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type, type TObject } from "typebox";

// 上游版本固定，按稳定的 label 识别职责，保留用户自定义工具名和正文里的续读工具名。
const compactDescriptions: Record<string, string> = {
  "Web Search": "Search the web and return answers with source URLs. Prefer varied queries for research. Omit provider to use the configured default.",
  "Source Check": "Check a claim against web sources; return exact passage citations in a bounded research artifact.",
  "Fetch Content": "Read URL(s) as markdown; mode raw returns HTTP text, mode answer answers prompt using the page. Images, PDFs and GitHub supported. Use the returned responseId for remaining content.",
  "Get Search Content": "Read stored results or page slices by responseId. Select query/URL; paginate with offset/limit or findText.",
};

// 仅精简模型可见定义；参数的可选性、约束、执行函数及渲染器沿用上游。
// 未识别的工具原样保留；高级抓取参数不再声明，省略后由上游使用默认值。
function compactDefinition(tool: ToolDefinition): ToolDefinition {
  const description = compactDescriptions[tool.label];
  if (!description) return tool;
  const properties = { ...(tool.parameters as TObject).properties };
  if (tool.label === "Web Search" || tool.label === "Source Check") {
    properties.provider = Type.Optional(Type.Union([
      Type.String(),
      Type.Array(Type.String(), { minItems: 1 }),
    ], { description: "Override search provider(s); omit for default." }));
  }
  if (tool.label === "Web Search") {
    properties.query = { ...properties.query, description: "Single query; use query or queries." };
    properties.queries = { ...properties.queries, description: "Multiple independent queries." };
    properties.workflow = {
      ...properties.workflow,
      description: "none: skip curator; summary-review: review draft (default); auto-summary: summary only.",
    };
  }
  if (tool.label === "Fetch Content") {
    for (const key of ["timestamp", "frames", "model", "forceClone", "answerModel"]) {
      delete properties[key];
    }
    properties.prompt = { ...properties.prompt, description: "Page question required by mode answer." };
    properties.mode = { ...properties.mode, description: "readable (default), raw HTTP text, or answer prompt." };
  }
  return {
    ...tool,
    description,
    parameters: { ...tool.parameters, properties },
  };
}

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
    pi.registerTool(compactDefinition(withoutPromptMetadata(tool)));
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
