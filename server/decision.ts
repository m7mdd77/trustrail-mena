import { randomUUID } from "node:crypto";
import type { DecisionOutcome, DecisionResult, DemoScenario, EvidenceRecord } from "./domain.js";
import { collectEvidence, getRuntimeMode } from "./nokia.js";
import { createAgentPlan } from "./planner.js";

export interface PolicyDecision {
  outcome: DecisionOutcome;
  riskScore: number;
  headline: string;
  explanation: string;
  policyRulesApplied: string[];
}

function evidenceByTool(evidence: EvidenceRecord[], tool: EvidenceRecord["tool"]): EvidenceRecord | undefined {
  return evidence.find((item) => item.tool === tool);
}

export function applyPolicy(scenario: DemoScenario, evidence: EvidenceRecord[]): PolicyDecision {
  const simSwap = evidenceByTool(evidence, "sim_swap");
  const reachability = evidenceByTool(evidence, "reachability");
  const location = evidenceByTool(evidence, "location");
  const roaming = evidenceByTool(evidence, "roaming");
  const unavailable = evidence.filter((item) => item.status === "unavailable");
  const missingCoreEvidence = [
    ["sim_swap", simSwap],
    ["reachability", reachability],
  ].filter(([, record]) => !record);
  const rules: string[] = [];
  let score = scenario.transaction.amount >= 1_000 ? 12 : 0;

  if (missingCoreEvidence.length > 0) {
    score += 18;
    rules.push("Missing core network evidence cannot be interpreted as safe.");
  }

  if ((simSwap?.raw as any)?.swapped === true) {
    score += 75;
    rules.push("Recent SIM swap is a hard account-takeover signal.");
  }
  if ((location?.raw as any)?.verificationResult === "FALSE") {
    score += 35;
    rules.push("Location mismatch requires additional protection.");
  }
  if ((location?.raw as any)?.verificationResult === "UNKNOWN") {
    score += 15;
    rules.push("Unknown location evidence cannot be interpreted as safe.");
  }
  const connectivity = (reachability?.raw as any)?.connectivityStatus;
  if (connectivity === "CONNECTED_SMS") {
    score += 10;
    rules.push("SMS-only reachability is weaker than a confirmed mobile-data session.");
  } else if (connectivity === "NOT_CONNECTED") {
    score += 20;
    rules.push("An unreachable device increases uncertainty.");
  }
  if ((roaming?.raw as any)?.roaming === true) {
    score += 8;
    rules.push("Roaming is contextual evidence and never blocks a payment alone.");
  }
  if (unavailable.length > 0) {
    score += 18;
    rules.push("Unavailable critical evidence cannot be converted into a safe signal.");
  }

  const hasRecentSwap = (simSwap?.raw as any)?.swapped === true;
  const hasLocationMismatch = (location?.raw as any)?.verificationResult === "FALSE";
  const hasSecondSeriousSignal =
    connectivity !== "CONNECTED_DATA" || unavailable.length > 0 || missingCoreEvidence.length > 0;

  let outcome: DecisionOutcome;
  if (hasRecentSwap || (hasLocationMismatch && hasSecondSeriousSignal) || score >= 70) {
    outcome = "HOLD";
  } else if (unavailable.length > 0 || missingCoreEvidence.length > 0 || score >= 30) {
    outcome = "VERIFY";
  } else {
    outcome = "APPROVE";
  }

  if (outcome === "APPROVE") {
    return {
      outcome,
      riskScore: Math.min(score, 100),
      headline: "Network evidence is consistent",
      explanation: "The minimum required telecom signals are consistent with the customer context. The institution may continue under its own payment policy.",
      policyRulesApplied: rules.length ? rules : ["No hard-risk signal was detected."],
    };
  }
  if (outcome === "VERIFY") {
    return {
      outcome,
      riskScore: Math.min(score, 100),
      headline: "Stronger verification required",
      explanation: "The evidence is incomplete or mixed. TrustRail does not guess; the customer should complete a stronger verification step before funds move.",
      policyRulesApplied: rules,
    };
  }
  return {
    outcome,
    riskScore: Math.min(score, 100),
    headline: "Transfer held for review",
    explanation: "Strong account-takeover indicators are present. The agent cannot move or reject funds; it asks the institution to pause the transfer for human review.",
    policyRulesApplied: rules,
  };
}

export async function evaluateScenario(scenario: DemoScenario): Promise<DecisionResult> {
  const plan = await createAgentPlan(scenario);
  const evidence: EvidenceRecord[] = [];
  for (const item of plan.items) {
    evidence.push(await collectEvidence(scenario, item));
    if (getRuntimeMode() === "nokia-live") {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  const policy = applyPolicy(scenario, evidence);

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    scenario,
    plan,
    evidence,
    ...policy,
    runtimeMode: getRuntimeMode(),
  };
}
