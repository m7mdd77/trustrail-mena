export type ScenarioId = "safe-remittance" | "account-takeover" | "provider-timeout";
export type DecisionOutcome = "APPROVE" | "VERIFY" | "HOLD";

export interface ScenarioSummary {
  id: ScenarioId;
  title: string;
  shortDescription: string;
  transaction: {
    amount: number;
    currency: string;
    journey: string;
    destination: string;
    newBeneficiary: boolean;
    accountAgeDays: number;
    expectedArea: string;
  };
}

export interface EvidenceRecord {
  tool: "sim_swap" | "reachability" | "location" | "roaming";
  label: string;
  status: "received" | "unavailable";
  source: "nokia-live" | "nokia-fixtures";
  reason: string;
  latencyMs: number;
  result: string;
  detail: string;
  raw: unknown;
}

export interface DecisionResult {
  id: string;
  createdAt: string;
  scenario: ScenarioSummary;
  plan: {
    summary: string;
    items: Array<{ tool: string; reason: string }>;
    planner: "bounded-policy-agent" | "llm-agent";
  };
  evidence: EvidenceRecord[];
  outcome: DecisionOutcome;
  riskScore: number;
  headline: string;
  explanation: string;
  policyRulesApplied: string[];
  runtimeMode: "nokia-live" | "nokia-fixtures";
}

export interface StatusResponse {
  ok: boolean;
  runtimeMode: "nokia-live" | "nokia-fixtures";
  plannerMode: "bounded-policy-agent" | "llm-agent";
  enabledApis: string[];
}

