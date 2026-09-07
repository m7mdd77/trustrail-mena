import { z } from "zod";
import type { NetworkTool, TransactionContext } from "./domain.js";

// Illustrative institution policy, not live FX or calibrated fraud thresholds.
export const highValueThresholds = { BHD: 1000, SAR: 10000, AED: 10000 } as const;
export function isHighValue(transaction: TransactionContext): boolean {
  return transaction.amount >= highValueThresholds[transaction.currency];
}

const schemas = {
  sim_swap: z.object({ swapped: z.boolean() }),
  device_swap: z.object({ swapped: z.boolean() }),
  location: z.object({ verificationResult: z.enum(["TRUE", "FALSE", "UNKNOWN"]) }),
  roaming: z.object({ roaming: z.boolean() }),
};

// Zod strips non-allowlisted fields; subscriber/location details never leave this boundary.
export function parseEvidence(tool: NetworkTool, raw: unknown) {
  return schemas[tool].parse(raw);
}

export function validEvidence(tool: NetworkTool, raw: unknown): boolean {
  return schemas[tool].safeParse(raw).success;
}
