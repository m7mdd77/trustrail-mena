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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/status").then((response) => response.json()),
      fetch("/api/scenarios").then((response) => response.json()),
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

  async function runDecision() {
    setLoading(true);
    setError("");
    setDecision(null);
    try {
      const response = await fetch("/api/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: selected }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? payload.error ?? "Decision failed");
      setDecision(payload);
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
            <i /> {status?.runtimeMode === "nokia-live" ? "Nokia simulator connected" : "Fixture preview mode"}
          </span>
          <span className="nav-copy">Bank stays in control</span>
        </div>
      </nav>

      <header className="hero shell" id="top">
        <section>
          <p className="eyebrow">Network-native fraud decisions</p>
          <h1>Let the network speak<br />before the money moves.</h1>
          <p className="hero-copy">
            TrustRail is a bounded AI agent that asks Nokia Network as Code for the minimum useful telecom evidence,
            then recommends approve, verify, or hold—with every reason visible.
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
            <li><b>01</b><span>Read transaction context</span></li>
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
          <p>Documented Nokia test devices only. No real subscriber data.</p>
        </div>

        <div className="scenario-grid">
          {scenarios.map((scenario) => (
            <button
              type="button"
              key={scenario.id}
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
                {decision.plan.planner === "llm-agent" ? "AI planner" : "Bounded agent fallback"}
              </span>
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
                <small>risk score<br />out of 100</small>
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

      <section className="principles shell">
        <div>
          <p className="eyebrow">Designed for trust</p>
          <h2>AI plans. Policy decides.<br />People stay accountable.</h2>
        </div>
        <div className="principle-grid">
          <article><b>01</b><h3>Minimum checks</h3><p>The agent calls only the signals justified by the payment context.</p></article>
          <article><b>02</b><h3>Fail safely</h3><p>A timeout never becomes a safe answer. Mixed evidence triggers verification.</p></article>
          <article><b>03</b><h3>Privacy bounded</h3><p>Location is verified as an area match; precise coordinates are not retained.</p></article>
          <article><b>04</b><h3>Institution authority</h3><p>TrustRail recommends. The bank or wallet owns the final payment action.</p></article>
        </div>
      </section>

      <footer className="shell">
        <span>TrustRail MENA · Prototype Phase</span>
        <span>Powered by standardized CAMARA APIs through Nokia Network as Code</span>
      </footer>
    </main>
  );
}

export default App;

