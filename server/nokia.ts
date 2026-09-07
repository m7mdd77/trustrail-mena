import dotenv from "dotenv";
import { NetworkAsCodeApiClient } from "network-as-code";
import type {
  DemoScenario,
  EvidenceRecord,
  NetworkTool,
  RuntimeMode,
  ToolPlanItem,
} from "./domain.js";
import { executeWithOneTransientRetry, providerStatus } from "./retry.js";
import { parseEvidence } from "./controls.js";

dotenv.config({ path: ".env.local", quiet: true });

const labels: Record<NetworkTool, string> = {
  sim_swap: "SIM Swap",
  device_swap: "Device Swap",
  location: "Location Verification",
  roaming: "Roaming Status",
};

const apiKey = process.env.NOKIA_NAC_API_KEY;
const runtimeMode: RuntimeMode = apiKey ? "nokia-live" : "nokia-fixtures";

const client = apiKey
  ? new NetworkAsCodeApiClient({
      apiKey,
      rapidapiHost: "network-as-code.nokia.rapidapi.com",
      timeoutInSeconds: 2,
      maxRetries: 0,
    })
  : null;

export function getRuntimeMode(): RuntimeMode {
  return runtimeMode;
}

function fixture(tool: NetworkTool, phoneNumber: string): unknown {
  if (phoneNumber === "+99999990504") throw new Error("Nokia simulator gateway timeout (504)");

  const suspicious = phoneNumber === "+99999991000";
  switch (tool) {
    case "sim_swap":
      return { swapped: suspicious };
    case "device_swap":
      return { swapped: suspicious };
    case "location":
      return { verificationResult: suspicious ? "FALSE" : "TRUE", lastLocationTime: new Date().toISOString() };
    case "roaming":
      return suspicious ? { roaming: true, countryCode: 424, countryName: ["AE"] } : { roaming: false };
  }
}

async function liveCall(
  tool: NetworkTool,
  phoneNumber: string,
  scenario: DemoScenario,
  abortSignal: AbortSignal,
): Promise<unknown> {
  if (!client) return fixture(tool, phoneNumber);

  const requestOptions = { timeoutInSeconds: 2, maxRetries: 0, abortSignal };

  switch (tool) {
    case "sim_swap":
      return client.simSwap.check({ phoneNumber, maxAge: 240 }, requestOptions);
    case "device_swap":
      return client.deviceSwap.check({ phoneNumber, maxAge: 24 }, requestOptions);
    case "location":
      return client.location.verifyV1({
        device: { phoneNumber },
        area: {
          areaType: "CIRCLE",
          center: {
            latitude: scenario.expectedLocation.latitude,
            longitude: scenario.expectedLocation.longitude,
          },
          radius: scenario.expectedLocation.radiusMeters,
        } as Parameters<typeof client.location.verifyV1>[0]["area"],
        maxAge: 3_600,
      }, requestOptions);
    case "roaming":
      return client.deviceStatus.checkRoaming({ device: { phoneNumber } }, requestOptions);
  }
}

function safeProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const status = providerStatus(error)?.toString();

  if (error instanceof Error && (error.name === "TimeoutError" || /decision budget/i.test(message))) {
    return "The decision latency budget expired. TrustRail stopped waiting and requires wallet verification.";
  }

  if (status === "429") return "Nokia temporarily rate-limited this check. TrustRail treats it as unavailable, never as safe.";
  if (status === "504") return "Nokia's simulator intentionally timed out. TrustRail treats the missing signal as unavailable.";
  if (status === "422") return "Nokia rejected the verification context, so TrustRail cannot use this signal.";
  if (status) return `The network provider returned HTTP ${status}; this signal remains unavailable.`;
  return "The network check did not return usable evidence.";
}

function describe(tool: NetworkTool, raw: any): Pick<EvidenceRecord, "result" | "detail"> {
  switch (tool) {
    case "sim_swap":
      return raw.swapped
        ? { result: "Recent change detected", detail: "The network reports a SIM swap within the configured 240-hour window." }
        : { result: "No recent change", detail: "The network reports no SIM swap within the configured 240-hour window." };
    case "device_swap":
      return raw.swapped
        ? {
            result: "Recent change detected",
            detail: "The network reports that the subscription moved to a different physical device within 24 hours.",
          }
        : {
            result: "No recent change",
            detail: "The network reports no physical-device swap within the configured 24-hour window.",
          };
    case "location": {
      const result = raw.verificationResult ?? "UNKNOWN";
      return {
        result,
        detail:
          result === "TRUE"
            ? "The network confirms the device is inside the expected area."
            : result === "FALSE"
              ? "The network reports the device outside the expected area."
              : "The network could not provide a conclusive area verification.",
      };
    }
    case "roaming":
      return raw.roaming
        ? { result: "Roaming", detail: "The device is roaming; this is context and is not treated as fraud by itself." }
        : { result: "Home network", detail: "The device is not currently roaming." };
  }
}

export async function collectEvidence(
  scenario: DemoScenario,
  planItem: ToolPlanItem,
  abortSignal: AbortSignal,
): Promise<EvidenceRecord> {
  const started = performance.now();
  const phoneNumber = scenario.toolDeviceOverrides?.[planItem.tool] ?? scenario.phoneNumber;

  try {
    const response = await executeWithOneTransientRetry(
      (attemptSignal) => liveCall(planItem.tool, phoneNumber, scenario, attemptSignal),
      abortSignal,
      2_000,
    );
    const raw = parseEvidence(planItem.tool, response);
    const description = describe(planItem.tool, raw);
    return {
      tool: planItem.tool,
      label: labels[planItem.tool],
      status: "received",
      source: runtimeMode,
      reason: planItem.reason,
      latencyMs: Math.round(performance.now() - started),
      ...description,
      raw,
    };
  } catch (error) {
    return {
      tool: planItem.tool,
      label: labels[planItem.tool],
      status: "unavailable",
      source: runtimeMode,
      reason: planItem.reason,
      latencyMs: Math.round(performance.now() - started),
      result: "Signal unavailable",
      detail: safeProviderError(error),
      raw: { unavailable: true },
    };
  }
}
