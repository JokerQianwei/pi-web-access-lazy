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

export function initialActiveTools(
  activeTools: string[],
  deferredTools: ReadonlySet<string>,
  loaderName?: string,
): string[] {
  const tools = activeTools.filter((name) => !deferredTools.has(name));
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
