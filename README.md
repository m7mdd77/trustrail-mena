# TrustRail MENA

TrustRail MENA is a network-native fraud-decision prototype for the GSMA MENA Ignite Hackathon. A bounded agent selects the minimum justified CAMARA checks through Nokia Network as Code, then a deterministic institution policy recommends `APPROVE`, `VERIFY`, or `HOLD`.

- **Live demo:** https://trustrail-mena.vercel.app
- **Source repository:** https://github.com/m7mdd77/trustrail-mena

The interface always displays its actual runtime mode. `Nokia simulator connected` means the server is calling Nokia Network as Code; `Fixture preview mode` means no hosted Nokia credential is configured.

## What the prototype demonstrates

- Real Nokia Network as Code simulator calls for SIM Swap, Device Swap, Location Verification, and Roaming Status.
- A deployed GPT-5.4 Mini Fast planner path through Vercel AI Gateway OIDC, with a bounded deterministic fallback whenever the gateway is unavailable or not activated.
- Editable unstructured wallet context that can change optional API selection while payment fields stay identical.
- Deterministic safety rules that the AI cannot override.
- Parallel network checks, one transient retry, and a visible 7-second end-to-end decision budget.
- Visible, sanitized evidence payloads, extracted context signals, total latency, and failure handling.
- No payment authority and no precise location retention.

## Live-demo judging evidence

| Criterion | What reviewers can verify |
| --- | --- |
| Innovation & originality | A bounded agent chooses the minimum justified telecom checks before a payment, while deterministic institution policy retains decision authority. |
| MENA impact | The three journeys include a concrete Dubai-to-Pakistan first-beneficiary transfer, remittance, wallet cash-out, and account-takeover risk without exposing payment credentials to the telecom layer. |
| Scalability & commercial viability | The service is designed as a bank/wallet API layer with per-decision or enterprise pricing; CAMARA interfaces keep the integration portable across participating operators. |
| Technical feasibility | A wallet backend payload drives Nokia Network as Code calls for SIM Swap, Device Swap, Location Verification, and Roaming Status, with visible evidence, one transient retry, and explicit fallback behavior. |
| Agentic orchestration | The planner path interprets editable structured and unstructured transaction context, exposes extracted signals, then selects and explains multiple API calls; mandatory checks and deterministic policy bounds prevent an AI-generated plan from weakening safety. The UI always identifies whether the LLM or fallback actually ran. |
| Presentation | Reviewers can run one legitimate journey, one takeover journey, and one provider-failure journey end to end from the same interface. |

## Decision flow

```text
Payment context
      ↓
Bounded LLM agent plan (2.5 s planner limit)
      ↓
Parallel CAMARA checks through Nokia Network as Code
      ↓
Deterministic institution policy
      ↓
APPROVE · VERIFY · HOLD + auditable reasons (7 s total budget)
```

## Requirements

- Node.js 24.
- pnpm.
- A Nokia Network as Code application key for live simulator mode.

## Local setup

```powershell
Copy-Item .env.example .env.local
```

Place the Nokia key in `.env.local` as `NOKIA_NAC_API_KEY`. Never commit or share it. Export the variables into the server process, then run:

```powershell
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173`.

Without `NOKIA_NAC_API_KEY`, the application runs in clearly labeled fixture-preview mode. It never silently replaces a failed live response with a fixture.

## Verification

```powershell
pnpm typecheck
pnpm test
pnpm build
```

The production server serves the built client and binds to `0.0.0.0` by default so it can run on a managed host:

```powershell
$env:NODE_ENV = "production"
pnpm start
```

Set `PORT` or `HOST` only when the hosting provider requires an override.

## Integration boundary

The customer remains inside the bank or wallet app. When the customer confirms a payment, the wallet backend calls `POST /api/decisions` with the transaction context and receives a recommendation plus an evidence trail. TrustRail does not initiate the payment or communicate directly with the end user.

The wallet payload includes a registration-time consent reference. The hackathon service assumes the enrolled phone is on a participating network where the requested CAMARA capabilities are available. If a capability is unavailable or the end-to-end budget expires, TrustRail returns `VERIFY` so the wallet can use its existing verification flow.

On Vercel, the LLM planner authenticates to AI Gateway using the platform's automatically provisioned, short-lived `VERCEL_OIDC_TOKEN`; no static AI key is stored. Local development can optionally provide the OpenAI-compatible variables in `.env.example`, otherwise the interface truthfully labels the deterministic safety fallback.

Production data-residency target: process regulated transaction context in its country of origin. The public hackathon deployment does not claim production data residency.

Number Verification is intentionally not claimed as an active backend check. Its device-initiated authorization flow requires a wallet client integration; that is the next production integration option, not a mocked feature in this prototype.

## Safety boundary

- The public API uses only three predefined Nokia simulator subscriber identities; reviewers can edit the bounded wallet context note to demonstrate a changing agent plan.
- Arbitrary subscriber numbers are not accepted.
- Nokia and AI credentials remain server-side.
- A recent SIM swap is a hard hold signal.
- Missing critical evidence cannot produce a safe high-risk decision.
- The AI planner cannot omit the mandatory SIM Swap and Device Swap checks.
- Roaming alone never blocks a payment.
- TrustRail recommends; the bank or wallet owns the final action.
- Public demo requests are rate-limited per client to protect the Nokia API quota.
- Independent Nokia checks run in parallel under one enforced decision budget.
