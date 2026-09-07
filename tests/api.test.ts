import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { getScenario } from "../server/scenarios.js";
vi.mock("../server/decision.js", () => ({ getDecisionBudgetMs: () => 7000, evaluateScenario: vi.fn(async scenario => ({ outcome: "APPROVE", scenario })) }));
import { createApiApp } from "../server/app.js";
import { evaluateScenario } from "../server/decision.js";

let server: Server;
let base: string;
beforeAll(async () => {
  server = createApiApp().listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
const original = getScenario("safe-remittance")!;
const post = (transaction: unknown) => fetch(`${base}/api/decisions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: original.id, transaction }) });

describe("synthetic API boundary", () => {
  it.each([
    { consentReference: "consent_invented_reference" },
    { expectedArea: "Another country" },
    { amount: 99999 },
  ])("rejects changed scenario metadata before network evaluation %j", async change => {
    vi.mocked(evaluateScenario).mockClear();
    expect((await post({ ...original.transaction, ...change })).status).toBe(400);
    expect(evaluateScenario).not.toHaveBeenCalled();
  });
  it("accepts bounded note edits", async () => {
    expect((await post({ ...original.transaction, contextNote: "Synthetic customer is travelling for work." })).status).toBe(200);
  });
  it("provides actionable invalid-note feedback", async () => {
    const response = await post({ ...original.transaction, contextNote: "x" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("10–300");
  });
  it("does not expose private scenario configuration", async () => {
    const scenarios = await (await fetch(`${base}/api/scenarios`)).json();
    expect(scenarios.every((s: Record<string, unknown>) => !("phoneNumber" in s) && !("expectedLocation" in s) && !("toolDeviceOverrides" in s))).toBe(true);
  });
});
