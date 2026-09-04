export type DecisionOutcome = "APPROVE" | "VERIFY" | "HOLD";
export type NetworkTool = "sim_swap" | "device_swap" | "location" | "roaming";
export type EvidenceStatus = "received" | "unavailable";
export type RuntimeMode = "nokia-live" | "nokia-fixtures";

export interface TransactionContext {
  amount: number;
  currency: "BHD" | "SAR" | "AED";
  journey: "remittance" | "wallet-cashout" | "new-beneficiary";
  destination: string;
  newBeneficiary: boolean;
  accountAgeDays: number;
  expectedArea: string;
  customerAction: string;
  contextNote: string;
}

export interface DemoScenario {
  id: "safe-remittance" | "account-takeover" | "provider-timeout";
  title: string;
  shortDescription: string;
  phoneNumber: string;
  transaction: TransactionContext;
  expectedLocation: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
  toolDeviceOverrides?: Partial<Record<NetworkTool, string>>;
}

export interface ToolPlanItem {
  tool: NetworkTool;
  reason: string;
}

export interface AgentPlan {
  summary: string;
  items: ToolPlanItem[];
  planner: "bounded-policy-agent" | "llm-agent";
}

export interface EvidenceRecord {
  tool: NetworkTool;
  label: string;
  status: EvidenceStatus;
  source: RuntimeMode;
  reason: string;
  latencyMs: number;
  result: string;
  detail: string;
  raw: unknown;
}

export interface DecisionResult {
  id: string;
  createdAt: string;
  scenario: DemoScenario;
  plan: AgentPlan;
  evidence: EvidenceRecord[];
  outcome: DecisionOutcome;
  riskScore: number;
  headline: string;
  explanation: string;
  policyRulesApplied: string[];
  runtimeMode: RuntimeMode;
}
