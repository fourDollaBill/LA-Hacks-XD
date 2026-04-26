"use client";

import { useEffect, useState } from "react";
import { fetchScenarios, runScenario, Scenario, RunResult } from "@/lib/api";
import ScenarioForm from "@/components/scenario-form";
import ForecastCard from "@/components/forecast-card";
import InventoryCard from "@/components/inventory-card";
import TransportCard from "@/components/transport-card";
import DecisionCard from "@/components/decision-card";

const PIPELINE_STEPS = [
  { id: "forecast",  label: "ForecastAgent",  icon: "📈" },
  { id: "inventory", label: "InventoryAgent",  icon: "📦" },
  { id: "transport", label: "TransportAgent",  icon: "🚚" },
  { id: "decision",  label: "DecisionAgent",   icon: "🧠" },
  { id: "llm",       label: "LLM Explainer",   icon: "💬" },
];

type PipelineState = Record<string, "idle" | "active" | "done">;

export default function Home() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [pipeline, setPipeline] = useState<PipelineState>({});
  const [statusMsg, setStatusMsg] = useState("Select a scenario and run the agents");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchScenarios()
      .then((s) => {
        setScenarios(s);
        if (s.length > 0) setSelected(s[0].name);
      })
      .catch(() => setError("⚠ Backend unreachable — run: uvicorn main:app --port 8000"));
  }, []);

  async function handleRun() {
    if (!selected) return;
    setLoading(true);
    setResult(null);
    setError(null);

    // Animate pipeline steps
    const steps = PIPELINE_STEPS.map((s) => s.id);
    for (let i = 0; i < steps.length; i++) {
      setPipeline((prev) => ({ ...prev, [steps[i]]: "active" }));
      setStatusMsg(`Running ${PIPELINE_STEPS[i].label}...`);
      await delay(380);
      setPipeline((prev) => ({ ...prev, [steps[i]]: "done" }));
    }

    try {
      const data = await runScenario(selected);
      setResult(data);
      setStatusMsg("✓ All agents completed");
    } catch (e) {
      setError("Failed to run scenario. Is the backend running?");
      setStatusMsg("Error");
      setPipeline({});
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="layout">
      {/* Header */}
      <header>
        <div className="header-inner">
          <div className="logo">
            <div className="logo-mark">SM</div>
            <div>
              <div className="logo-name">SupplyMind</div>
              <div className="logo-sub">Multi-Agent Supply Chain Optimizer</div>
            </div>
          </div>
          <div className="header-right">
            <div className="agents-badge">
              <span className="pulse" />
              5 AGENTS ONLINE
            </div>
          </div>
        </div>
      </header>

      <main>
        <div className="content">
          {/* Left sidebar */}
          <aside>
            <ScenarioForm
              scenarios={scenarios}
              selected={selected}
              loading={loading}
              onSelect={setSelected}
              onRun={handleRun}
            />
          </aside>

          {/* Right main area */}
          <div className="main-area">

            {/* Pipeline */}
            <div className="pipeline-section">
              <div className="section-label">// AGENT PIPELINE</div>
              <div className="pipeline">
                {PIPELINE_STEPS.map((step, i) => (
                  <div key={step.id} style={{ display: "flex", alignItems: "center" }}>
                    <div className={`pipeline-node ${pipeline[step.id] || "idle"}`}>
                      <span className="node-icon">{step.icon}</span>
                      <span className="node-label">{step.label}</span>
                      {pipeline[step.id] === "done" && <span className="node-check">✓</span>}
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className={`pipeline-arrow ${pipeline[step.id] === "done" ? "lit" : ""}`}>→</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="status-msg">{statusMsg}</div>
            </div>

            {error && <div className="error-banner">{error}</div>}

            {/* Results */}
            {result && (
              <div className="results fade-in">
                <div className="section-label">// AGENT OUTPUTS</div>
                <div className="cards-grid">
                  <ForecastCard data={result.forecast} />
                  <InventoryCard data={result.inventory} />
                  <TransportCard data={result.transport} />
                  <DecisionCard
                    decision={result.decision}
                    llmExplanation={result.llm_explanation}
                  />
                </div>
              </div>
            )}

            {!result && !loading && (
              <div className="empty-state">
                <div className="empty-icon">⬡</div>
                <div className="empty-text">Run a scenario to see agent outputs</div>
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        header {
          border-bottom: 1px solid var(--border);
          padding: 0 24px;
          height: 56px;
          display: flex;
          align-items: center;
          position: sticky;
          top: 0;
          background: rgba(8, 10, 14, 0.95);
          backdrop-filter: blur(8px);
          z-index: 50;
        }

        .header-inner {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .logo { display: flex; align-items: center; gap: 12px; }

        .logo-mark {
          width: 32px; height: 32px;
          background: linear-gradient(135deg, var(--accent), #0077aa);
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 700;
          color: #000;
        }

        .logo-name {
          font-family: var(--mono);
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.3px;
        }

        .logo-sub {
          font-family: var(--mono);
          font-size: 9px;
          color: var(--muted);
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .agents-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border: 1px solid rgba(0, 212, 255, 0.25);
          border-radius: 20px;
          font-family: var(--mono);
          font-size: 10px;
          color: var(--accent);
          letter-spacing: 1px;
          background: rgba(0, 212, 255, 0.05);
        }

        .pulse {
          width: 6px; height: 6px;
          background: var(--accent);
          border-radius: 50%;
          animation: pulse 2s infinite;
          display: inline-block;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.7); }
        }

        main { flex: 1; padding: 24px; }

        .content {
          max-width: 1400px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 24px;
        }

        aside {
          position: sticky;
          top: 80px;
          height: fit-content;
        }

        .main-area { display: flex; flex-direction: column; gap: 20px; }

        .section-label {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 2px;
          color: var(--muted);
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .pipeline {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0;
        }

        .pipeline-node {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border: 1px solid var(--border);
          border-radius: 5px;
          font-family: var(--mono);
          font-size: 11px;
          color: var(--muted);
          transition: all 0.25s;
          background: var(--surface);
        }

        .pipeline-node.active {
          border-color: var(--accent);
          color: var(--accent);
          background: rgba(0, 212, 255, 0.06);
          box-shadow: 0 0 12px rgba(0, 212, 255, 0.2);
        }

        .pipeline-node.done {
          border-color: var(--green);
          color: var(--green);
          background: rgba(0, 230, 118, 0.04);
        }

        .node-icon { font-size: 12px; }
        .node-check { font-size: 10px; }

        .pipeline-arrow {
          font-family: var(--mono);
          font-size: 12px;
          color: var(--border2);
          padding: 0 6px;
          transition: color 0.25s;
        }

        .pipeline-arrow.lit { color: var(--green); }

        .status-msg {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--muted);
          margin-top: 8px;
          letter-spacing: 0.5px;
        }

        .error-banner {
          padding: 12px 16px;
          border: 1px solid var(--red);
          border-radius: 6px;
          background: rgba(255, 61, 87, 0.06);
          font-family: var(--mono);
          font-size: 11px;
          color: var(--red);
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 80px 0;
          color: var(--muted);
        }

        .empty-icon {
          font-size: 40px;
          opacity: 0.3;
          animation: rotate 8s linear infinite;
        }

        .empty-text {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 1px;
        }

        @keyframes rotate { to { transform: rotate(360deg); } }

        .fade-in { animation: fadeIn 0.35s ease forwards; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 900px) {
          .content { grid-template-columns: 1fr; }
          aside { position: static; }
          .cards-grid { grid-template-columns: 1fr; }
          .pipeline { gap: 4px; }
          .pipeline-arrow { display: none; }
        }
      `}</style>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
