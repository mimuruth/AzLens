import type { ServerKey } from "@/lib/agents";

/**
 * Tools that mutate state and therefore require explicit user approval before
 * they run when "approval mode" is enabled. Maps each sensitive tool name to
 * the MCP server that provides it.
 */
export const SENSITIVE_TOOLS: Record<string, ServerKey> = {
  write_file: "local-coder",
  update_todo_list: "personal-assistant",
};

export function isSensitiveTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(SENSITIVE_TOOLS, name);
}

export function serverForTool(name: string): ServerKey | undefined {
  return SENSITIVE_TOOLS[name];
}
