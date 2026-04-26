"use client";

import { useEffect, useState } from "react";
import { fetchScenarios, runScenario, Scenario, RunResult } from "@/lib/api";
import ScenarioForm    from "@/components/scenario-form";
import ForecastCard    from "@/components/forecast-card";
import InventoryCard   from "@/components/inventory-card";
import DecisionCard    from "@/components/decision-card";
import WhatIfSliders, { WhatIfValues } from "@/components/what-if-sliders";
import PredictionGraph from "@/components/prediction-graph";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: number; scenario: string; action: string;
  orderQty: number; transport: string; confidence: number;
  costScore: number; ts: string;
}

interface SimulatedOrder {
  id: string; scenario: string; sku: string; qty: number;
  method: string; costPerUnit: number; totalCost: number;
  status: string; eta: string; savings: string; ts: string;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_KPI = [
  { label: "Total inventory",      value: "4,820", unit: "units",  delta: "+3.2%", up: true,  color: "#2563eb" },
  { label: "Avg days to stockout", value: "12.4",  unit: "days",   delta: "-1.1d", up: false, color: "#d97706" },
  { label: "Spoilage this week",   value: "2.3",   unit: "%",      delta: "-0.4%", up: true,  color: "#16a34a" },
  { label: "Reorders pending",     value: "3",     unit: "active", delta: "+1",    up: false, color: "#7c3aed" },
];

const MOCK_INVENTORY = [
  { sku: "PROD-A01", name: "Fresh Produce Batch A",   total: 1200, usable: 980,  expiring: 220, days: 8,  risk: "moderate" },
  { sku: "PROD-B03", name: "Dairy Supply — Zone 3",   total: 850,  usable: 820,  expiring: 30,  days: 14, risk: "low"      },
  { sku: "PROD-C07", name: "Frozen Goods Lot C7",     total: 2100, usable: 2100, expiring: 0,   days: 22, risk: "low"      },
  { sku: "PROD-D12", name: "Med Supplies Batch D",    total: 420,  usable: 140,  expiring: 280, days: 3,  risk: "critical" },
  { sku: "PROD-E05", name: "Bakery Items — East Hub", total: 250,  usable: 210,  expiring: 40,  days: 5,  risk: "high"     },
];

const MOCK_RISKS = [
  { level: "critical", title: "PROD-D12 Critical Stockout",   desc: "3 days until stockout. 66% of stock expiring. Immediate reorder required.", time: "Now"       },
  { level: "high",     title: "PROD-E05 Expiry Warning",      desc: "16% of bakery inventory expires within lead time window.",                  time: "2h ago"    },
  { level: "moderate", title: "Fuel Index Elevated",          desc: "Fuel costs at ×1.3 baseline. Consider intermodal for non-urgent shipments.", time: "4h ago"    },
  { level: "low",      title: "PROD-A01 Reorder Approaching", desc: "Inventory expected to hit reorder threshold in 8 days.",                    time: "Yesterday" },
];

const RISK_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  critical: { bg: "var(--red-bg)",   color: "var(--red)",   label: "Critical" },
  high:     { bg: "#fff7ed",         color: "#c2410c",       label: "High"     },
  moderate: { bg: "var(--amber-bg)", color: "var(--amber)",  label: "Moderate" },
  low:      { bg: "var(--green-bg)", color: "var(--green)",  label: "Low"      },
};

const PIPELINE = [
  { id: "forecast",  label: "ForecastAgent",  icon: "📈", ai: true  },
  { id: "inventory", label: "InventoryAgent", icon: "📦", ai: false },
  { id: "transport", label: "TransportAgent", icon: "🚚", ai: true  },
  { id: "decision",  label: "DecisionAgent",  icon: "🧠", ai: true  },
  { id: "llm",       label: "LLM Summary",    icon: "💬", ai: true  },
];

type PStep = "idle" | "active" | "done";
type Tab   = "overview" | "whatif" | "inventory" | "planning" | "prediction" | "risk";

let _orderId = 1000;

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [scenarios,       setScenarios]       = useState<Scenario[]>([]);
  const [selected,        setSelected]        = useState<string | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [result,          setResult]          = useState<RunResult | null>(null);
  const [pipe,            setPipe]            = useState<Record<string, PStep>>({});
  const [status,          setStatus]          = useState("");
  const [error,           setError]           = useState<string | null>(null);
  const [tab,             setTab]             = useState<Tab>("overview");
  const [history,         setHistory]         = useState<HistoryEntry[]>([]);
  const [orders,          setOrders]          = useState<SimulatedOrder[]>([]);
  const [whatIfLoading,   setWhatIfLoading]   = useState(false);
  const [simulating,      setSimulating]      = useState(false);
  const [simSuccess,      setSimSuccess]      = useState(false);

  useEffect(() => {
    fetchScenarios()
      .then(s => { setScenarios(s); if (s.length) setSelected(s[0].name); })
      .catch(() => setError("Backend unreachable — run: uvicorn main:app --port 8000"));
  }, []);

  async function animatePipeline() {
    for (let i = 0; i < PIPELINE.length; i++) {
      setPipe(p => ({ ...p, [PIPELINE[i].id]: "active" }));
      setStatus(`${PIPELINE[i].label}${PIPELINE[i].ai ? " is reasoning…" : " running…"}`);
      await delay(PIPELINE[i].ai ? 480 : 280);
      setPipe(p => ({ ...p, [PIPELINE[i].id]: "done" }));
    }
  }

  function addHistory(r: RunResult) {
    setHistory(h => [{
      id: ++_orderId,
      scenario: r.scenario,
      action: r.decision.action,
      orderQty: r.decision.order_quantity,
      transport: r.decision.transport_method,
      confidence: (r.decision as any).confidence_score ?? 75,
      costScore: r.decision.total_cost_score,
      ts: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    }, ...h].slice(0, 8));
  }

  async function handleRun() {
    if (!selected) return;
    setLoading(true); setResult(null); setError(null); setPipe({}); setTab("overview"); setSimSuccess(false);
    animatePipeline();
    try {
      const data = await runScenario(selected);
      setResult(data);
      addHistory(data);
      setStatus("Analysis complete");
    } catch {
      setError("Failed to run. Is the backend running?");
      setStatus(""); setPipe({});
    } finally { setLoading(false); }
  }

  async function handleWhatIf(vals: WhatIfValues) {
    if (!selected) return;
    setWhatIfLoading(true); setError(null); setPipe({}); setSimSuccess(false);
    animatePipeline();
    try {
      const data = await runScenario(selected, {
        fuel_cost_index:   vals.fuel_cost_index,
        demand_multiplier: vals.demand_multiplier,
        days_to_expiry:    vals.expiry_days,
      });
      setResult(data);
      addHistory(data);
      setStatus("What-if complete");
      setTab("overview");
    } catch {
      setError("What-if failed. Is the backend running?");
      setStatus(""); setPipe({});
    } finally { setWhatIfLoading(false); }
  }

  function handleSimulateOrder() {
    if (!result || !result.decision.should_reorder) return;
    setSimulating(true);

    const truck_score = result.transport.truck.total_score;
    const inter_score = result.transport.intermodal.total_score;
    const savings     = Math.abs(truck_score - inter_score);
    const cheaper     = truck_score <= inter_score ? "truck" : "intermodal";
    const method      = result.decision.transport_method;
    const lead        = method.includes("intermodal") ? result.transport.intermodal.lead_time_days : result.transport.truck.lead_time_days;
    const costPerUnit = method.includes("intermodal") ? inter_score : truck_score;
    const totalCost   = Math.round(costPerUnit * result.decision.order_quantity);

    const eta = new Date();
    eta.setDate(eta.getDate() + lead);
    const etaStr = eta.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const order: SimulatedOrder = {
      id:          `PO-${++_orderId}`,
      scenario:    result.scenario,
      sku:         "PROD-SIM",
      qty:         result.decision.order_quantity,
      method:      method,
      costPerUnit: Math.round(costPerUnit * 100) / 100,
      totalCost,
      status:      "scheduled",
      eta:         etaStr,
      savings:     `$${savings.toFixed(2)}/unit vs alternative`,
      ts:          new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    };

    setTimeout(() => {
      setOrders(o => [order, ...o]);
      setSimulating(false);
      setSimSuccess(true);
      setTab("planning");
      setTimeout(() => setSimSuccess(false), 4000);
    }, 800);
  }

  const isRunning = loading || whatIfLoading;
  const confidence = result ? ((result.decision as any).confidence_score ?? 75) : null;

  const TABS: { id: Tab; label: string; badge?: string }[] = [
    { id: "overview",    label: "Overview"       },
    { id: "whatif",      label: "What-if"        },
    { id: "inventory",   label: "Inventory"      },
    { id: "planning",    label: "Planning", badge: orders.length > 0 ? String(orders.length) : undefined },
    { id: "prediction",  label: "30-Day Forecast" },
    { id: "risk",        label: "Risk Monitor", badge: "1" },
  ];

  return (
    <div className="page">

      {/* ── Header ── */}
      <header>
        <div className="hinner">
          <div className="hleft">
            <div className="logo">
              <div className="logo-icon">SM</div>
              <span className="logo-name">SupplyMind</span>
            </div>
            <span className="beta-badge">Beta</span>
            <div className="nav-div" />
            <span className="nav-item">Dashboard</span>
          </div>
          <div className="hright">
            {confidence !== null && (
              <div className="conf-pill" style={{
                background: confidence >= 80 ? "var(--green-bg)" : confidence >= 60 ? "var(--amber-bg)" : "var(--red-bg)",
                color: confidence >= 80 ? "var(--green)" : confidence >= 60 ? "var(--amber)" : "var(--red)",
                borderColor: confidence >= 80 ? "var(--green-border)" : confidence >= 60 ? "var(--amber-border)" : "var(--red-border)",
              }}>
                AI confidence: <strong>{confidence}%</strong>
              </div>
            )}
            {simSuccess && (
              <div className="sim-success">✓ Order simulated — check Planning tab</div>
            )}
            <div className="status-wrap">
              <span className="status-dot" />
              <span className="status-txt">4 AI agents ready</span>
            </div>
          </div>
        </div>
      </header>

      <div className="layout">

        {/* ── Sidebar ── */}
        <aside>
          <div className="aside-sec">
            <ScenarioForm
              scenarios={scenarios} selected={selected}
              loading={loading} onSelect={setSelected} onRun={handleRun}
            />
          </div>

          {/* Pipeline */}
          <div className="aside-sec">
            <div className="aside-label">Agent pipeline</div>
            <div className="pipe-list">
              {PIPELINE.map((s, i) => {
                const state = pipe[s.id] || "idle";
                return (
                  <div key={s.id} className={`pipe-item pipe-${state}`}>
                    <div className="pipe-dot-col">
                      <div className={`pdot ${state === "active" ? "pdot-active" : state === "done" ? "pdot-done" : ""}`} />
                      {i < PIPELINE.length - 1 && <div className="pline" />}
                    </div>
                    <div className="pipe-info">
                      <span className="pipe-name">{s.icon} {s.label}</span>
                      {s.ai && <span className="ai-tag">AI</span>}
                    </div>
                    {state === "done"   && <span className="pcheck">✓</span>}
                    {state === "active" && <span className="pspin" />}
                  </div>
                );
              })}
            </div>
            {status && <div className="pipe-status">{status}</div>}
          </div>

          {/* Simulate order button */}
          {result?.decision.should_reorder && (
            <div className="aside-sec">
              <div className="aside-label">Actions</div>
              <button
                className={`sim-btn ${simulating ? "sim-busy" : ""}`}
                onClick={handleSimulateOrder}
                disabled={simulating}
              >
                {simulating ? <><span className="sim-spin" /> Placing order…</> : <>📋 Simulate Order</>}
              </button>
              <div className="sim-hint">
                Creates a PO for {result.decision.order_quantity} units via {result.decision.transport_method}
              </div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="aside-sec">
              <div className="aside-label">Recent runs</div>
              <div className="history-list">
                {history.map(h => (
                  <div key={h.id} className="history-item">
                    <div className="h-scenario">{h.scenario}</div>
                    <div className="h-meta">
                      <span className="h-action" style={{ color: h.action.includes("REORDER") ? "var(--red)" : "var(--green)" }}>
                        {h.action.includes("REORDER") ? "Reorder" : "Hold"}
                      </span>
                      {h.action.includes("REORDER") && <span className="h-detail">{h.orderQty} · {h.transport}</span>}
                    </div>
                    <div className="h-right">
                      <span className="h-conf" style={{ color: h.confidence >= 80 ? "var(--green)" : h.confidence >= 60 ? "var(--amber)" : "var(--red)" }}>
                        {h.confidence}%
                      </span>
                      <span className="h-time">{h.ts}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Main ── */}
        <main>
          {error && <div className="error-bar">{error}</div>}

          {/* Tabs */}
          <div className="tabs-wrap">
            {TABS.map(t => (
              <button key={t.id} className={`tab ${tab === t.id ? "tab-on" : ""}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.badge && <span className="tab-badge">{t.badge}</span>}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div className="tcontent">
              <div className="kpi-row">
                {MOCK_KPI.map(k => (
                  <div key={k.label} className="kpi-card" style={{ borderTopColor: k.color }}>
                    <div className="kpi-val">{k.value}<span className="kpi-unit"> {k.unit}</span></div>
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-delta" style={{ color: k.up ? "var(--green)" : "var(--red)" }}>{k.delta} vs last week</div>
                  </div>
                ))}
              </div>

              {result ? (
                <div className="results-grid fade-in">
                  <ForecastCard data={result.forecast} />
                  <InventoryCard data={result.inventory} />
                  <DecisionCard
                    decision={result.decision}
                    transport={result.transport}
                    inventory={result.inventory}
                    forecast={result.forecast}
                    llmExplanation={result.llm_explanation}
                  />
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">⬡</div>
                  <div className="empty-title">No analysis yet</div>
                  <div className="empty-sub">Select a scenario and run the agent pipeline to see results.</div>
                </div>
              )}
            </div>
          )}

          {/* ── WHAT-IF ── */}
          {tab === "whatif" && (
            <div className="tcontent fade-in">
              <div className="section-header">
                <div>
                  <div className="section-title">What-if Analysis</div>
                  <div className="section-sub">Adjust conditions and re-run agents to see how the decision changes</div>
                </div>
              </div>

              <WhatIfSliders onRun={handleWhatIf} loading={whatIfLoading} />

              <div className="whatif-hints">
                <div className="hint-item"><span>💡</span> Push fuel to ×2.5 — watch intermodal lose its cost advantage</div>
                <div className="hint-item"><span>💡</span> Drop shelf life to 2 days — spoilage penalty forces truck</div>
                <div className="hint-item"><span>💡</span> Spike demand to ×3 — the competitor stockout scenario live</div>
              </div>

              {result && (
                <div className="results-grid fade-in">
                  <ForecastCard data={result.forecast} />
                  <InventoryCard data={result.inventory} />
                  <DecisionCard
                    decision={result.decision}
                    transport={result.transport}
                    inventory={result.inventory}
                    forecast={result.forecast}
                    llmExplanation={result.llm_explanation}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── INVENTORY ── */}
          {tab === "inventory" && (
            <div className="tcontent fade-in">
              <div className="section-header">
                <div>
                  <div className="section-title">Inventory Monitor</div>
                  <div className="section-sub">Stock levels, expiry tracking, and risk across all SKUs</div>
                </div>
                <span className="sec-badge" style={{ background: "var(--blue-bg)", color: "var(--blue)", borderColor: "var(--blue-border)" }}>{MOCK_INVENTORY.length} SKUs</span>
              </div>
              <div className="table-wrap">
                <div className="table-head inv-cols">
                  <span>SKU</span><span>Product</span><span>Usable</span><span>Expiring</span><span>Days</span><span>Risk</span>
                </div>
                {MOCK_INVENTORY.map(item => {
                  const r = RISK_STYLE[item.risk];
                  const pct = Math.round((item.usable / item.total) * 100);
                  return (
                    <div key={item.sku} className="table-row inv-cols">
                      <span className="mono-tag">{item.sku}</span>
                      <span className="row-name">{item.name}</span>
                      <div>
                        <div className="mini-bar"><div className="mini-fill" style={{ width: `${pct}%` }} /></div>
                        <span className="mono-val">{item.usable.toLocaleString()}</span>
                      </div>
                      <span className="mono-val" style={{ color: item.expiring > 0 ? r.color : "var(--faint)" }}>
                        {item.expiring > 0 ? item.expiring : "—"}
                      </span>
                      <span className="mono-val" style={{ fontWeight: 600, color: item.days <= 5 ? r.color : "var(--text)" }}>{item.days}d</span>
                      <span className="badge" style={{ background: r.bg, color: r.color }}>{r.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── PLANNING ── */}
          {tab === "planning" && (
            <div className="tcontent fade-in">
              <div className="section-header">
                <div>
                  <div className="section-title">Reorder Planning</div>
                  <div className="section-sub">Active purchase orders — including simulated orders from agent runs</div>
                </div>
                <span className="sec-badge" style={{ background: "var(--green-bg)", color: "var(--green)", borderColor: "var(--green-border)" }}>
                  {orders.length} simulated
                </span>
              </div>

              {orders.length === 0 ? (
                <div className="empty-state" style={{ padding: "40px" }}>
                  <div className="empty-icon" style={{ fontSize: 24 }}>📋</div>
                  <div className="empty-title" style={{ fontSize: 14 }}>No simulated orders yet</div>
                  <div className="empty-sub">Run a scenario and click "Simulate Order" in the sidebar to create a purchase order.</div>
                </div>
              ) : (
                <div className="sim-orders-grid">
                  {orders.map(o => (
                    <div key={o.id} className="sim-order-card">
                      <div className="so-header">
                        <div>
                          <div className="so-id">{o.id}</div>
                          <div className="so-scenario">{o.scenario}</div>
                        </div>
                        <span className="badge" style={{ background: "var(--green-bg)", color: "var(--green)" }}>scheduled</span>
                      </div>
                      <div className="so-use-this">
                        USE THIS → {o.method}
                      </div>
                      <div className="so-rows">
                        <div className="so-row"><span>Quantity</span><strong>{o.qty.toLocaleString()} units</strong></div>
                        <div className="so-row"><span>Cost/unit</span><strong>${o.costPerUnit}</strong></div>
                        <div className="so-row"><span>Total cost</span><strong style={{ color: "var(--blue)" }}>${o.totalCost.toLocaleString()}</strong></div>
                        <div className="so-row"><span>ETA</span><strong style={{ color: "var(--green)" }}>{o.eta}</strong></div>
                        <div className="so-row"><span>Savings</span><strong style={{ color: "var(--green)" }}>{o.savings}</strong></div>
                        <div className="so-row"><span>Placed at</span><strong>{o.ts}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 30-DAY PREDICTION ── */}
          {tab === "prediction" && (
            <div className="tcontent fade-in">
              <div className="section-header" style={{ marginBottom: 12 }}>
                <div>
                  <div className="section-title">30-Day Forecast</div>
                  <div className="section-sub">
                    {result
                      ? `Projected inventory and demand for the ${result.scenario} scenario`
                      : "Run a scenario first to see the 30-day projection"}
                  </div>
                </div>
                {result && (
                  <span className="sec-badge" style={{ background: "var(--blue-bg)", color: "var(--blue)", borderColor: "var(--blue-border)" }}>
                    {result.forecast.trend} trend
                  </span>
                )}
              </div>

              {result ? (
                <PredictionGraph result={result} />
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">📈</div>
                  <div className="empty-title">No scenario selected</div>
                  <div className="empty-sub">Run any scenario from the sidebar to see the 30-day inventory and demand projection.</div>
                </div>
              )}
            </div>
          )}

          {/* ── RISK MONITOR ── */}
          {tab === "risk" && (
            <div className="tcontent fade-in">
              <div className="section-header">
                <div>
                  <div className="section-title">Risk Monitor</div>
                  <div className="section-sub">Active alerts ranked by severity</div>
                </div>
                <span className="sec-badge" style={{ background: "var(--red-bg)", color: "var(--red)", borderColor: "var(--red-border)" }}>1 critical</span>
              </div>
              <div className="risk-list">
                {MOCK_RISKS.map((r, i) => {
                  const rs = RISK_STYLE[r.level];
                  return (
                    <div key={i} className="risk-card" style={{ borderLeftColor: rs.color }}>
                      <div className="risk-top">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="badge" style={{ background: rs.bg, color: rs.color }}>{rs.label}</span>
                          <span className="risk-title">{r.title}</span>
                        </div>
                        <span className="risk-time">{r.time}</span>
                      </div>
                      <p className="risk-desc">{r.desc}</p>
                    </div>
                  );
                })}
              </div>
              <div className="risk-sum-grid">
                {Object.entries(RISK_STYLE).map(([level, rs]) => {
                  const count = MOCK_RISKS.filter(r => r.level === level).length;
                  return (
                    <div key={level} className="risk-sum" style={{ background: rs.bg }}>
                      <div className="risk-sum-n" style={{ color: rs.color }}>{count}</div>
                      <div className="risk-sum-l" style={{ color: rs.color }}>{rs.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </main>
      </div>

      <style jsx>{`
        .page { min-height: 100vh; display: flex; flex-direction: column; }

        header {
          height: 52px; background: var(--surface);
          border-bottom: 1px solid var(--border);
          padding: 0 20px; display: flex; align-items: center;
          position: sticky; top: 0; z-index: 50; box-shadow: var(--shadow-sm);
        }
        .hinner { width: 100%; display: flex; justify-content: space-between; align-items: center; }
        .hleft  { display: flex; align-items: center; gap: 10px; }
        .logo   { display: flex; align-items: center; gap: 8px; }
        .logo-icon { width: 28px; height: 28px; background: var(--text); border-radius: 7px; display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 11px; font-weight: 500; color: white; }
        .logo-name  { font-size: 14px; font-weight: 700; color: var(--text); }
        .beta-badge { font-size: 11px; font-weight: 600; color: var(--purple); background: var(--purple-bg); border: 1px solid var(--purple-border); padding: 1px 8px; border-radius: 20px; }
        .nav-div    { width: 1px; height: 16px; background: var(--border); }
        .nav-item   { font-size: 13px; color: var(--text); font-weight: 600; }
        .hright     { display: flex; align-items: center; gap: 10px; }
        .conf-pill  { font-size: 12px; font-weight: 500; padding: 4px 12px; border-radius: 20px; border: 1px solid; }
        .sim-success { font-size: 12px; font-weight: 600; color: var(--green); background: var(--green-bg); border: 1px solid var(--green-border); padding: 4px 12px; border-radius: 20px; }
        .status-wrap { display: flex; align-items: center; gap: 5px; }
        .status-dot { width: 7px; height: 7px; background: var(--green); border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
        .status-txt { font-size: 12px; color: var(--muted); font-weight: 500; }

        .layout { flex: 1; display: grid; grid-template-columns: 240px 1fr; max-width: 1400px; margin: 0 auto; width: 100%; padding: 20px; gap: 20px; align-items: start; }

        aside { position: sticky; top: 72px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); }
        .aside-sec   { padding: 14px 16px; border-bottom: 1px solid var(--border); }
        .aside-sec:last-child { border-bottom: none; }
        .aside-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }

        /* Simulate order button */
        .sim-btn {
          width: 100%; padding: 10px; background: var(--green); color: white;
          border: none; border-radius: var(--radius-sm);
          font-family: var(--sans); font-size: 13px; font-weight: 700;
          cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .sim-btn:hover:not(:disabled) { background: #15803d; box-shadow: var(--shadow-md); }
        .sim-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sim-btn.sim-busy { background: var(--muted); }
        .sim-spin { width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .sim-hint { font-size: 10px; color: var(--muted); margin-top: 6px; line-height: 1.4; }

        /* Pipeline */
        .pipe-list { display: flex; flex-direction: column; }
        .pipe-item { display: flex; align-items: flex-start; gap: 8px; }
        .pipe-dot-col { display: flex; flex-direction: column; align-items: center; width: 12px; padding-top: 4px; flex-shrink: 0; }
        .pdot { width: 8px; height: 8px; border-radius: 50%; background: var(--border2); border: 2px solid var(--border); transition: all 0.2s; }
        .pdot-active { background: var(--blue); border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-bg); }
        .pdot-done   { background: var(--green); border-color: var(--green); }
        .pline { width: 2px; flex: 1; min-height: 18px; background: var(--border); margin-top: 2px; }
        .pipe-info { display: flex; align-items: center; gap: 5px; flex: 1; padding: 2px 0 10px; }
        .pipe-name { font-size: 12px; font-weight: 500; color: var(--muted); }
        .pipe-item.pipe-done .pipe-name   { color: var(--text); }
        .pipe-item.pipe-active .pipe-name { color: var(--blue); font-weight: 600; }
        .ai-tag  { font-size: 9px; font-weight: 700; color: var(--purple); background: var(--purple-bg); border: 1px solid var(--purple-border); padding: 0 4px; border-radius: 3px; }
        .pcheck  { font-size: 11px; color: var(--green); font-weight: 700; margin-left: auto; }
        .pspin   { width: 10px; height: 10px; border: 2px solid var(--blue-bg); border-top-color: var(--blue); border-radius: 50%; animation: spin 0.7s linear infinite; margin-left: auto; }
        .pipe-status { font-size: 11px; color: var(--blue); margin-top: 6px; font-weight: 500; }

        /* History */
        .history-list { display: flex; flex-direction: column; gap: 6px; }
        .history-item { padding: 8px 10px; background: var(--surface2); border-radius: var(--radius-xs); border: 1px solid var(--border); display: grid; grid-template-columns: 1fr auto; gap: 4px; }
        .h-scenario { font-size: 11px; font-weight: 700; color: var(--text); grid-column: 1; }
        .h-meta     { font-size: 10px; color: var(--muted); grid-column: 1; display: flex; gap: 5px; align-items: center; }
        .h-action   { font-weight: 700; font-size: 10px; }
        .h-detail   { color: var(--muted); }
        .h-right    { grid-column: 2; grid-row: 1 / 3; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 2px; }
        .h-conf     { font-size: 11px; font-weight: 700; }
        .h-time     { font-size: 10px; color: var(--faint); }

        main { display: flex; flex-direction: column; gap: 12px; min-width: 0; }

        .error-bar { padding: 10px 14px; background: var(--red-bg); border: 1px solid var(--red-border); border-radius: var(--radius-sm); font-size: 13px; color: var(--red); font-weight: 500; }

        .tabs-wrap { display: flex; gap: 2px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; box-shadow: var(--shadow-sm); }
        .tab { flex: 1; padding: 7px 6px; background: transparent; border: none; border-radius: var(--radius-xs); font-family: var(--sans); font-size: 12px; font-weight: 500; color: var(--muted); cursor: pointer; transition: all 0.1s; display: flex; align-items: center; justify-content: center; gap: 4px; }
        .tab:hover  { background: var(--surface2); color: var(--text); }
        .tab-on     { background: var(--surface2) !important; color: var(--text) !important; font-weight: 600; box-shadow: var(--shadow-sm); }
        .tab-badge  { background: var(--green); color: white; font-size: 10px; font-weight: 700; min-width: 15px; height: 15px; border-radius: 20px; padding: 0 4px; display: flex; align-items: center; justify-content: center; }

        .tcontent { display: flex; flex-direction: column; gap: 12px; }
        .fade-in  { animation: fadeUp 0.25s ease forwards; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }

        .kpi-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
        .kpi-card { background: var(--surface); border: 1px solid var(--border); border-top: 3px solid; border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow-sm); }
        .kpi-val  { font-size: 22px; font-weight: 700; color: var(--text); line-height: 1; }
        .kpi-unit { font-size: 12px; font-weight: 500; color: var(--muted); }
        .kpi-label{ font-size: 11px; color: var(--muted); margin-top: 3px; }
        .kpi-delta{ font-size: 11px; font-weight: 600; margin-top: 5px; }

        .results-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); gap: 8px; box-shadow: var(--shadow-sm); }
        .empty-icon  { font-size: 32px; opacity: 0.3; animation: rotate 10s linear infinite; }
        @keyframes rotate { to { transform: rotate(360deg); } }
        .empty-title { font-size: 16px; font-weight: 700; color: var(--text); }
        .empty-sub   { font-size: 13px; color: var(--muted); text-align: center; max-width: 300px; }

        .whatif-hints { display: flex; flex-direction: column; gap: 6px; }
        .hint-item { font-size: 12px; color: var(--muted); display: flex; gap: 8px; background: var(--surface); padding: 8px 12px; border-radius: var(--radius-xs); border: 1px solid var(--border); }

        .section-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .section-title  { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
        .section-sub    { font-size: 12px; color: var(--muted); }
        .sec-badge { padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid; }

        /* Inventory table */
        .table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); }
        .table-head { display: grid; padding: 10px 16px; background: var(--surface2); font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; gap: 12px; }
        .table-row  { display: grid; padding: 12px 16px; border-top: 1px solid var(--border); align-items: center; gap: 12px; transition: background 0.1s; }
        .table-row:hover { background: var(--surface2); }
        .inv-cols { grid-template-columns: 90px 1fr 110px 80px 60px 80px; }
        .mono-tag { font-family: var(--mono); font-size: 11px; background: var(--surface2); padding: 2px 7px; border-radius: 4px; color: var(--muted); border: 1px solid var(--border); }
        .mono-val { font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--text); }
        .row-name { font-size: 13px; font-weight: 500; color: var(--text); }
        .mini-bar { height: 3px; background: var(--surface2); border-radius: 2px; overflow: hidden; margin-bottom: 3px; }
        .mini-fill{ height: 100%; background: var(--green); border-radius: 2px; }
        .badge    { padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap; }

        /* Simulated orders */
        .sim-orders-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .sim-order-card  { background: var(--surface); border: 1px solid var(--green-border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow-sm); }
        .so-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
        .so-id     { font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--text); }
        .so-scenario{ font-size: 11px; color: var(--muted); margin-top: 2px; }
        .so-use-this {
          font-size: 12px; font-weight: 800;
          color: white; background: var(--green);
          padding: 5px 12px; border-radius: var(--radius-xs);
          margin-bottom: 12px; text-align: center;
          letter-spacing: 0.3px;
        }
        .so-rows { display: flex; flex-direction: column; gap: 5px; }
        .so-row  { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); padding: 3px 0; border-bottom: 1px solid var(--border); }
        .so-row:last-child { border: none; }
        .so-row strong { color: var(--text); font-weight: 600; }

        /* Risk */
        .risk-list { display: flex; flex-direction: column; gap: 8px; }
        .risk-card { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid; border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow-sm); }
        .risk-top  { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .risk-title{ font-size: 13px; font-weight: 700; color: var(--text); }
        .risk-time { font-size: 11px; color: var(--muted); }
        .risk-desc { font-size: 12px; color: var(--muted); line-height: 1.5; }
        .risk-sum-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
        .risk-sum  { border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; text-align: center; box-shadow: var(--shadow-sm); }
        .risk-sum-n{ font-size: 26px; font-weight: 800; line-height: 1; }
        .risk-sum-l{ font-size: 12px; font-weight: 600; margin-top: 3px; }

        @media (max-width: 1100px) { .kpi-row { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 900px) {
          .layout { grid-template-columns: 1fr; padding: 12px; }
          aside { position: static; }
          .results-grid { grid-template-columns: 1fr; }
          .sim-orders-grid { grid-template-columns: 1fr; }
          .tabs-wrap .tab { font-size: 11px; }
        }
      `}</style>
    </div>
  );
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
