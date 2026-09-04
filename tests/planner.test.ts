import { describe, expect, it } from "vitest";
import { createAgentPlan } from "../server/planner.js";
import { getScenario } from "../server/scenarios.js";

describe("TrustRail context planning", () => {
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
});
