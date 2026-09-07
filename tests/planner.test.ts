import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentPlan } from "../server/planner.js";
import { getScenario } from "../server/scenarios.js";

describe("TrustRail context planning", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("changes optional checks when only the unstructured travel context changes", async () => {
    const base = getScenario("account-takeover")!;
    const verifiedContext = {
      ...base,
      transaction: {
        ...base.transaction,
        contextNote: "Beneficiary verified in branch yesterday; scheduled tuition payment; customer is at home in Dubai.",
      },
    };
    const travelContext = {
      ...base,
      transaction: {
        ...base.transaction,
        contextNote: "Customer reports travelling abroad; urgent family payment from a new device session.",
      },
    };

    const verifiedPlan = await createAgentPlan(verifiedContext, new AbortController().signal);
    const travelPlan = await createAgentPlan(travelContext, new AbortController().signal);

    expect(verifiedPlan.items.map((item) => item.tool)).toEqual(["sim_swap", "device_swap", "location"]);
    expect(travelPlan.items.map((item) => item.tool)).toEqual(["sim_swap", "device_swap", "location", "roaming"]);
  });

  it("keeps an LLM plan bounded while trimming verbose display content", async () => {
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: JSON.stringify({
                  summary: "S".repeat(300),
                  contextSignals: ["one", "two", "three", "four", "five"],
                  items: [
                    { tool: "location", reason: "L".repeat(240) },
                    { tool: "unknown_tool", reason: "This tool must be discarded." },
                  ],
                }),
              },
            }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )),
    );

    const plan = await createAgentPlan(getScenario("account-takeover")!, new AbortController().signal);

    expect(plan.planner).toBe("llm-agent");
    expect(plan.summary).toHaveLength(220);
    expect(plan.contextSignals.length).toBeLessThanOrEqual(6);
    expect(plan.items.map((item) => item.tool)).toEqual(["sim_swap", "device_swap", "location", "roaming"]);
    expect(plan.items.every(item => item.reason.length <= 180)).toBe(true);
  });
});
