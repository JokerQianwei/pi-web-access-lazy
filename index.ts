import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import piWebAccess from "pi-web-access/index.ts";
import { Type } from "typebox";
import {
  initialActiveTools,
  interceptToolRegistration,
  newlyAvailableTools,
} from "./lazy.ts";

const LOADER_NAME = "load_web_tools";

export default async function piWebAccessLazy(
  pi: ExtensionAPI,
): Promise<void> {
  const deferredTools = new Set<string>();
  await piWebAccess(interceptToolRegistration(pi, deferredTools));

  pi.registerTool({
    name: LOADER_NAME,
    label: "Load Web Tools",
    description:
      "Enable pi-web-access tools for web search, source verification, URL fetching, and stored web content retrieval.",
    promptSnippet:
      "Enable web tools before searching, verifying claims, fetching URLs, or retrieving stored web content.",
    parameters: Type.Object({}),
    async execute() {
      const registered = new Set(pi.getAllTools().map((tool) => tool.name));
      const active = pi.getActiveTools();
      const added = newlyAvailableTools(active, registered, deferredTools);

      if (added.length > 0) {
        pi.setActiveTools([...active, ...added]);
      }

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

  pi.on("session_start", () => {
    const registered = new Set(pi.getAllTools().map((tool) => tool.name));
    pi.setActiveTools(initialActiveTools(
      pi.getActiveTools(),
      deferredTools,
      registered.has(LOADER_NAME) ? LOADER_NAME : undefined,
    ));
  });
}
