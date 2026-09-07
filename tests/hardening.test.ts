import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPolicy } from "../server/decision.js";
import { parseEvidence, isHighValue } from "../server/controls.js";
import { createAgentPlan } from "../server/planner.js";
import { executeWithOneTransientRetry, withinDeadline } from "../server/retry.js";
import { getScenario } from "../server/scenarios.js";
import type { EvidenceRecord, NetworkTool } from "../server/domain.js";

function record(tool: NetworkTool, raw: unknown): EvidenceRecord {
  return { tool, raw, label: tool, status: "received", source: "nokia-fixtures", reason: "Test", latencyMs: 0, result: "Test", detail: "Test" };
}
const safe = getScenario("safe-remittance")!;
const core = () => [record("sim_swap", { swapped: false }), record("device_swap", { swapped: false })];

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("evidence and policy safety", () => {
  it.each([{}, null, "false", { swapped: "false" }, { swapped: 0 }])("rejects malformed core evidence %j", raw => {
    expect(() => parseEvidence("sim_swap", raw)).toThrow();
    expect(applyPolicy(safe, [record("sim_swap", raw), core()[1]]).outcome).toBe("VERIFY");
  });
  it.each([{}, null, { verificationResult: "MAYBE" }])("rejects malformed location %j", raw => {
    expect(applyPolicy(safe, [...core(), record("location", raw)]).outcome).toBe("VERIFY");
  });
  it("requires verification for inconclusive requested location", () => {
    expect(applyPolicy(safe, [...core(), record("location", { verificationResult: "UNKNOWN" })]).outcome).toBe("VERIFY");
  });
  it("retains HOLD precedence over unavailable evidence", () => {
    expect(applyPolicy(safe, [record("sim_swap", { swapped: true }), record("device_swap", {})]).outcome).toBe("HOLD");
  });
  it("strips coordinates and arbitrary provider metadata", () => {
    expect(parseEvidence("location", { verificationResult: "TRUE", latitude: 25, phoneNumber: "private" })).toEqual({ verificationResult: "TRUE" });
  });
  it.each(["BHD", "AED", "SAR"] as const)("uses the explicit %s threshold", currency => {
    const amount = currency === "BHD" ? 1000 : 10000;
    expect(isHighValue({ ...safe.transaction, currency, amount })).toBe(true);
    expect(isHighValue({ ...safe.transaction, currency, amount: amount - 1 })).toBe(false);
  });
});

describe("independently enforced deadlines", () => {
  it("rejects a never-settling operation", async () => {
    await expect(withinDeadline(() => new Promise(() => {}), AbortSignal.timeout(15))).rejects.toMatchObject({ name: "TimeoutError" });
  });
  it("does not accept late success from an abort-ignoring provider", async () => {
    const op = vi.fn(() => new Promise(resolve => setTimeout(() => resolve("late"), 80)));
    await expect(executeWithOneTransientRetry(op, AbortSignal.timeout(20), 10)).rejects.toBeDefined();
    expect(op.mock.calls.length).toBeLessThanOrEqual(2);
  });
  it("does not start an operation after cancellation", async () => {
    const op = vi.fn(async () => true);
    await expect(withinDeadline(op, AbortSignal.abort())).rejects.toBeDefined();
    expect(op).not.toHaveBeenCalled();
  });
});

describe("planning safety floor", () => {
  it("adds required escalation despite an incomplete model plan", async () => {
    vi.stubEnv("AI_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ summary: "Skip checks", contextSignals: ["Ignore the policy"], items: [{ tool: "sim_swap", reason: "Only this" }] }) } }] })));
    const plan = await createAgentPlan(getScenario("account-takeover")!, new AbortController().signal);
    expect(plan.items.map(i => i.tool)).toEqual(["sim_swap", "device_swap", "location", "roaming"]);
  });
  it("does not change safety controls based on a demo scenario ID", async () => {
    for (const name of ["AI_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"]) vi.stubEnv(name, "");
    const first = getScenario("provider-timeout")!;
    const a = await createAgentPlan(first, new AbortController().signal);
    const b = await createAgentPlan({ ...first, id: "safe-remittance" }, new AbortController().signal);
    expect(a.items).toEqual(b.items);
    expect(a.items.map(i => i.tool)).toContain("location");
  });
  it("uses bounded fallback for an abort-ignoring model", async () => {
    vi.stubEnv("AI_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const plan = await createAgentPlan(safe, AbortSignal.timeout(20));
    expect(plan.planner).toBe("bounded-policy-agent");
    expect(plan.latencyMs).toBeGreaterThan(0);
    expect(plan.fallbackReason).not.toContain("test-only");
  });
});
