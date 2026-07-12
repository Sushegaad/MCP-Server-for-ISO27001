/**
 * Unit tests for src/prompts/index.ts
 *
 * Verifies that registerAllPrompts registers all 4 expected prompts
 * on the McpServer instance.
 */

import { describe, it, expect, vi } from "vitest";
import { registerAllPrompts } from "../../../src/prompts/index.js";

// ── Minimal McpServer mock ────────────────────────────────────

function createMockServer() {
  const registeredPrompts: { name: string; description: string }[] = [];
  return {
    prompt: vi.fn((name: string, description: string, _args: unknown, _handler: unknown) => {
      registeredPrompts.push({ name, description });
    }),
    registeredPrompts,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("registerAllPrompts", () => {
  it("registers exactly 4 prompts", () => {
    const server = createMockServer();
    registerAllPrompts(server as never);
    expect(server.prompt).toHaveBeenCalledTimes(4);
  });

  it("registers conduct_gap_assessment prompt", () => {
    const server = createMockServer();
    registerAllPrompts(server as never);
    expect(server.registeredPrompts.find(p => p.name === "conduct_gap_assessment")).toBeDefined();
  });

  it("registers register_and_treat_risk prompt", () => {
    const server = createMockServer();
    registerAllPrompts(server as never);
    expect(server.registeredPrompts.find(p => p.name === "register_and_treat_risk")).toBeDefined();
  });

  it("registers prepare_internal_audit prompt", () => {
    const server = createMockServer();
    registerAllPrompts(server as never);
    expect(server.registeredPrompts.find(p => p.name === "prepare_internal_audit")).toBeDefined();
  });

  it("registers prepare_management_review prompt", () => {
    const server = createMockServer();
    registerAllPrompts(server as never);
    expect(server.registeredPrompts.find(p => p.name === "prepare_management_review")).toBeDefined();
  });

  it("each prompt has a non-empty description", () => {
    const server = createMockServer();
    registerAllPrompts(server as never);
    for (const p of server.registeredPrompts) {
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it("conduct_gap_assessment handler returns a user message with workflow steps", () => {
    let capturedHandler: ((args: Record<string, string>) => unknown) | null = null;
    const server = {
      prompt: vi.fn((name: string, _desc: string, _args: unknown, handler: (args: Record<string, string>) => unknown) => {
        if (name === "conduct_gap_assessment") capturedHandler = handler;
      }),
    };
    registerAllPrompts(server as never);
    expect(capturedHandler).not.toBeNull();
    const result = capturedHandler!({}) as { messages: { role: string; content: { text: string } }[] };
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.role).toBe("user");
    expect(result.messages[0]!.content.text).toContain("gap assessment");
  });

  it("conduct_gap_assessment injects organisation_name when provided", () => {
    let capturedHandler: ((args: Record<string, string>) => unknown) | null = null;
    const server = {
      prompt: vi.fn((name: string, _desc: string, _args: unknown, handler: (args: Record<string, string>) => unknown) => {
        if (name === "conduct_gap_assessment") capturedHandler = handler;
      }),
    };
    registerAllPrompts(server as never);
    const result = capturedHandler!({ organisation_name: "Acme Ltd", isms_version: "2022", timeline_weeks: "26" }) as {
      messages: { role: string; content: { text: string } }[];
    };
    expect(result.messages[0]!.content.text).toContain("Acme Ltd");
  });

  it("register_and_treat_risk handler returns workflow steps", () => {
    let capturedHandler: ((args: Record<string, string>) => unknown) | null = null;
    const server = {
      prompt: vi.fn((name: string, _desc: string, _args: unknown, handler: (args: Record<string, string>) => unknown) => {
        if (name === "register_and_treat_risk") capturedHandler = handler;
      }),
    };
    registerAllPrompts(server as never);
    const result = capturedHandler!({ asset: "Customer DB" }) as {
      messages: { role: string; content: { text: string } }[];
    };
    expect(result.messages[0]!.content.text).toContain("Customer DB");
    expect(result.messages[0]!.content.text).toContain("treatment");
  });

  it("prepare_internal_audit handler returns workflow steps", () => {
    let capturedHandler: ((args: Record<string, string>) => unknown) | null = null;
    const server = {
      prompt: vi.fn((name: string, _desc: string, _args: unknown, handler: (args: Record<string, string>) => unknown) => {
        if (name === "prepare_internal_audit") capturedHandler = handler;
      }),
    };
    registerAllPrompts(server as never);
    const result = capturedHandler!({ auditor: "Jane Smith" }) as {
      messages: { role: string; content: { text: string } }[];
    };
    expect(result.messages[0]!.content.text).toContain("Jane Smith");
    expect(result.messages[0]!.content.text).toContain("audit");
  });

  it("prepare_management_review handler returns workflow steps mentioning 9.3", () => {
    let capturedHandler: ((args: Record<string, string>) => unknown) | null = null;
    const server = {
      prompt: vi.fn((name: string, _desc: string, _args: unknown, handler: (args: Record<string, string>) => unknown) => {
        if (name === "prepare_management_review") capturedHandler = handler;
      }),
    };
    registerAllPrompts(server as never);
    const result = capturedHandler!({}) as {
      messages: { role: string; content: { text: string } }[];
    };
    expect(result.messages[0]!.content.text).toContain("9.3");
    expect(result.messages[0]!.content.text).toContain("7 mandatory");
  });
});
