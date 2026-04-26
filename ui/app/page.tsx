"use client";

import { useEffect, useState } from "react";
import { fetchScenarios, runScenario, Scenario, RunResult } from "@/lib/api";
import ScenarioForm from "@/components/scenario-form";
import ForecastCard from "@/components/forecast-card";
import InventoryCard from "@/components/inventory-card";
import TransportCard from "@/components/transport-card";
import DecisionCard from "@/components/decision-card";

// ── Mock / baseline data ──────────────────────────────────────────────────────

const MOCK_KPI = [
  { label: "Total Inventory",      value: "4,820", unit: "units",  delta: "+3.2%", up: true,  color: "#2e7de8", bg: "#e8f4fd" },
  { label: "Avg Days to Stockout", value: "12.4",  unit: "days",   delta: "-1.1d", up: false, color: "#f0921a", bg: "#fff4e0" },
  { label: "Spoilage This Week",   value: "2.3",   unit: "%",      delta: "-0.4%", up: true,  color: "#0d9e75", bg: "#e6f9ee" },
  { label: "Reorders Pending",     value: "3",     unit: "active", delta: "+1",    up: false, color: "#7c5cbf", bg: "#f8f5ff" },
];

const MOCK_INVENTORY = [
  { sku: "PROD-A01", name: "Fresh Produce Batch A",  total: 1200, usable: 980,  expiring: 220, days: 8,  risk: "moderate" },
  { sku: "PROD-B03", name: "Dairy Supply — Zone 3",  total: 850,  usable: 820,  expiring: 30,  days: 14, risk: "low"      },
  { sku: "PROD-C07", name: "Frozen Goods Lot C7",    total: 2100, usable: 2100, expiring: 0,   days: 22, risk: "low"      },
  { sku: "PROD-D12", name: "Med Supplies Batch D",   total: 420,  usable: 140,  expiring: 280, days: 3,  risk: "critical" },
  { sku: "PROD-E05", name: "Bakery Items — East Hub",total: 250,  usable: 210,  expiring: 40,  days: 5,  risk: "high"     },
];

const MOCK_PLANNING = [
  { id: "PO-2041", sku: "PROD-D12", qty: 400, method: "Truck",      eta: "Tomorrow",  status: "urgent",     cost: "$1,820" },
  { id: "PO-2040", sku: "PROD-A01", qty: 300, method: "Intermodal", eta: "In 5 days", status: "scheduled",  cost: "$840"   },
  { id: "PO-2039", sku: "PROD-E05", qty: 200, method: "Truck",      eta: "In 2 days", status: "in-transit", cost: "$900"   },
  { id: "PO-2038", sku: "PROD-B03", qty: 500, method: "Intermodal", eta: "In 5 days", status: "scheduled",  cost: "$1,400" },
];

const MOCK_RISKS = [
  { level: "critical", title: "PROD-D12 Critical Stockout",   desc: "3 days until stockout. 66% of stock expiring. Immediate reorder required.", time: "Now"       },
  { level: "high",     title: "PROD-E05 Expiry Warning",      desc: "16% of bakery inventory expires within lead time window.",                  time: "2h ago"    },
  { level: "moderate", title: "Fuel Index Elevated",          desc: "Fuel costs at ×1.3 baseline. Consider intermodal for non-urgent shipments.", time: "4h ago"    },
  { level: "low",      title: "PROD-A01 Reorder Approaching", desc: "Inventory expected to hit reorder threshold in 8 days.",                    time: "Yesterday" },
];

// Stock policy rows — calculated from demand + lead times
const MOCK_STOCK_POLICY = [
  { sku: "PROD-A01", name: "Fresh Produce Batch A",  dailyDemand: 85,  leadTruck: 2, leadInter: 5, shelfLife: 8,  safetyDays: 2 },
  { sku: "PROD-B03", name: "Dairy Supply — Zone 3",  dailyDemand: 60,  leadTruck: 2, leadInter: 5, shelfLife: 14, safetyDays: 3 },
  { sku: "PROD-C07", name: "Frozen Goods Lot C7",    dailyDemand: 95,  leadTruck: 2, leadInter: 5, shelfLife: 30, safetyDays: 4 },
  { sku: "PROD-D12", name: "Med Supplies Batch D",   dailyDemand: 45,  leadTruck: 2, leadInter: 5, shelfLife: 10, safetyDays: 3 },
  { sku: "PROD-E05", name: "Bakery Items — East Hub",dailyDemand: 42,  leadTruck: 2, leadInter: 5, shelfLife: 5,  safetyDays: 1 },
];

const RISK_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  critical: { bg: "#fdeaea", color: "#b91c1c", border: "#fca5a5", label: "Critical" },
  high:     { bg: "#fff0e8", color: "#c24a10", border: "#fdba74", label: "High"     },
  moderate: { bg: "#fff4e0", color: "#c47a00", border: "#fcd34d", label: "Moderate" },
  low:      { bg: "#e6f9ee", color: "#1a7a3c", border: "#86efac", label: "Low"      },
};

// ── Pipeline ──────────────────────────────────────────────────────────────────

const PIPELINE = [
  { id: "forecast",  label: "ForecastAgent", icon: "📈", color: "#e8f4fd", text: "#1a6aa8" },
  { id: "inventory", label: "InventoryAgent",icon: "📦", color: "#e6f9ee", text: "#1a7a3c" },
  { id: "transport", label: "TransportAgent",icon: "🚚", color: "#fff4e0", text: "#c47a00" },
  { id: "decision",  label: "DecisionAgent", icon: "🧠", color: "#f8f5ff", text: "#7c5cbf" },
  { id: "llm",       label: "LLM Explainer", icon: "💬", color: "#fdeaea", text: "#b91c1c" },
];

type PStep = "idle" | "active" | "done";
type Tab   = "overview" | "inventory" | "planning" | "stock" | "risk";

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<RunResult | null>(null);
  const [pipeState, setPipeState] = useState<Record<string, PStep>>({});
  const [statusMsg, setStatusMsg] = useState("");
  const [error,     setError]     = useState<string | null>(null);
  const [tab,       setTab]       = useState<Tab>("overview");

  useEffect(() => {
    fetchScenarios()
      .then((s) => { setScenarios(s); if (s.length) setSelected(s[0].name); })
      .catch(() => setError("Can't reach the backend — run: uvicorn main:app --port 8000"));
  }, []);

  async function handleRun() {
    if (!selected) return;
    setLoading(true); setResult(null); setError(null); setPipeState({}); setTab("overview");
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
      setStatusMsg(""); setPipeState({});
    } finally { setLoading(false); }
  }

  // ── Stock policy calculation ──────────────────────────────────────────────
  // If agents ran, use their demand; otherwise use mock baselines
  const stockRows = MOCK_STOCK_POLICY.map((item) => {
    const daily = (result && item.sku === "PROD-A01")
      ? result.forecast.predicted_demand
      : item.dailyDemand;
    const cycleStock   = daily * item.leadTruck;             // cover truck lead time
    const safetyStock  = daily * item.safetyDays;            // buffer for demand spikes
    const minStock     = cycleStock + safetyStock;           // reorder point
    const maxStock     = Math.min(daily * (item.leadInter + item.safetyDays + 3), daily * item.shelfLife);
    const reorderPoint = minStock;
    const orderQty     = maxStock - minStock;
    return { ...item, daily, cycleStock, safetyStock, minStock, maxStock, reorderPoint, orderQty };
  });

  const TABS: { id: Tab; label: string; badge?: string }[] = [
    { id: "overview",  label: "📊 Overview"      },
    { id: "inventory", label: "📦 Inventory"     },
    { id: "planning",  label: "📋 Planning"      },
    { id: "stock",     label: "📐 Stock Policy"  },
    { id: "risk",      label: "⚠️ Risk Monitor", badge: "1" },
  ];

  return (
    <div className="page">

      {/* Header */}
      <header>
        <div className="hinner">
          <div className="logo">
            <div className="logo-mark">SM</div>
            <div>
              <div className="logo-name">SupplyMind</div>
              <div className="logo-sub">Multi-Agent Supply Chain Optimizer</div>
            </div>
          </div>
          <div className="hright">
            <div className="stat-pill">
              <span style={{ color: "#0d9e75", fontWeight: 800 }}>4,820</span> units tracked
            </div>
            <div className="stat-pill" style={{ background: "#fdeaea", color: "#b91c1c" }}>
              <span style={{ fontWeight: 800 }}>1</span> critical alert
            </div>
            <div className="live-badge">
              <span className="live-dot" /> 5 agents online
            </div>
          </div>
        </div>
      </header>

      <div className="body">

        {/* Sidebar */}
        <aside>
          <ScenarioForm
            scenarios={scenarios} selected={selected}
            loading={loading} onSelect={setSelected} onRun={handleRun}
          />
        </aside>

        {/* Main */}
        <main>

          {/* Pipeline */}
          <div className="card">
            <div className="sec-label">Agent Pipeline</div>
            <div className="pipeline">
              {PIPELINE.map((s, i) => {
                const state = pipeState[s.id] || "idle";
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center" }}>
                    <div className="pnode" style={state !== "idle" ? { background: s.color, borderColor: "transparent", color: s.text } : {}}>
                      <span>{s.icon}</span><span>{s.label}</span>
                      {state === "done"   && <span style={{ color: s.text }}>✓</span>}
                      {state === "active" && <span className="pspinner" />}
                    </div>
                    {i < PIPELINE.length - 1 && (
                      <span className={`parrow ${state === "done" ? "lit" : ""}`}>→</span>
                    )}
                  </div>
                );
              })}
            </div>
            {statusMsg && <p className="status-msg">{statusMsg}</p>}
          </div>

          {error && <div className="error-box">{error}</div>}

          {/* Tabs */}
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? "tab-on" : ""}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.badge && <span className="tbadge">{t.badge}</span>}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div className="tcontent">
              <div className="kpi-grid">
                {MOCK_KPI.map((k) => (
                  <div key={k.label} className="kpi-card" style={{ borderTopColor: k.color }}>
                    <div className="kpi-dot" style={{ background: k.bg }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: k.color }} />
                    </div>
                    <div className="kpi-val">{k.value} <span className="kpi-unit">{k.unit}</span></div>
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-delta" style={{ color: k.up ? "#0d9e75" : "#e84c3d" }}>{k.delta} vs last week</div>
                  </div>
                ))}
              </div>
              {result ? (
                <div className="cards-grid fade-in">
                  <ForecastCard data={result.forecast} />
                  <InventoryCard data={result.inventory} />
                  <TransportCard data={result.transport} />
                  <DecisionCard decision={result.decision} llmExplanation={result.llm_explanation} />
                </div>
              ) : (
                <div className="placeholder">
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                  <div className="ph-title">Agent outputs appear here</div>
                  <div className="ph-sub">Select a scenario on the left and click Run all agents.</div>
                </div>
              )}
            </div>
          )}

          {/* ── INVENTORY ── */}
          {tab === "inventory" && (
            <div className="tcontent fade-in">
              <div className="sheader">
                <div>
                  <div className="stitle">Inventory Monitor</div>
                  <div className="ssub">Live stock levels, expiry tracking, and usability across all SKUs</div>
                </div>
                <div className="sbadge" style={{ background: "#e8f4fd", color: "#1a6aa8" }}>{MOCK_INVENTORY.length} SKUs tracked</div>
              </div>
              <div className="inv-table">
                <div className="inv-head">
                  <span>SKU</span><span>Product</span><span>Total</span>
                  <span>Usable</span><span>Expiring</span><span>Days</span><span>Risk</span>
                </div>
                {MOCK_INVENTORY.map((item) => {
                  const r = RISK_STYLE[item.risk];
                  const pct = Math.round((item.usable / item.total) * 100);
                  return (
                    <div key={item.sku} className="inv-row">
                      <span className="sku">{item.sku}</span>
                      <span className="inv-name">{item.name}</span>
                      <span className="mono">{item.total.toLocaleString()}</span>
                      <div>
                        <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
                        <span className="mono">{item.usable.toLocaleString()}</span>
                      </div>
                      <span className="mono" style={{ color: item.expiring > 0 ? r.color : "var(--muted)" }}>
                        {item.expiring > 0 ? item.expiring.toLocaleString() : "—"}
                      </span>
                      <span className="mono" style={{ fontWeight: 800, color: item.days <= 5 ? r.color : "var(--text)" }}>{item.days}d</span>
                      <span className="chip" style={{ background: r.bg, color: r.color }}>{r.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── PLANNING ── */}
          {tab === "planning" && (
            <div className="tcontent fade-in">
              <div className="sheader">
                <div>
                  <div className="stitle">Reorder Planning</div>
                  <div className="ssub">Active purchase orders, ETAs, and shipping methods</div>
                </div>
                <div className="sbadge" style={{ background: "#e6f9ee", color: "#1a7a3c" }}>{MOCK_PLANNING.length} active orders</div>
              </div>
              <div className="plan-grid">
                {MOCK_PLANNING.map((p) => {
                  const ss: Record<string,{bg:string;color:string}> = {
                    urgent:       { bg: "#fdeaea", color: "#b91c1c" },
                    scheduled:    { bg: "#e8f4fd", color: "#1a6aa8" },
                    "in-transit": { bg: "#e6f9ee", color: "#1a7a3c" },
                  };
                  const s = ss[p.status] || ss.scheduled;
                  return (
                    <div key={p.id} className="plan-card" style={{ borderLeftColor: s.color }}>
                      <div className="plan-top">
                        <div>
                          <span className="plan-id">{p.id}</span>
                          <span className="plan-sku">{p.sku}</span>
                        </div>
                        <span className="chip" style={{ background: s.bg, color: s.color }}>{p.status}</span>
                      </div>
                      <div className="plan-details">
                        {[["Quantity", `${p.qty} units`],["Method", p.method],["ETA", p.eta],["Est. Cost", p.cost]].map(([l,v]) => (
                          <div key={l} className="plan-detail">
                            <span className="dlabel">{l}</span>
                            <span className="dval" style={{ color: l==="Est. Cost" ? "#0d9e75" : l==="ETA" && v==="Tomorrow" ? "#b91c1c" : "var(--text)" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="sum-grid">
                {[["$4,960","Total pending spend"],["1,400","Units in transit"],["2","Truck shipments"],["2","Intermodal shipments"]].map(([v,l]) => (
                  <div key={l} className="sum-item"><div className="sum-val">{v}</div><div className="sum-label">{l}</div></div>
                ))}
              </div>
            </div>
          )}

          {/* ── STOCK POLICY ── */}
          {tab === "stock" && (
            <div className="tcontent fade-in">
              <div className="sheader">
                <div>
                  <div className="stitle">Stock Policy Recommendations</div>
                  <div className="ssub">
                    How much stock to keep on hand for each SKU based on current demand, lead times, and shelf life.
                    {result && <span style={{ color: "#0d9e75", fontWeight: 700 }}> Updated with latest agent data.</span>}
                  </div>
                </div>
                <div className="sbadge" style={{ background: "#f8f5ff", color: "#7c5cbf" }}>Based on live demand</div>
              </div>

              {/* Formula explainer */}
              <div className="formula-box">
                <div className="formula-title">How it's calculated</div>
                <div className="formula-grid">
                  <div className="formula-item" style={{ borderTopColor: "#2e7de8" }}>
                    <div className="formula-name">Cycle Stock</div>
                    <div className="formula-eq">Daily demand × Truck lead time</div>
                    <div className="formula-desc">Units needed to cover the fastest reorder window</div>
                  </div>
                  <div className="formula-item" style={{ borderTopColor: "#f0921a" }}>
                    <div className="formula-name">Safety Stock</div>
                    <div className="formula-eq">Daily demand × Safety days buffer</div>
                    <div className="formula-desc">Extra buffer for demand spikes or delivery delays</div>
                  </div>
                  <div className="formula-item" style={{ borderTopColor: "#0d9e75" }}>
                    <div className="formula-name">Reorder Point</div>
                    <div className="formula-eq">Cycle stock + Safety stock</div>
                    <div className="formula-desc">Place a new order when stock hits this level</div>
                  </div>
                  <div className="formula-item" style={{ borderTopColor: "#7c5cbf" }}>
                    <div className="formula-name">Max Stock</div>
                    <div className="formula-eq">Capped by shelf life × daily demand</div>
                    <div className="formula-desc">Never hold more than this — spoilage risk too high</div>
                  </div>
                </div>
              </div>

              {/* Stock policy table */}
              <div className="inv-table">
                <div className="sp-head">
                  <span>SKU</span>
                  <span>Daily Demand</span>
                  <span>Cycle Stock</span>
                  <span>Safety Stock</span>
                  <span>Reorder Point</span>
                  <span>Max Stock</span>
                  <span>Order Qty</span>
                  <span>Shelf Life</span>
                </div>
                {stockRows.map((row) => {
                  const tight = row.minStock > row.maxStock * 0.85;
                  return (
                    <div key={row.sku} className="sp-row">
                      <div>
                        <div className="sku">{row.sku}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{row.name}</div>
                      </div>
                      <div className="sp-cell">
                        <span className="sp-val">{row.daily}</span>
                        <span className="sp-unit">units/day</span>
                      </div>
                      <div className="sp-cell">
                        <span className="sp-val" style={{ color: "#2e7de8" }}>{row.cycleStock}</span>
                        <span className="sp-unit">units</span>
                      </div>
                      <div className="sp-cell">
                        <span className="sp-val" style={{ color: "#f0921a" }}>{row.safetyStock}</span>
                        <span className="sp-unit">units</span>
                      </div>
                      <div className="sp-cell">
                        <div className="sp-highlight" style={{ background: "#e8f4fd", color: "#1a6aa8" }}>
                          {row.reorderPoint} units
                        </div>
                      </div>
                      <div className="sp-cell">
                        <div className="sp-highlight" style={{ background: tight ? "#fdeaea" : "#e6f9ee", color: tight ? "#b91c1c" : "#1a7a3c" }}>
                          {row.maxStock} units
                        </div>
                      </div>
                      <div className="sp-cell">
                        <span className="sp-val">{row.orderQty}</span>
                        <span className="sp-unit">units/order</span>
                      </div>
                      <div className="sp-cell">
                        <span className="sp-val" style={{ color: row.shelfLife <= 5 ? "#b91c1c" : "var(--text)" }}>{row.shelfLife}d</span>
                        <span className="sp-unit">shelf life</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Insight cards */}
              <div className="insight-grid">
                <div className="insight-card" style={{ borderLeftColor: "#2e7de8" }}>
                  <div className="insight-title">Total min. stock needed</div>
                  <div className="insight-val" style={{ color: "#2e7de8" }}>
                    {stockRows.reduce((s, r) => s + r.minStock, 0).toLocaleString()}
                    <span className="insight-unit"> units</span>
                  </div>
                  <div className="insight-desc">Sum of all reorder points across SKUs</div>
                </div>
                <div className="insight-card" style={{ borderLeftColor: "#0d9e75" }}>
                  <div className="insight-title">Total max. stock allowed</div>
                  <div className="insight-val" style={{ color: "#0d9e75" }}>
                    {stockRows.reduce((s, r) => s + r.maxStock, 0).toLocaleString()}
                    <span className="insight-unit"> units</span>
                  </div>
                  <div className="insight-desc">Upper limit before spoilage risk rises</div>
                </div>
                <div className="insight-card" style={{ borderLeftColor: "#f0921a" }}>
                  <div className="insight-title">Highest daily demand SKU</div>
                  <div className="insight-val" style={{ color: "#f0921a" }}>
                    {stockRows.sort((a,b) => b.daily - a.daily)[0].sku}
                    <span className="insight-unit"> {stockRows[0].daily} units/day</span>
                  </div>
                  <div className="insight-desc">Needs most frequent reordering</div>
                </div>
                <div className="insight-card" style={{ borderLeftColor: "#e84c3d" }}>
                  <div className="insight-title">Tightest shelf life</div>
                  <div className="insight-val" style={{ color: "#e84c3d" }}>
                    {[...stockRows].sort((a,b) => a.shelfLife - b.shelfLife)[0].sku}
                    <span className="insight-unit"> {[...stockRows].sort((a,b) => a.shelfLife - b.shelfLife)[0].shelfLife}d shelf life</span>
                  </div>
                  <div className="insight-desc">Most sensitive to shipping delays</div>
                </div>
              </div>
            </div>
          )}

          {/* ── RISK MONITOR ── */}
          {tab === "risk" && (
            <div className="tcontent fade-in">
              <div className="sheader">
                <div>
                  <div className="stitle">Risk Monitor</div>
                  <div className="ssub">Active alerts ranked by severity across inventory, transport, and demand</div>
                </div>
                <div className="sbadge" style={{ background: "#fdeaea", color: "#b91c1c" }}>1 critical</div>
              </div>
              <div className="risk-list">
                {MOCK_RISKS.map((r, i) => {
                  const rs = RISK_STYLE[r.level];
                  return (
                    <div key={i} className="risk-item" style={{ borderLeftColor: rs.color }}>
                      <div className="risk-top">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="chip" style={{ background: rs.bg, color: rs.color }}>{rs.label}</span>
                          <span className="risk-title">{r.title}</span>
                        </div>
                        <span className="risk-time">{r.time}</span>
                      </div>
                      <p className="risk-desc">{r.desc}</p>
                    </div>
                  );
                })}
              </div>
              <div className="card" style={{ padding: 20 }}>
                <div className="sec-label" style={{ marginBottom: 12 }}>Risk Summary</div>
                <div className="risk-sum-grid">
                  {Object.entries(RISK_STYLE).map(([level, rs]) => {
                    const count = MOCK_RISKS.filter(r => r.level === level).length;
                    return (
                      <div key={level} className="risk-sum-item" style={{ background: rs.bg, borderColor: rs.border }}>
                        <div className="risk-sum-count" style={{ color: rs.color }}>{count}</div>
                        <div className="risk-sum-label" style={{ color: rs.color }}>{rs.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      <style jsx>{`
        .page { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); }

        header {
          background: white; border-bottom: 2px solid var(--border);
          padding: 0 28px; height: 64px; display: flex; align-items: center;
          position: sticky; top: 0; z-index: 50;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .hinner { width: 100%; display: flex; justify-content: space-between; align-items: center; }
        .logo   { display: flex; align-items: center; gap: 12px; }
        .logo-mark {
          width: 38px; height: 38px; background: var(--text); border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--mono); font-size: 13px; font-weight: 500; color: white;
        }
        .logo-name { font-weight: 800; font-size: 17px; color: var(--text); line-height: 1.2; }
        .logo-sub  { font-size: 11px; color: var(--muted); font-weight: 600; }
        .hright { display: flex; align-items: center; gap: 10px; }
        .stat-pill { padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; background: #e6f9ee; color: #1a7a3c; }
        .live-badge { display: flex; align-items: center; gap: 7px; padding: 6px 14px; background: #e6f9ee; border-radius: 20px; font-size: 13px; font-weight: 700; color: #1a7a3c; }
        .live-dot { width: 7px; height: 7px; background: var(--green); border-radius: 50%; animation: pulse 2s infinite; display: inline-block; }
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(0.7);opacity:0.5} }

        .body {
          flex: 1; display: grid; grid-template-columns: 290px 1fr;
          max-width: 1440px; margin: 0 auto; width: 100%;
          padding: 24px 28px; gap: 24px; align-items: start;
        }
        aside { position: sticky; top: 88px; background: white; border: 2px solid var(--border); border-radius: var(--radius); padding: 20px; }
        main  { display: flex; flex-direction: column; gap: 16px; }

        .card { background: white; border: 2px solid var(--border); border-radius: var(--radius); padding: 16px 20px; }
        .sec-label { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; }

        /* Pipeline */
        .pipeline { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
        .pnode { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border: 2px solid var(--border); border-radius: 30px; font-size: 13px; font-weight: 700; color: var(--muted); background: var(--surface2); transition: all 0.2s; }
        .parrow { font-size: 14px; color: var(--border); padding: 0 2px; transition: color 0.2s; }
        .parrow.lit { color: var(--green); }
        .pspinner { width: 11px; height: 11px; border: 2px solid rgba(0,0,0,0.15); border-top-color: currentColor; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status-msg { font-size: 12px; color: var(--muted); font-weight: 600; margin-top: 8px; }
        .error-box  { background: #fdeaea; border: 2px solid #fca5a5; border-radius: var(--rsm); padding: 14px 18px; font-size: 14px; font-weight: 600; color: #b91c1c; }

        /* Tabs */
        .tabs { display: flex; gap: 4px; background: white; border: 2px solid var(--border); border-radius: var(--radius); padding: 6px; }
        .tab  { flex: 1; padding: 10px 6px; background: transparent; border: none; border-radius: var(--rsm); font-family: var(--sans); font-size: 12px; font-weight: 700; color: var(--muted); cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 5px; }
        .tab:hover { background: var(--surface2); color: var(--text); }
        .tab-on { background: var(--text) !important; color: white !important; }
        .tbadge { background: #e84c3d; color: white; font-size: 10px; font-weight: 800; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .tcontent { display: flex; flex-direction: column; gap: 16px; }
        .fade-in  { animation: fadeUp 0.35s ease forwards; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }

        /* KPI */
        .kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }
        .kpi-card { background: white; border: 2px solid var(--border); border-top: 4px solid; border-radius: var(--radius); padding: 16px 18px; }
        .kpi-dot  { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
        .kpi-val  { font-size: 26px; font-weight: 800; color: var(--text); line-height: 1; }
        .kpi-unit { font-size: 13px; font-weight: 600; color: var(--muted); }
        .kpi-label{ font-size: 12px; color: var(--muted); font-weight: 600; margin-top: 4px; }
        .kpi-delta{ font-size: 11px; font-weight: 700; margin-top: 6px; }

        .cards-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
        .placeholder { background: white; border: 2px dashed var(--border); border-radius: var(--radius); padding: 48px; display: flex; align-items: center; justify-content: center; text-align: center; flex-direction: column; }
        .ph-title { font-size: 18px; font-weight: 800; color: var(--text); margin-bottom: 8px; }
        .ph-sub   { font-size: 14px; color: var(--muted); font-weight: 600; max-width: 320px; }

        /* Shared section */
        .sheader { display: flex; justify-content: space-between; align-items: flex-start; }
        .stitle  { font-size: 18px; font-weight: 800; color: var(--text); margin-bottom: 2px; }
        .ssub    { font-size: 13px; color: var(--muted); font-weight: 600; }
        .sbadge  { padding: 5px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; }
        .chip    { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .mono    { font-size: 13px; font-weight: 700; color: var(--text); font-family: var(--mono); }
        .sku     { font-family: var(--mono); font-size: 11px; font-weight: 500; background: var(--surface2); padding: 3px 7px; border-radius: 5px; color: var(--muted); }

        /* Inventory table */
        .inv-table { background: white; border: 2px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .inv-head  { display: grid; grid-template-columns: 100px 1fr 80px 120px 80px 70px 90px; padding: 12px 18px; background: var(--surface2); font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; gap: 12px; }
        .inv-row   { display: grid; grid-template-columns: 100px 1fr 80px 120px 80px 70px 90px; padding: 14px 18px; border-top: 1px solid var(--border); align-items: center; gap: 12px; transition: background 0.15s; }
        .inv-row:hover { background: var(--surface2); }
        .inv-name  { font-size: 13px; font-weight: 700; color: var(--text); }
        .bar-track { height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; margin-bottom: 3px; }
        .bar-fill  { height: 100%; background: var(--teal); border-radius: 2px; }

        /* Planning */
        .plan-grid   { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .plan-card   { background: white; border: 2px solid var(--border); border-left: 4px solid; border-radius: var(--radius); padding: 16px 18px; }
        .plan-top    { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
        .plan-id     { font-family: var(--mono); font-size: 12px; font-weight: 500; color: var(--muted); display: block; }
        .plan-sku    { font-size: 14px; font-weight: 800; color: var(--text); display: block; }
        .plan-details{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .plan-detail { display: flex; flex-direction: column; gap: 1px; }
        .dlabel { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
        .dval   { font-size: 14px; font-weight: 800; color: var(--text); }
        .sum-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; background: white; border: 2px solid var(--border); border-radius: var(--radius); padding: 20px; }
        .sum-item { text-align: center; }
        .sum-val  { font-size: 24px; font-weight: 800; color: var(--text); }
        .sum-label{ font-size: 12px; color: var(--muted); font-weight: 600; margin-top: 3px; }

        /* Stock Policy */
        .formula-box  { background: white; border: 2px solid var(--border); border-radius: var(--radius); padding: 20px; }
        .formula-title{ font-size: 13px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 14px; }
        .formula-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }
        .formula-item { border: 2px solid var(--border); border-top: 4px solid; border-radius: var(--rsm); padding: 14px; }
        .formula-name { font-size: 14px; font-weight: 800; color: var(--text); margin-bottom: 4px; }
        .formula-eq   { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-bottom: 6px; background: var(--surface2); padding: 4px 8px; border-radius: 4px; }
        .formula-desc { font-size: 12px; color: var(--muted); font-weight: 600; line-height: 1.4; }
        .sp-head { display: grid; grid-template-columns: 160px repeat(7, 1fr); padding: 12px 18px; background: var(--surface2); font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; gap: 10px; }
        .sp-row  { display: grid; grid-template-columns: 160px repeat(7, 1fr); padding: 14px 18px; border-top: 1px solid var(--border); align-items: center; gap: 10px; transition: background 0.15s; }
        .sp-row:hover { background: var(--surface2); }
        .sp-cell { display: flex; flex-direction: column; gap: 1px; }
        .sp-val  { font-family: var(--mono); font-size: 15px; font-weight: 700; color: var(--text); line-height: 1; }
        .sp-unit { font-size: 10px; color: var(--muted); font-weight: 600; }
        .sp-highlight { padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: 800; text-align: center; }
        .insight-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }
        .insight-card { background: white; border: 2px solid var(--border); border-left: 4px solid; border-radius: var(--radius); padding: 16px 18px; }
        .insight-title{ font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
        .insight-val  { font-size: 22px; font-weight: 800; line-height: 1; margin-bottom: 6px; }
        .insight-unit { font-size: 13px; font-weight: 600; color: var(--muted); }
        .insight-desc { font-size: 12px; color: var(--muted); font-weight: 600; line-height: 1.4; }

        /* Risk */
        .risk-list { display: flex; flex-direction: column; gap: 10px; }
        .risk-item { background: white; border: 2px solid var(--border); border-left: 4px solid; border-radius: var(--radius); padding: 16px 18px; }
        .risk-top  { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .risk-title{ font-size: 14px; font-weight: 800; color: var(--text); }
        .risk-time { font-size: 12px; color: var(--muted); font-weight: 600; }
        .risk-desc { font-size: 13px; color: var(--muted); font-weight: 600; line-height: 1.5; }
        .risk-sum-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
        .risk-sum-item { border: 2px solid; border-radius: var(--rsm); padding: 14px; text-align: center; }
        .risk-sum-count{ font-size: 28px; font-weight: 800; line-height: 1; }
        .risk-sum-label{ font-size: 12px; font-weight: 700; margin-top: 4px; }

        @media (max-width: 1100px) {
          .kpi-grid { grid-template-columns: repeat(2,1fr); }
          .formula-grid { grid-template-columns: repeat(2,1fr); }
          .insight-grid { grid-template-columns: repeat(2,1fr); }
        }
        @media (max-width: 900px) {
          .body { grid-template-columns: 1fr; padding: 16px; }
          aside { position: static; }
          .cards-grid { grid-template-columns: 1fr; }
          .plan-grid  { grid-template-columns: 1fr; }
          .sum-grid   { grid-template-columns: repeat(2,1fr); }
          .tabs .tab  { font-size: 11px; padding: 8px 4px; }
          .hright .stat-pill { display: none; }
          .sp-head, .sp-row { grid-template-columns: 140px repeat(4,1fr); }
          .sp-head span:nth-child(n+6), .sp-row > *:nth-child(n+6) { display: none; }
        }
      `}</style>
    </div>
  );
}

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
