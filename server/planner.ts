import { z } from "zod";
import type { AgentPlan, DemoScenario, NetworkTool, ToolPlanItem } from "./domain.js";

const allowedTools = ["sim_swap", "device_swap", "location", "roaming"] as const;
const requiredTools = ["sim_swap", "device_swap"] as const;

const planSchema = z.object({
  summary: z.string().min(10).max(220),
  items: z
    .array(
      z.object({
        tool: z.enum(allowedTools),
        reason: z.string().min(8).max(180),
      }),
    )
    .min(1)
    .max(4),
});

function boundedPlan(scenario: DemoScenario): AgentPlan {
  const items: ToolPlanItem[] = [
    {
      tool: "sim_swap",
      reason: "Check for a recent SIM change before relying on possession-based authentication.",
    },
    {
      tool: "device_swap",
      reason: "Check whether the subscription recently moved to a different physical device.",
    },
  ];

  const highValue = scenario.transaction.amount >= 1_000;
  const elevatedJourney = scenario.transaction.newBeneficiary || scenario.transaction.journey === "wallet-cashout";

  if ((highValue || elevatedJourney) && scenario.id !== "provider-timeout") {
    items.push({
      tool: "location",
      reason: "Verify the expected area because the transaction value or journey warrants stronger evidence.",
    });
  }

  if (scenario.transaction.newBeneficiary) {
    items.push({
      tool: "roaming",
      reason: "Add roaming context for an unusual high-value transfer without treating travel as fraud by itself.",
    });
  }

  return {
    summary:
      scenario.id === "provider-timeout"
        ? "The agent requests the minimum two signals and escalates safely if a provider cannot answer."
        : items.length > 2
        ? "Elevated transaction context justifies a broader, privacy-bounded network check."
        : "Routine transaction context requires only the minimum useful network checks.",
    items,
    planner: "bounded-policy-agent",
  };
}

function enforcePlannerBounds(plan: AgentPlan): AgentPlan {
  const requiredItems: ToolPlanItem[] = [
    {
      tool: "sim_swap",
      reason: "Check for a recent SIM change before relying on possession-based authentication.",
    },
    {
      tool: "device_swap",
      reason: "Check whether the subscription recently moved to a different physical device.",
    },
  ];
  const items = [...requiredItems];
  const seen = new Set<NetworkTool>(requiredTools);

  for (const item of plan.items) {
    if (seen.has(item.tool)) continue;
    seen.add(item.tool);
    items.push(item);
    if (items.length === 4) break;
  }

  return { ...plan, items };
}

async function llmPlan(scenario: DemoScenario): Promise<AgentPlan | null> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  if (!apiKey || !baseUrl || !model) return null;

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are TrustRail's bounded fraud-check planner. Select only from sim_swap, device_swap, location, roaming. SIM swap and device swap are mandatory. Use the fewest additional tools justified by both structured transaction fields and the unstructured context note, at most four total. Roaming alone is never evidence of fraud. Return JSON with summary and items[{tool,reason}].",
        },
        {
          role: "user",
          content: JSON.stringify(scenario.transaction),
        },
      ],
    }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) throw new Error(`Planner returned HTTP ${response.status}`);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Planner returned no structured content");
  const parsed = planSchema.parse(JSON.parse(content));

  return { ...parsed, planner: "llm-agent" };
}

export async function createAgentPlan(scenario: DemoScenario): Promise<AgentPlan> {
  try {
    const plan = (await llmPlan(scenario)) ?? boundedPlan(scenario);
    return enforcePlannerBounds(plan);
  } catch {
    return boundedPlan(scenario);
  }
}

export function isAllowedTool(tool: string): tool is NetworkTool {
  return (allowedTools as readonly string[]).includes(tool);
}
