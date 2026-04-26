"use client";

import { useEffect, useState } from "react";
import { fetchScenarios, runScenario, Scenario, RunResult } from "@/lib/api";
import ScenarioForm from "@/components/scenario-form";
import ForecastCard from "@/components/forecast-card";
import InventoryCard from "@/components/inventory-card";
import TransportCard from "@/components/transport-card";
import DecisionCard from "@/components/decision-card";

const PIPELINE = [
  { id: "forecast",  label: "ForecastAgent",  icon: "📈", color: "#e8f4fd", text: "#1a6aa8" },
  { id: "inventory", label: "InventoryAgent",  icon: "📦", color: "#e6f9ee", text: "#1a7a3c" },
  { id: "transport", label: "TransportAgent",  icon: "🚚", color: "#fff4e0", text: "#c47a00" },
  { id: "decision",  label: "DecisionAgent",   icon: "🧠", color: "#f8f5ff", text: "#7c5cbf" },
  { id: "llm",       label: "LLM Explainer",   icon: "💬", color: "#fdeaea", text: "#b91c1c" },
];

type PStep = "idle" | "active" | "done";

export default function Home() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [pipeState, setPipeState] = useState<Record<string, PStep>>({});
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchScenarios()
      .then((s) => {
        setScenarios(s);
        if (s.length) setSelected(s[0].name);
      })
      .catch(() => setError("Can't reach the backend. Run: uvicorn main:app --port 8000"));
  }, []);

  async function handleRun() {
    if (!selected) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setPipeState({});

    for (let i = 0; i < PIPELINE.length; i++) {
      setPipeState((p) => ({ ...p, [PIPELINE[i].id]: "active" }));
      setStatusMsg(`Running ${PIPELINE[i].label}…`);
      await delay(380);
      setPipeState((p) => ({ ...p, [PIPELINE[i].id]: "done" }));
    }

    try {
      const data = await runScenario(selected);
      setResult(data);
      setStatusMsg("All agents finished ✓");
    } catch {
      setError("Something went wrong. Is the backend running?");
      setStatusMsg("");
      setPipeState({});
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
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
          <div className="live-badge">
            <span className="live-dot" />
            5 agents online
          </div>
        </div>
      </header>

      <div className="body">
        {/* Sidebar */}
        <aside>
          <ScenarioForm
            scenarios={scenarios}
            selected={selected}
            loading={loading}
            onSelect={setSelected}
            onRun={handleRun}
          />
        </aside>

        {/* Main */}
        <main>
          {/* Pipeline */}
          <div className="pipeline-wrap">
            <div className="pipeline">
              {PIPELINE.map((s, i) => {
                const state = pipeState[s.id] || "idle";
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center" }}>
                    <div
                      className={`pnode pnode-${state}`}
                      style={state !== "idle" ? { background: s.color, borderColor: "transparent" } : {}}
                    >
                      <span className="pnode-icon">{s.icon}</span>
                      <span className="pnode-label" style={state !== "idle" ? { color: s.text } : {}}>
                        {s.label}
                      </span>
                      {state === "done" && <span className="pnode-check" style={{ color: s.text }}>✓</span>}
                      {state === "active" && <span className="pnode-spinner" />}
                    </div>
                    {i < PIPELINE.length - 1 && (
                      <span className={`parrow ${pipeState[s.id] === "done" ? "parrow-lit" : ""}`}>→</span>
                    )}
                  </div>
                );
              })}
            </div>
            {statusMsg && <p className="status-msg">{statusMsg}</p>}
          </div>

          {error && <div className="error-box">{error}</div>}

          {result ? (
            <div className="results">
              <div className="cards-grid">
                <ForecastCard data={result.forecast} />
                <InventoryCard data={result.inventory} />
                <TransportCard data={result.transport} />
                <DecisionCard decision={result.decision} llmExplanation={result.llm_explanation} />
              </div>
            </div>
          ) : !loading && !error ? (
            <div className="empty">
              <div className="empty-emoji">🏭</div>
              <p className="empty-title">Ready to optimize</p>
              <p className="empty-sub">Pick a scenario and hit Run to see all 5 agents in action.</p>
            </div>
          ) : null}
        </main>
      </div>

      <style jsx>{`
        .page { min-height: 100vh; display: flex; flex-direction: column; }

        header {
          background: white;
          border-bottom: 2px solid var(--border);
          padding: 0 28px;
          height: 60px;
          display: flex;
          align-items: center;
          position: sticky;
          top: 0;
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
          width: 36px; height: 36px;
          background: var(--text);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 500;
          color: white;
        }

        .logo-name { font-weight: 800; font-size: 17px; color: var(--text); line-height: 1.2; }
        .logo-sub { font-size: 11px; color: var(--muted); font-weight: 600; }

        .live-badge {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 14px;
          background: #e6f9ee;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 700;
          color: #1a7a3c;
        }

        .live-dot {
          width: 7px; height: 7px;
          background: var(--green);
          border-radius: 50%;
          animation: pulse 2s infinite;
          display: inline-block;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.7); opacity: 0.5; }
        }

        .body {
          flex: 1;
          display: grid;
          grid-template-columns: 290px 1fr;
          gap: 0;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
          padding: 28px;
          gap: 28px;
          align-items: start;
        }

        aside {
          position: sticky;
          top: 88px;
          background: white;
          border: 2px solid var(--border);
          border-radius: var(--radius);
          padding: 20px;
        }

        main { display: flex; flex-direction: column; gap: 20px; }

        .pipeline-wrap {
          background: white;
          border: 2px solid var(--border);
          border-radius: var(--radius);
          padding: 16px 20px;
        }

        .pipeline {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 4px;
        }

        .pnode {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border: 2px solid var(--border);
          border-radius: 30px;
          font-size: 13px;
          font-weight: 700;
          color: var(--muted);
          background: var(--surface2);
          transition: all 0.2s;
        }

        .pnode-active {
          transform: scale(1.03);
        }

        .pnode-icon { font-size: 14px; }
        .pnode-label { color: inherit; }
        .pnode-check { font-size: 12px; }

        .pnode-spinner {
          width: 11px; height: 11px;
          border: 2px solid rgba(0,0,0,0.15);
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .parrow { font-size: 14px; color: var(--border); padding: 0 2px; transition: color 0.2s; }
        .parrow-lit { color: var(--green); }

        .status-msg {
          font-size: 12px;
          color: var(--muted);
          font-weight: 600;
          margin-top: 8px;
        }

        .error-box {
          background: #fdeaea;
          border: 2px solid #fca5a5;
          border-radius: var(--rsm);
          padding: 14px 18px;
          font-size: 14px;
          font-weight: 600;
          color: #b91c1c;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          animation: fadeUp 0.35s ease forwards;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 72px 0;
          text-align: center;
          gap: 8px;
        }

        .empty-emoji { font-size: 52px; margin-bottom: 4px; }
        .empty-title { font-size: 20px; font-weight: 800; color: var(--text); }
        .empty-sub { font-size: 14px; color: var(--muted); font-weight: 600; max-width: 280px; }

        @media (max-width: 900px) {
          .body { grid-template-columns: 1fr; padding: 16px; }
          aside { position: static; }
          .cards-grid { grid-template-columns: 1fr; }
          .pipeline { gap: 6px; }
          .parrow { display: none; }
        }
      `}</style>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
