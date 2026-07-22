import { describe, it, expect } from "vitest";
import { isSensitiveTool, serverForTool } from "../tools";

describe("sensitive tool gating", () => {
  it("recognises write tools as sensitive", () => {
    expect(isSensitiveTool("write_file")).toBe(true);
    expect(isSensitiveTool("update_todo_list")).toBe(true);
  });

  it("treats read-only tools as non-sensitive", () => {
    expect(isSensitiveTool("read_file")).toBe(false);
    expect(isSensitiveTool("get_repository")).toBe(false);
    expect(isSensitiveTool("search_repositories")).toBe(false);
  });

  it("maps sensitive tools to their owning server", () => {
    expect(serverForTool("write_file")).toBe("local-coder");
    expect(serverForTool("update_todo_list")).toBe("personal-assistant");
    expect(serverForTool("nonexistent")).toBeUndefined();
  });
});
