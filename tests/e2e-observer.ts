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
      topLevelTools: toolNames(payload.tools),
      loadedTools,
    })}\n`);
  });
}
