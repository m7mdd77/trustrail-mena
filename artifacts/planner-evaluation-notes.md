# Historical planner evaluation — 7 September 2026

`planner-evaluation.json` records the earlier public Vercel AI Gateway release, not Gemini. It must not be presented as validation of the migrated model.

Eight hand-labelled synthetic notes were each evaluated twice. All 16 requests returned HTTP 200, but only 5 used the live model; 11 used a rate-limit fallback. All 5 live-model tool sets matched their expected labels. Across all requests, 11/16 matched, versus 10/16 for the then-current deterministic baseline. This small, uneven sample does not establish accuracy or fraud efficacy.

Observed limitations: paraphrased travel and replacement-handset context could escape keyword planning; explicit negated travel triggered an extra check. The negation case now has a regression. More importantly, failed model interpretation now requires VERIFY when the policy would otherwise APPROVE; HOLD precedence remains. This reduces unsafe dependence on keyword fallback, but does not make the keyword interpreter semantically complete.

Next gate: configure Gemini privately, verify the public migration, then repeat the labelled comparison with separate output. Count model failures separately and report end-to-end latency. Never relabel fallback results as live-model successes.

## Gemini migration evaluation

`gemini-planner-evaluation.json` records eight live Gemini 3.1 Flash-Lite requests after increasing the planner cap to 4.5 seconds within the unchanged 7-second overall budget. All eight returned HTTP 200 and used the model, with no fallback in this sample. Seven of eight selected the exact labelled tool set; the revised keyword baseline matched six of eight. Server times ranged 1,534–3,302 ms. These are eight synthetic observations, not a p95 benchmark or efficacy estimate.

The model missed area verification for “replacement handset.” This is a real observed miss, preserved in the raw results. The policy floor was subsequently expanded to cover replacement device/phone/handset wording, with a regression demonstrating it applies even when the model omits location. Rechecking this known case is a regression, not a new unbiased evaluation. Broader semantic coverage remains unproven.
