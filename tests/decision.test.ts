import { describe, expect, it } from "vitest";
import { applyPolicy } from "../server/decision.js";
import { getScenario } from "../server/scenarios.js";
import type { EvidenceRecord, NetworkTool } from "../server/domain.js";

function evidence(tool: NetworkTool, raw: unknown, status: EvidenceRecord["status"] = "received"): EvidenceRecord {
  return {
    tool,
    label: tool,
    status,
    source: "nokia-fixtures",
    reason: "Test evidence",
    latencyMs: 1,
    result: status === "received" ? "Received" : "Unavailable",
    detail: "Test evidence",
    raw,
  };
}

describe("TrustRail policy guard", () => {
  it("approves when the minimum evidence is consistent", () => {
    const scenario = getScenario("safe-remittance")!;
    const result = applyPolicy(scenario, [
      evidence("sim_swap", { swapped: false }),
      evidence("device_swap", { swapped: false }),
    ]);

    expect(result.outcome).toBe("APPROVE");
    expect(result.riskScore).toBe(0);
  });

  it("holds a transfer after a recent SIM swap", () => {
    const scenario = getScenario("account-takeover")!;
    const result = applyPolicy(scenario, [
      evidence("sim_swap", { swapped: true }),
      evidence("device_swap", { swapped: true }),
      evidence("location", { verificationResult: "FALSE" }),
      evidence("roaming", { roaming: true }),
    ]);

    expect(result.outcome).toBe("HOLD");
    expect(result.riskScore).toBe(100);
  });

  it("requires verification instead of inventing safety when an API is unavailable", () => {
    const scenario = getScenario("provider-timeout")!;
    const result = applyPolicy(scenario, [
      evidence("sim_swap", { swapped: false }),
      evidence("device_swap", { unavailable: true }, "unavailable"),
      evidence("location", { verificationResult: "TRUE" }),
    ]);

    expect(result.outcome).toBe("VERIFY");
    expect(result.policyRulesApplied).toContain(
      "Unavailable critical evidence cannot be converted into a safe signal.",
    );
  });

  it("does not hold a payment because of roaming alone", () => {
    const scenario = getScenario("safe-remittance")!;
    const result = applyPolicy(scenario, [
      evidence("sim_swap", { swapped: false }),
      evidence("device_swap", { swapped: false }),
      evidence("roaming", { roaming: true }),
    ]);

    expect(result.outcome).toBe("APPROVE");
  });

  it("requires verification when a core network signal is missing", () => {
    const scenario = getScenario("safe-remittance")!;
    const result = applyPolicy(scenario, [
      evidence("device_swap", { swapped: false }),
    ]);

    expect(result.outcome).toBe("VERIFY");
    expect(result.policyRulesApplied).toContain(
      "Missing core network evidence cannot be interpreted as safe.",
    );
  });
});
