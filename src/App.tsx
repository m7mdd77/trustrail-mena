import { useEffect, useMemo, useState } from "react";
import type { DecisionResult, ScenarioId, ScenarioSummary, StatusResponse } from "./types.js";

const icons: Record<ScenarioId, string> = {
  "safe-remittance": "✓",
  "account-takeover": "!",
  "provider-timeout": "↻",
};

const outcomeLabels = {
  APPROVE: "Continue payment",
  VERIFY: "Step-up verification",
  HOLD: "Pause for review",
};

function formatJourney(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function App() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [selected, setSelected] = useState<ScenarioId>("safe-remittance");
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [contextDraft, setContextDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientLatencyMs, setClientLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/status").then((response) => { if (!response.ok) throw new Error(); return response.json(); }),
      fetch("/api/scenarios").then((response) => { if (!response.ok) throw new Error(); return response.json(); }),
    ])
      .then(([nextStatus, nextScenarios]) => {
        setStatus(nextStatus);
        setScenarios(nextScenarios);
      })
      .catch(() => setError("The prototype service is not available."));
  }, []);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selected),
    [scenarios, selected],
  );

  useEffect(() => {
    if (selectedScenario) setContextDraft(selectedScenario.transaction.contextNote);
  }, [selectedScenario?.id]);

  async function runDecision() {
    if (loading || !selectedScenario) return;
    if (contextDraft.trim().length < 10 || contextDraft.length > 300) {
      setError("Please enter a synthetic wallet note of 10–300 characters.");
      return;
    }
    const started = performance.now();
    setLoading(true);
    setError("");
    setDecision(null);
    try {
      const response = await fetch("/api/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenarioId: selected,
          transaction: selectedScenario
            ? { ...selectedScenario.transaction, contextNote: contextDraft }
            : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? payload.error ?? "Decision failed");
      setDecision(payload);
      setClientLatencyMs(Math.round(performance.now() - started));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Decision failed safely.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <nav className="nav shell" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="TrustRail MENA home">
          <span className="brand-mark">TR</span>
          <span>
            <strong>TrustRail</strong>
            <small>MENA</small>
          </span>
        </a>
        <div className="nav-meta">
          <span className={`live-pill ${status?.runtimeMode === "nokia-live" ? "is-live" : ""}`}>
            <i /> {!status ? "Checking configuration…" : status.runtimeMode === "nokia-live" ? "Nokia simulator configured" : "Fixture preview mode"}
          </span>
          <span className="nav-copy">Bank stays in control</span>
        </div>
      </nav>

      <header className="hero shell" id="top">
        <section>
          <p className="eyebrow">Network-native fraud decisions</p>
          <h1>Let the network speak<br />before the money moves.</h1>
          <p className="hero-copy">
            A wallet backend sends TrustRail the payment context. Its bounded AI agent asks Nokia Network as Code for
            justified telecom evidence, then returns approve, verify, or hold—with every reason visible. Synthetic customers only; live calls use Nokia’s simulator, not a verified carrier pilot.
          </p>
          <div className="trust-row">
            <span>CAMARA APIs</span>
            <span>Policy bounded</span>
            <span>No payment authority</span>
          </div>
        </section>
        <aside className="hero-card" aria-label="How TrustRail works">
          <p className="card-label">One protected decision</p>
          <ol>
            <li><b>01</b><span>Wallet backend sends transaction</span></li>
            <li><b>02</b><span>Select justified network checks</span></li>
            <li><b>03</b><span>Apply institution safety policy</span></li>
          </ol>
          <div className="mini-outcomes">
            <span className="approve">Approve</span>
            <span className="verify">Verify</span>
            <span className="hold">Hold</span>
          </div>
        </aside>
      </header>

      <section className="workspace shell" aria-labelledby="demo-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Interactive prototype</p>
            <h2 id="demo-title">Choose a payment journey</h2>
          </div>
          <p>The customer stays inside the wallet. Its backend calls TrustRail before releasing funds.</p>
        </div>

        <div className="scenario-grid">
          {scenarios.map((scenario) => (
            <button
              type="button"
              key={scenario.id}
              disabled={loading}
              className={`scenario-card ${selected === scenario.id ? "selected" : ""}`}
              onClick={() => {
                setSelected(scenario.id);
                setDecision(null);
                setError("");
              }}
              aria-pressed={selected === scenario.id}
            >
              <span className={`scenario-icon ${scenario.id}`}>{icons[scenario.id]}</span>
              <span className="scenario-title">{scenario.title}</span>
              <span className="scenario-copy">{scenario.shortDescription}</span>
              <span className="scenario-arrow">Select <b>→</b></span>
            </button>
          ))}
        </div>

        {selectedScenario && (
          <>
          <section className="wallet-path" aria-label="Complete wallet payment path">
            <div className="wallet-story">
              <p className="card-label">Wallet confirmation mockup</p>
              <h3>{selectedScenario.transaction.customerAction}</h3>
              <button className="wallet-confirmation" type="button" disabled={loading} onClick={runDecision}>
                <span>Simulated wallet</span>
                <strong>{loading ? "Checking…" : "Confirm payment →"}</strong>
              </button>
              <p>Fixed synthetic consent reference · no real registration, payment or identity verification is performed.</p>
            </div>
            <ol className="integration-flow">
              <li><b>1</b><span><strong>Wallet app</strong><small>Customer confirms payment</small></span></li>
              <li><b>2</b><span><strong>Wallet backend</strong><small>Sends transaction context</small></span></li>
              <li><b>3</b><span><strong>TrustRail API</strong><small>Orchestrates CAMARA checks</small></span></li>
              <li className={decision ? `flow-${decision.outcome.toLowerCase()}` : ""}>
                <b>4</b><span><strong>Wallet action</strong><small>{decision ? outcomeLabels[decision.outcome] : "Await recommendation"}</small></span>
              </li>
            </ol>
          </section>
          <section className="context-editor" aria-labelledby="context-title">
            <div>
              <p className="card-label">Unstructured wallet context</p>
              <h3 id="context-title">Change the note; keep the payment fields identical.</h3>
              <p>The AI interprets synthetic notes. Institution rules enforce minimum checks; the agent may add allowed checks, never remove required ones.</p>
            </div>
            <div>
              <label htmlFor="context-note">Wallet case note</label>
              <textarea
                id="context-note"
                disabled={loading}
                value={contextDraft}
                maxLength={300}
                onChange={(event) => {
                  setContextDraft(event.target.value);
                  setDecision(null);
                }}
              />
              {selected === "account-takeover" && (
                <div className="context-presets">
                  <button type="button" disabled={loading} onClick={() => { setContextDraft("The customer reports travelling abroad; the transfer note says ‘family emergency’; a new device session appeared six hours ago."); setDecision(null); }}>Travel-risk note</button>
                  <button type="button" disabled={loading} onClick={() => { setContextDraft("Beneficiary verified in branch yesterday; scheduled tuition payment; customer is at home in Dubai."); setDecision(null); }}>Verified-context note</button>
                </div>
              )}
            </div>
          </section>
          <div className="transaction-bar">
            <div>
              <small>Amount</small>
              <strong>{selectedScenario.transaction.amount.toLocaleString()} {selectedScenario.transaction.currency}</strong>
            </div>
            <div>
              <small>Journey</small>
              <strong>{formatJourney(selectedScenario.transaction.journey)}</strong>
            </div>
            <div>
              <small>Destination</small>
              <strong>{selectedScenario.transaction.destination}</strong>
            </div>
            <div>
              <small>Expected area</small>
              <strong>{selectedScenario.transaction.expectedArea}</strong>
            </div>
            <button type="button" className="run-button" onClick={runDecision} disabled={loading}>
              {loading ? <><span className="spinner" /> Agent checking network…</> : <>Run protected decision <span>→</span></>}
            </button>
          </div>
          </>
        )}

        {error && <div className="error-banner" role="alert">{error}</div>}

        {decision && (
          <article className="decision-panel" aria-live="polite">
            <div className="decision-topline">
              <div>
                <p className="eyebrow">Agent execution trace</p>
                <h2>{decision.plan.summary}</h2>
              </div>
              <span className="planner-pill">
                {decision.plan.planner === "llm-agent" ? "Live AI planner" : "Deterministic safety fallback"}
              </span>
            </div>

            <div className="agent-proof">
              <div>
                <span>Context extracted</span>
                <ul>{decision.plan.contextSignals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
              </div>
              <div>
                <span>Planner</span>
                <strong>{decision.plan.model ?? "Local bounded fallback"}</strong>
                <small>{decision.plan.latencyMs.toLocaleString()} ms planning</small>
                {decision.plan.fallbackReason && <small className="fallback-reason">{decision.plan.fallbackReason}</small>}
              </div>
              <div>
                <span>Server evaluation</span>
                <strong>{decision.totalLatencyMs.toLocaleString()} ms</strong>
                <small>{decision.budgetMs.toLocaleString()} ms server budget · {clientLatencyMs?.toLocaleString()} ms browser request</small>
              </div>
            </div>

            <div className="evidence-grid">
              {decision.evidence.map((item, index) => (
                <section className={`evidence-card ${item.status}`} key={item.tool} style={{ animationDelay: `${index * 90}ms` }}>
                  <header>
                    <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="evidence-status">{item.status === "received" ? "Received" : "Unavailable"}</span>
                  </header>
                  <h3>{item.label}</h3>
                  <p className="tool-reason">{item.reason}</p>
                  <div className="tool-result">
                    <strong>{item.result}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <details>
                    <summary>Evidence payload · {item.latencyMs} ms</summary>
                    <pre>{JSON.stringify(item.raw, null, 2)}</pre>
                  </details>
                </section>
              ))}
            </div>

            <section className={`outcome-card outcome-${decision.outcome.toLowerCase()}`}>
              <div className="outcome-signal">
                <span>{decision.outcome === "APPROVE" ? "✓" : decision.outcome === "VERIFY" ? "?" : "!"}</span>
              </div>
              <div className="outcome-copy">
                <p className="card-label">Policy-enforced recommendation</p>
                <h2>{decision.outcome}</h2>
                <h3>{decision.headline}</h3>
                <p>{decision.explanation}</p>
              </div>
              <div className="risk-score">
                <span>{decision.riskScore}</span>
                <small>illustrative policy score<br />not fraud probability</small>
              </div>
              <div className="policy-box">
                <strong>{outcomeLabels[decision.outcome]}</strong>
                <ul>
                  {decision.policyRulesApplied.map((rule) => <li key={rule}>{rule}</li>)}
                </ul>
              </div>
            </section>
          </article>
        )}
      </section>

      <aside className="coverage-note shell">
        <strong>Deployment boundary</strong>
        <span>TrustRail assumes the enrolled phone is on a participating network with the selected CAMARA capabilities. If a capability is unavailable or the {status?.decisionBudgetMs?.toLocaleString() ?? "7,000"} ms budget expires, the wallet uses its existing step-up verification.</span>
      </aside>

      <section className="scale-story shell">
        <p className="eyebrow">Why an agent—not a lookup table?</p>
        <h2>Payment situations do not arrive as four tidy fields.</h2>
        <p>
          Across MENA wallets and remittance corridors, amounts, beneficiaries, markets, device events, customer notes,
          consent and API availability combine differently. Edit the wallet note above to prove that similar payment fields
          can produce a different justified plan; deterministic policy still owns the final recommendation.
        </p>
      </section>

      <section className="principles shell">
        <div>
          <p className="eyebrow">Designed for trust</p>
          <h2>AI plans. Policy decides.<br />People stay accountable.</h2>
        </div>
        <div className="principle-grid">
          <article><b>01</b><h3>Minimum checks</h3><p>SIM and device changes are core; location and roaming are requested only when context justifies them.</p></article>
          <article><b>02</b><h3>Fail safely</h3><p>A timeout never becomes a safe answer. Mixed evidence triggers verification.</p></article>
          <article><b>03</b><h3>Privacy bounded</h3><p>Only allowlisted area-match evidence is returned. Fixed synthetic area centers stay on the server. Production consent and residency controls remain integration requirements.</p></article>
          <article><b>04</b><h3>Institution authority</h3><p>TrustRail recommends. The bank or wallet owns the final payment action.</p></article>
        </div>
      </section>

      <p className="residency-note shell">Production deployment target: process regulated data in its country of origin. This public hackathon demo does not claim production data residency.</p>

      <footer className="shell">
        <span>TrustRail MENA · Prototype Phase</span>
        <span>Powered by standardized CAMARA APIs through Nokia Network as Code</span>
      </footer>
    </main>
  );
}

export default App;
