import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateScenario } from "../server/decision.js";
import { getScenario } from "../server/scenarios.js";

const { generateContent, calls } = vi.hoisted(() => ({ generateContent: vi.fn(), calls: [] as string[] }));
vi.mock("@google/genai", () => ({ ThinkingLevel: { MINIMAL: "MINIMAL" }, GoogleGenAI: class { models = { generateContent }; } }));
vi.mock("../server/nokia.js", () => ({
  getRuntimeMode: () => "nokia-fixtures",
  collectEvidence: async (_scenario: unknown, item: { tool: string; reason: string }) => {
    calls.push(item.tool);
    return { ...item, label: item.tool, status: "received", source: "nokia-fixtures", latencyMs: 0,
      result: "Test", detail: "Synthetic test only", raw: item.tool === "location" ? { verificationResult: "TRUE" } : item.tool === "roaming" ? { roaming: false } : { swapped: false } };
  },
}));
afterEach(() => { vi.unstubAllEnvs(); generateContent.mockReset(); calls.length = 0; });

describe("LangGraph decision orchestration", () => {
  it("runs Gemini planning, bounded evidence collection and institution policy end to end", async () => {
    vi.stubEnv("GEMINI_API_KEY", "synthetic-test-key");
    generateContent.mockResolvedValue({ text: JSON.stringify({ summary: "Routine", contextSignals: ["At home"], items: [{ tool: "sim_swap", reason: "Core check" }] }) });
    const result = await evaluateScenario(getScenario("safe-remittance")!);
    expect(result.plan.planner).toBe("llm-agent");
    expect(result.outcome).toBe("APPROVE");
    expect(calls).toEqual(["sim_swap", "device_swap"]);
    expect(result.evidence).toHaveLength(2);
    const input = generateContent.mock.calls[0][0];
    expect(input.model).toBe("gemini-3.1-flash-lite");
    expect(input.config.responseMimeType).toBe("application/json");
    expect(input.contents).not.toContain("phoneNumber");
    expect(input.contents).not.toContain("consentReference");
  });
  it("retains network collection but requires VERIFY after Gemini rate limiting", async () => {
    vi.stubEnv("GEMINI_API_KEY", "synthetic-test-key");
    generateContent.mockRejectedValue(new Error("429 RESOURCE_EXHAUSTED synthetic-test-key"));
    const result = await evaluateScenario(getScenario("safe-remittance")!);
    expect(result.outcome).toBe("VERIFY");
    expect(calls).toEqual(["sim_swap", "device_swap"]);
    expect(JSON.stringify(result)).not.toContain("synthetic-test-key");
  });
});
