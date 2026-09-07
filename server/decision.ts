import { randomUUID } from "node:crypto";
import type { AgentPlan, DecisionOutcome, DecisionResult, DemoScenario, EvidenceRecord } from "./domain.js";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { collectEvidence, getRuntimeMode } from "./nokia.js";
import { createAgentPlan } from "./planner.js";
import { isHighValue, validEvidence } from "./controls.js";

export interface PolicyDecision {
  outcome: DecisionOutcome;
  riskScore: number;
  headline: string;
  explanation: string;
  policyRulesApplied: string[];
}

export function guardPlannerFailure(policy: PolicyDecision, fallbackReason?: string): PolicyDecision {
  if (!fallbackReason || policy.outcome !== "APPROVE") return policy;
  return { ...policy, outcome: "VERIFY", headline: "Context interpretation unavailable",
    explanation: "The model could not interpret the wallet note. Baseline network checks ran, but the wallet should verify the customer rather than assume no additional checks were needed.",
    policyRulesApplied: [...policy.policyRulesApplied, "Failed context interpretation cannot silently downgrade a required verification."] };
}

export function getDecisionBudgetMs(): number {
  const configured = Number(process.env.DECISION_BUDGET_MS ?? 7_000);
  return Number.isFinite(configured) ? Math.max(4_000, Math.min(10_000, configured)) : 7_000;
}

function evidenceByTool(evidence: EvidenceRecord[], tool: EvidenceRecord["tool"]): EvidenceRecord | undefined {
  return evidence.find((item) => item.tool === tool);
}

export function applyPolicy(scenario: DemoScenario, evidence: EvidenceRecord[]): PolicyDecision {
  evidence = evidence.map(item => item.status === "received" && !validEvidence(item.tool, item.raw)
    ? { ...item, status: "unavailable", raw: { unavailable: true } } : item);
  const simSwap = evidenceByTool(evidence, "sim_swap");
  const deviceSwap = evidenceByTool(evidence, "device_swap");
  const location = evidenceByTool(evidence, "location");
  const roaming = evidenceByTool(evidence, "roaming");
  const unavailable = evidence.filter((item) => item.status === "unavailable");
  const missingCoreEvidence = [
    ["sim_swap", simSwap],
    ["device_swap", deviceSwap],
  ].filter(([, record]) => !record);
  const rules: string[] = [];
  let score = isHighValue(scenario.transaction) ? 12 : 0;

  if (missingCoreEvidence.length > 0) {
    score += 18;
    rules.push("Missing core network evidence cannot be interpreted as safe.");
  }

  if ((simSwap?.raw as any)?.swapped === true) {
    score += 75;
    rules.push("Conservative demo policy holds recent SIM changes for review; a legitimate replacement is also possible.");
  }
  if ((deviceSwap?.raw as any)?.swapped === true) {
    score += 55;
    rules.push("A recent physical-device swap is a strong account-takeover signal.");
  }
  if ((location?.raw as any)?.verificationResult === "FALSE") {
    score += 35;
    rules.push("Location mismatch requires additional protection.");
  }
  if ((location?.raw as any)?.verificationResult === "UNKNOWN") {
    score += 15;
    rules.push("Unknown location evidence cannot be interpreted as safe.");
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
  const hasRecentDeviceSwap = (deviceSwap?.raw as any)?.swapped === true;
  const hasLocationMismatch = (location?.raw as any)?.verificationResult === "FALSE";
  const hasSecondSeriousSignal =
    hasRecentDeviceSwap || unavailable.length > 0 || missingCoreEvidence.length > 0;

  let outcome: DecisionOutcome;
  if (hasRecentSwap || (hasLocationMismatch && hasSecondSeriousSignal) || score >= 70) {
    outcome = "HOLD";
  } else if (unavailable.length > 0 || missingCoreEvidence.length > 0 || (location?.raw as any)?.verificationResult === "UNKNOWN" || score >= 30) {
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

export async function evaluateScenario(
  scenario: DemoScenario,
): Promise<DecisionResult> {
  const started = performance.now();
  const budgetMs = getDecisionBudgetMs();
  const controller = new AbortController();
  const budgetTimer = setTimeout(() => controller.abort(new Error("Decision budget expired")), budgetMs);

  try {
  const State = Annotation.Root({
    plan: Annotation<AgentPlan>(), evidence: Annotation<EvidenceRecord[]>(), policy: Annotation<PolicyDecision>(),
  });
  const graph = new StateGraph(State)
    .addNode("plan_checks", async () => ({ plan: await createAgentPlan(scenario, controller.signal) }))
    .addNode("collect_network_evidence", async state => ({ evidence: await Promise.all(state.plan.items.map(item => collectEvidence(scenario, item, controller.signal))) }))
    .addNode("institution_policy", state => ({ policy: guardPlannerFailure(applyPolicy(scenario, state.evidence), state.plan.fallbackReason) }))
    .addEdge(START, "plan_checks")
    .addEdge("plan_checks", "collect_network_evidence")
    .addEdge("collect_network_evidence", "institution_policy")
    .addEdge("institution_policy", END)
    .compile();
  const { plan, evidence, policy } = await graph.invoke({}, { recursionLimit: 8 });
  const totalLatencyMs = Math.round(performance.now() - started);

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    scenario: { id: scenario.id, title: scenario.title, shortDescription: scenario.shortDescription, transaction: scenario.transaction },
    plan,
    evidence,
    ...policy,
    runtimeMode: getRuntimeMode(),
    totalLatencyMs,
    budgetMs,
    budgetExceeded: controller.signal.aborted,
  };
  } finally {
    clearTimeout(budgetTimer);
  }
}
