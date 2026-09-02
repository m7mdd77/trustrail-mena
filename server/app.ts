import express from "express";
import { z } from "zod";
import { evaluateScenario } from "./decision.js";
import { getRuntimeMode } from "./nokia.js";
import { getScenario, scenarios } from "./scenarios.js";

const decisionRequest = z.object({
  scenarioId: z.enum(["safe-remittance", "account-takeover", "provider-timeout"]),
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

  app.get("/api/status", (_request, response) => {
    response.json({
      ok: true,
      runtimeMode: getRuntimeMode(),
      plannerMode: process.env.AI_API_KEY ? "llm-agent" : "bounded-policy-agent",
      enabledApis: ["SIM Swap", "Device Reachability", "Location Verification", "Roaming Status"],
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

    const scenario = getScenario(parsed.data.scenarioId);
    if (!scenario) {
      response.status(404).json({ error: "Scenario not found." });
      return;
    }

    try {
      response.json(await evaluateScenario(scenario));
    } catch {
      response.status(502).json({
        error: "TrustRail could not complete this decision safely.",
      });
    }
  });

  return app;
}
