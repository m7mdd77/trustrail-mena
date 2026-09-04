import express from "express";
import { z } from "zod";
import { evaluateScenario, getDecisionBudgetMs } from "./decision.js";
import { getRuntimeMode } from "./nokia.js";
import { getPlannerMode } from "./planner.js";
import { getScenario, scenarios } from "./scenarios.js";

const decisionRequest = z.object({
  scenarioId: z.enum(["safe-remittance", "account-takeover", "provider-timeout"]),
  transaction: z.object({
    amount: z.number().positive().max(1_000_000),
    currency: z.enum(["BHD", "SAR", "AED"]),
    journey: z.enum(["remittance", "wallet-cashout", "new-beneficiary"]),
    destination: z.string().min(2).max(80),
    newBeneficiary: z.boolean(),
    accountAgeDays: z.number().int().nonnegative().max(40_000),
    expectedArea: z.string().min(2).max(100),
    customerAction: z.string().min(10).max(240),
    contextNote: z.string().min(10).max(300),
    consentReference: z.string().regex(/^consent_[a-z0-9_-]{8,80}$/i),
  }),
});

const decisionRateLimit = Math.max(1, Number(process.env.DECISION_RATE_LIMIT ?? 12));
const decisionWindows = new Map<string, { startedAt: number; count: number }>();

export function createApiApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "20kb" }));
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  app.get("/api/status", (request, response) => {
    const oidcToken = request.header("x-vercel-oidc-token");
    response.json({
      ok: true,
      runtimeMode: getRuntimeMode(),
      plannerMode: getPlannerMode(oidcToken),
      enabledApis: ["SIM Swap", "Device Swap", "Location Verification", "Roaming Status"],
      integration:
        "Wallet backend calls POST /api/decisions with transaction context; TrustRail returns a recommendation and evidence trail.",
      decisionBudgetMs: getDecisionBudgetMs(),
      supportedNetworkAssumption:
        "The enrolled phone must use a participating network where the selected CAMARA capabilities are available; otherwise the wallet uses step-up verification.",
    });
  });

  app.get("/api/scenarios", (_request, response) => {
    response.json(
      scenarios.map(
        ({ phoneNumber: _phoneNumber, expectedLocation: _location, toolDeviceOverrides: _overrides, ...scenario }) =>
          scenario,
      ),
    );
  });

  app.post("/api/decisions", async (request, response) => {
    const now = Date.now();
    const key = request.ip ?? "unknown";
    const currentWindow = decisionWindows.get(key);
    const activeWindow =
      currentWindow && now - currentWindow.startedAt < 60_000
        ? currentWindow
        : { startedAt: now, count: 0 };

    if (activeWindow.count >= decisionRateLimit) {
      response.setHeader("Retry-After", "60");
      response.status(429).json({
        error: "Demo request limit reached. Please wait briefly before running another decision.",
      });
      return;
    }
    activeWindow.count += 1;
    decisionWindows.set(key, activeWindow);

    if (decisionWindows.size > 500) {
      for (const [client, window] of decisionWindows) {
        if (now - window.startedAt >= 60_000) decisionWindows.delete(client);
      }
    }

    const parsed = decisionRequest.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Choose one of the documented demo scenarios." });
      return;
    }

    const baseScenario = getScenario(parsed.data.scenarioId);
    if (!baseScenario) {
      response.status(404).json({ error: "Scenario not found." });
      return;
    }
    const scenario = { ...baseScenario, transaction: parsed.data.transaction };

    try {
      response.json(await evaluateScenario(scenario, { oidcToken: request.header("x-vercel-oidc-token") }));
    } catch {
      response.status(502).json({
        error: "TrustRail could not complete this decision safely.",
      });
    }
  });

  return app;
}
