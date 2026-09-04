# TrustRail MENA

TrustRail MENA is a network-native fraud-decision prototype for the GSMA MENA Ignite Hackathon. A bounded agent selects the minimum justified CAMARA checks through Nokia Network as Code, then a deterministic institution policy recommends `APPROVE`, `VERIFY`, or `HOLD`.

- **Live demo:** https://trustrail-mena.vercel.app
- **Source repository:** https://github.com/m7mdd77/trustrail-mena

The interface always displays its actual runtime mode. `Nokia simulator connected` means the server is calling Nokia Network as Code; `Fixture preview mode` means no hosted Nokia credential is configured.

## What the prototype demonstrates

- Real Nokia Network as Code simulator calls for SIM Swap, Device Swap, Location Verification, and Roaming Status.
- Bounded agent planning with an optional OpenAI-compatible LLM planner.
- Deterministic safety rules that the AI cannot override.
- Visible, sanitized evidence payloads and failure handling.
- No payment authority and no precise location retention.

## Live-demo judging evidence

| Criterion | What reviewers can verify |
| --- | --- |
| Innovation & originality | A bounded agent chooses the minimum justified telecom checks before a payment, while deterministic institution policy retains decision authority. |
| MENA impact | The three journeys include a concrete Dubai-to-Pakistan first-beneficiary transfer, remittance, wallet cash-out, and account-takeover risk without exposing payment credentials to the telecom layer. |
| Scalability & commercial viability | The service is designed as a bank/wallet API layer with per-decision or enterprise pricing; CAMARA interfaces keep the integration portable across participating operators. |
| Technical feasibility | A wallet backend payload drives Nokia Network as Code calls for SIM Swap, Device Swap, Location Verification, and Roaming Status, with visible evidence, one transient retry, and explicit fallback behavior. |
| Agentic orchestration | The planner interprets structured and unstructured transaction context, then selects and explains multiple API calls; mandatory checks and deterministic policy bounds prevent an AI-generated plan from weakening safety. |
| Presentation | Reviewers can run one legitimate journey, one takeover journey, and one provider-failure journey end to end from the same interface. |

## Decision flow

```text
Payment context
      ↓
Bounded agent plan
      ↓
CAMARA checks through Nokia Network as Code
      ↓
Deterministic institution policy
      ↓
APPROVE · VERIFY · HOLD + auditable reasons
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

Number Verification is intentionally not claimed as an active backend check. Its device-initiated authorization flow requires a wallet client integration; that is the next production integration option, not a mocked feature in this prototype.

## Safety boundary

- The public API accepts only three predefined Nokia simulator scenarios.
- Arbitrary subscriber numbers are not accepted.
- Nokia and AI credentials remain server-side.
- A recent SIM swap is a hard hold signal.
- Missing critical evidence cannot produce a safe high-risk decision.
- The AI planner cannot omit the mandatory SIM Swap and Device Swap checks.
- Roaming alone never blocks a payment.
- TrustRail recommends; the bank or wallet owns the final action.
- Public demo requests are rate-limited per client to protect the Nokia API quota.
