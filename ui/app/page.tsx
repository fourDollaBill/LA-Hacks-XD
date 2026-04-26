"use client";

import { useEffect, useState } from "react";
import { fetchScenarios, runScenario, Scenario, RunResult } from "@/lib/api";
import ScenarioForm   from "@/components/scenario-form";
import ForecastCard   from "@/components/forecast-card";
import InventoryCard  from "@/components/inventory-card";
import DecisionCard   from "@/components/decision-card";

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_KPI = [
  { label: "Total inventory",      value: "4,820", unit: "units",   delta: "+3.2%", up: true,  color: "#2563eb" },
  { label: "Avg days to stockout", value: "12.4",  unit: "days",    delta: "-1.1d", up: false, color: "#d97706" },
  { label: "Spoilage this week",   value: "2.3",   unit: "%",       delta: "-0.4%", up: true,  color: "#16a34a" },
  { label: "Reorders pending",     value: "3",     unit: "active",  delta: "+1",    up: false, color: "#7c3aed" },
];

const MOCK_INVENTORY = [
  { sku: "PROD-A01", name: "Fresh Produce Batch A",   total: 1200, usable: 980,  expiring: 220, days: 8,  risk: "moderate" },
  { sku: "PROD-B03", name: "Dairy Supply — Zone 3",   total: 850,  usable: 820,  expiring: 30,  days: 14, risk: "low"      },
  { sku: "PROD-C07", name: "Frozen Goods Lot C7",     total: 2100, usable: 2100, expiring: 0,   days: 22, risk: "low"      },
  { sku: "PROD-D12", name: "Med Supplies Batch D",    total: 420,  usable: 140,  expiring: 280, days: 3,  risk: "critical" },
  { sku: "PROD-E05", name: "Bakery Items — East Hub", total: 250,  usable: 210,  expiring: 40,  days: 5,  risk: "high"     },
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

const MOCK_STOCK = [
  { sku: "PROD-A01", name: "Fresh Produce Batch A",   daily: 85,  lead: 2, safety: 2, shelf: 8  },
  { sku: "PROD-B03", name: "Dairy Supply — Zone 3",   daily: 60,  lead: 2, safety: 3, shelf: 14 },
  { sku: "PROD-C07", name: "Frozen Goods Lot C7",     daily: 95,  lead: 2, safety: 4, shelf: 30 },
  { sku: "PROD-D12", name: "Med Supplies Batch D",    daily: 45,  lead: 2, safety: 3, shelf: 10 },
  { sku: "PROD-E05", name: "Bakery Items — East Hub", daily: 42,  lead: 2, safety: 1, shelf: 5  },
].map(r => {
  const cycle    = r.daily * r.lead;
  const safety   = r.daily * r.safety;
  const min      = cycle + safety;
  const max      = Math.min(r.daily * (5 + r.safety + 3), r.daily * r.shelf);
  return { ...r, cycle, safety, min, max, orderQty: max - min };
});

const RISK_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  critical: { bg: "var(--red-bg)",    color: "var(--red)",    label: "Critical" },
  high:     { bg: "#fff7ed",          color: "#c2410c",        label: "High"     },
  moderate: { bg: "var(--amber-bg)",  color: "var(--amber)",  label: "Moderate" },
  low:      { bg: "var(--green-bg)",  color: "var(--green)",  label: "Low"      },
};

const PIPELINE = [
  { id: "forecast",  label: "ForecastAgent",  icon: "📈", ai: true  },
  { id: "inventory", label: "InventoryAgent", icon: "📦", ai: false },
  { id: "transport", label: "TransportAgent", icon: "🚚", ai: false },
  { id: "decision",  label: "DecisionAgent",  icon: "🧠", ai: true  },
  { id: "llm",       label: "LLM Summary",    icon: "💬", ai: true  },
];

type PStep = "idle" | "active" | "done";
type Tab   = "overview" | "inventory" | "planning" | "stock" | "risk";

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<RunResult | null>(null);
  const [pipe,      setPipe]      = useState<Record<string, PStep>>({});
  const [status,    setStatus]    = useState("");
  const [error,     setError]     = useState<string | null>(null);
  const [tab,       setTab]       = useState<Tab>("overview");

  useEffect(() => {
    fetchScenarios()
      .then(s => { setScenarios(s); if (s.length) setSelected(s[0].name); })
      .catch(() => setError("Backend unreachable — run: uvicorn main:app --port 8000"));
  }, []);

  async function handleRun() {
    if (!selected) return;
    setLoading(true); setResult(null); setError(null); setPipe({}); setTab("overview");

    for (let i = 0; i < PIPELINE.length; i++) {
      setPipe(p => ({ ...p, [PIPELINE[i].id]: "active" }));
      setStatus(`${PIPELINE[i].label}${PIPELINE[i].ai ? " is reasoning…" : " running…"}`);
      await delay(PIPELINE[i].ai ? 500 : 300);
      setPipe(p => ({ ...p, [PIPELINE[i].id]: "done" }));
    }

    try {
      const data = await runScenario(selected);
      setResult(data);
      setStatus("Analysis complete");
    } catch {
      setError("Failed to run. Is the backend running?");
      setStatus(""); setPipe({});
    } finally { setLoading(false); }
  }

  const TABS: { id: Tab; label: string; badge?: string }[] = [
    { id: "overview",  label: "Overview"      },
    { id: "inventory", label: "Inventory"     },
    { id: "planning",  label: "Planning"      },
    { id: "stock",     label: "Stock Policy"  },
    { id: "risk",      label: "Risk Monitor", badge: "1" },
  ];

  return (
    <div className="page">

      {/* ── Header ── */}
      <header>
        <div className="hinner">
          <div className="hleft">
            <div className="logo">
              <div className="logo-icon">SM</div>
              <div>
                <div className="logo-name">SupplyMind</div>
              </div>
            </div>
            <span className="beta-badge">Beta</span>
            <div className="nav-divider" />
            <span className="nav-item active-nav">Dashboard</span>
          </div>
          <div className="hright">
            <div className="status-dot-wrap">
              <span className="status-dot" />
              <span className="status-text">5 agents ready</span>
            </div>
            <div className="header-btn">Documentation</div>
          </div>
        </div>
      </header>

      <div className="layout">

        {/* ── Sidebar ── */}
        <aside>
          <div className="aside-section">
            <ScenarioForm
              scenarios={scenarios} selected={selected}
              loading={loading} onSelect={setSelected} onRun={handleRun}
            />
          </div>

          {/* Pipeline status in sidebar */}
          <div className="aside-section">
            <div className="aside-label">Agent pipeline</div>
            <div className="pipe-list">
              {PIPELINE.map((s) => {
                const state = pipe[s.id] || "idle";
                return (
                  <div key={s.id} className={`pipe-item pipe-${state}`}>
                    <div className="pipe-dot-wrap">
                      <div className={`pipe-dot ${state === "active" ? "pipe-dot-active" : state === "done" ? "pipe-dot-done" : ""}`} />
                      {s.id !== "llm" && <div className="pipe-line" />}
                    </div>
                    <div className="pipe-info">
                      <span className="pipe-name">{s.icon} {s.label}</span>
                      {s.ai && <span className="pipe-ai">AI</span>}
                    </div>
                    {state === "done" && <span className="pipe-check">✓</span>}
                    {state === "active" && <span className="pipe-spin" />}
                  </div>
                );
              })}
            </div>
            {status && <div className="pipe-status">{status}</div>}
          </div>
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
                    <div className="kpi-delta" style={{ color: k.up ? "var(--green)" : "var(--red)" }}>
                      {k.delta} vs last week
                    </div>
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

          {/* ── INVENTORY ── */}
          {tab === "inventory" && (
            <div className="tcontent fade-in">
              <div className="section-header">
                <div>
                  <div className="section-title">Inventory Monitor</div>
                  <div className="section-sub">Stock levels, expiry tracking, and risk across all SKUs</div>
                </div>
                <span className="section-badge" style={{ background: "var(--blue-bg)", color: "var(--blue)", borderColor: "var(--blue-border)" }}>{MOCK_INVENTORY.length} SKUs</span>
              </div>
              <div className="table-wrap">
                <div className="table-head inv-cols">
                  <span>SKU</span><span>Product</span><span>Usable</span><span>Expiring</span><span>Days left</span><span>Risk</span>
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
                  <div className="section-sub">Active purchase orders, ETAs, and transport methods</div>
                </div>
                <span className="section-badge" style={{ background: "var(--green-bg)", color: "var(--green)", borderColor: "var(--green-border)" }}>{MOCK_PLANNING.length} orders</span>
              </div>
              <div className="plan-grid">
                {MOCK_PLANNING.map(p => {
                  const ss: Record<string,{bg:string;color:string}> = {
                    urgent:       { bg:"var(--red-bg)",    color:"var(--red)"    },
                    scheduled:    { bg:"var(--blue-bg)",   color:"var(--blue)"   },
                    "in-transit": { bg:"var(--green-bg)",  color:"var(--green)"  },
                  };
                  const s = ss[p.status] || ss.scheduled;
                  return (
                    <div key={p.id} className="plan-card">
                      <div className="plan-top">
                        <div>
                          <div className="plan-id">{p.id} · {p.sku}</div>
                          <div className="plan-method">{p.method}</div>
                        </div>
                        <span className="badge" style={{ background: s.bg, color: s.color }}>{p.status}</span>
                      </div>
                      <div className="plan-row"><span>Quantity</span><strong>{p.qty} units</strong></div>
                      <div className="plan-row"><span>ETA</span><strong style={{ color: p.eta === "Tomorrow" ? "var(--red)" : "var(--text)" }}>{p.eta}</strong></div>
                      <div className="plan-row"><span>Est. cost</span><strong style={{ color: "var(--green)" }}>{p.cost}</strong></div>
                    </div>
                  );
                })}
              </div>
              <div className="summary-row">
                {[["$4,960","Total spend"],["1,400","Units in transit"],["2","Truck"],["2","Intermodal"]].map(([v,l]) => (
                  <div key={l} className="sum-item"><div className="sum-val">{v}</div><div className="sum-label">{l}</div></div>
                ))}
              </div>
            </div>
          )}

          {/* ── STOCK POLICY ── */}
          {tab === "stock" && (
            <div className="tcontent fade-in">
              <div className="section-header">
                <div>
                  <div className="section-title">Stock Policy</div>
                  <div className="section-sub">How much to keep on hand per SKU based on demand, lead times, and shelf life</div>
                </div>
                <span className="section-badge" style={{ background: "var(--purple-bg)", color: "var(--purple)", borderColor: "var(--purple-border)" }}>Live demand</span>
              </div>

              <div className="formula-row">
                {[
                  { name: "Cycle Stock", eq: "Daily × Lead time", color: "#2563eb", desc: "Cover fastest reorder" },
                  { name: "Safety Stock", eq: "Daily × Buffer days", color: "#d97706", desc: "Absorb demand spikes" },
                  { name: "Reorder Point", eq: "Cycle + Safety", color: "#16a34a", desc: "Order when you hit this" },
                  { name: "Max Stock", eq: "Capped by shelf life", color: "#7c3aed", desc: "Never hold more than this" },
                ].map(f => (
                  <div key={f.name} className="formula-card" style={{ borderTopColor: f.color }}>
                    <div className="formula-name">{f.name}</div>
                    <code className="formula-eq">{f.eq}</code>
                    <div className="formula-desc">{f.desc}</div>
                  </div>
                ))}
              </div>

              <div className="table-wrap">
                <div className="table-head sp-cols">
                  <span>SKU</span><span>Daily</span><span>Cycle stock</span><span>Safety stock</span>
                  <span>Reorder point</span><span>Max stock</span><span>Order qty</span>
                </div>
                {MOCK_STOCK.map(row => (
                  <div key={row.sku} className="table-row sp-cols">
                    <div>
                      <div className="mono-tag">{row.sku}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{row.name}</div>
                    </div>
                    <span className="mono-val">{row.daily}<span style={{fontSize:10,color:"var(--muted)"}}>/d</span></span>
                    <span className="mono-val" style={{ color: "#2563eb" }}>{row.cycle}</span>
                    <span className="mono-val" style={{ color: "#d97706" }}>{row.safety}</span>
                    <span className="sp-highlight" style={{ background: "var(--blue-bg)", color: "var(--blue)" }}>{row.min}</span>
                    <span className="sp-highlight" style={{ background: row.min > row.max * 0.85 ? "var(--red-bg)" : "var(--green-bg)", color: row.min > row.max * 0.85 ? "var(--red)" : "var(--green)" }}>{row.max}</span>
                    <span className="mono-val">{row.orderQty}</span>
                  </div>
                ))}
              </div>

              <div className="insight-row">
                {[
                  { label: "Total min. stock needed", val: MOCK_STOCK.reduce((s,r)=>s+r.min,0).toLocaleString(), unit: "units", color: "#2563eb" },
                  { label: "Total max. allowed", val: MOCK_STOCK.reduce((s,r)=>s+r.max,0).toLocaleString(), unit: "units", color: "#16a34a" },
                  { label: "Highest demand SKU", val: [...MOCK_STOCK].sort((a,b)=>b.daily-a.daily)[0].sku, unit: `${[...MOCK_STOCK].sort((a,b)=>b.daily-a.daily)[0].daily}/day`, color: "#d97706" },
                  { label: "Tightest shelf life", val: [...MOCK_STOCK].sort((a,b)=>a.shelf-b.shelf)[0].sku, unit: `${[...MOCK_STOCK].sort((a,b)=>a.shelf-b.shelf)[0].shelf}d shelf life`, color: "#dc2626" },
                ].map(i => (
                  <div key={i.label} className="insight-card" style={{ borderLeftColor: i.color }}>
                    <div className="insight-label">{i.label}</div>
                    <div className="insight-val" style={{ color: i.color }}>{i.val} <span>{i.unit}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── RISK ── */}
          {tab === "risk" && (
            <div className="tcontent fade-in">
              <div className="section-header">
                <div>
                  <div className="section-title">Risk Monitor</div>
                  <div className="section-sub">Active alerts ranked by severity</div>
                </div>
                <span className="section-badge" style={{ background: "var(--red-bg)", color: "var(--red)", borderColor: "var(--red-border)" }}>1 critical</span>
              </div>
              <div className="risk-list">
                {MOCK_RISKS.map((r, i) => {
                  const rs = RISK_STYLE[r.level];
                  return (
                    <div key={i} className="risk-card" style={{ borderLeftColor: rs.color }}>
                      <div className="risk-top">
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span className="badge" style={{ background:rs.bg, color:rs.color }}>{rs.label}</span>
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
                  const count = MOCK_RISKS.filter(r=>r.level===level).length;
                  return (
                    <div key={level} className="risk-sum" style={{ background:rs.bg, borderColor: level==="critical" ? "var(--red-border)" : level==="high" ? "#fed7aa" : level==="moderate" ? "var(--amber-border)" : "var(--green-border)" }}>
                      <div className="risk-sum-n" style={{ color:rs.color }}>{count}</div>
                      <div className="risk-sum-l" style={{ color:rs.color }}>{rs.label}</div>
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

        /* Header */
        header {
          height: 52px; background: var(--surface);
          border-bottom: 1px solid var(--border);
          padding: 0 20px; display: flex; align-items: center;
          position: sticky; top: 0; z-index: 50;
          box-shadow: var(--shadow-sm);
        }
        .hinner { width: 100%; display: flex; justify-content: space-between; align-items: center; }
        .hleft  { display: flex; align-items: center; gap: 12px; }
        .logo   { display: flex; align-items: center; gap: 8px; }
        .logo-icon {
          width: 28px; height: 28px; background: var(--text); border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--mono); font-size: 11px; font-weight: 500; color: white;
        }
        .logo-name { font-size: 14px; font-weight: 700; color: var(--text); }
        .beta-badge {
          font-size: 11px; font-weight: 600; color: var(--purple);
          background: var(--purple-bg); border: 1px solid var(--purple-border);
          padding: 1px 8px; border-radius: 20px;
        }
        .nav-divider { width: 1px; height: 16px; background: var(--border); }
        .nav-item { font-size: 13px; color: var(--muted); font-weight: 500; }
        .active-nav { color: var(--text); font-weight: 600; }
        .hright { display: flex; align-items: center; gap: 10px; }
        .status-dot-wrap { display: flex; align-items: center; gap: 6px; }
        .status-dot { width: 7px; height: 7px; background: var(--green); border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
        .status-text { font-size: 12px; color: var(--muted); font-weight: 500; }
        .header-btn { font-size: 12px; font-weight: 500; color: var(--muted); padding: 5px 10px; border: 1px solid var(--border); border-radius: var(--radius-xs); cursor: pointer; transition: all 0.1s; }
        .header-btn:hover { background: var(--surface2); color: var(--text); }

        /* Layout */
        .layout { flex: 1; display: grid; grid-template-columns: 240px 1fr; max-width: 1400px; margin: 0 auto; width: 100%; padding: 20px; gap: 20px; align-items: start; }

        aside {
          position: sticky; top: 72px;
          display: flex; flex-direction: column; gap: 0;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius); overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        .aside-section { padding: 16px; border-bottom: 1px solid var(--border); }
        .aside-section:last-child { border-bottom: none; }
        .aside-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }

        /* Pipeline in sidebar */
        .pipe-list { display: flex; flex-direction: column; gap: 0; }
        .pipe-item { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; position: relative; }
        .pipe-dot-wrap { display: flex; flex-direction: column; align-items: center; width: 12px; flex-shrink: 0; padding-top: 4px; }
        .pipe-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border2); border: 2px solid var(--border); flex-shrink: 0; transition: all 0.2s; }
        .pipe-dot-active { background: var(--blue); border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-bg); }
        .pipe-dot-done   { background: var(--green); border-color: var(--green); }
        .pipe-line { width: 2px; flex: 1; min-height: 16px; background: var(--border); margin-top: 2px; }
        .pipe-info { display: flex; align-items: center; gap: 5px; flex: 1; min-width: 0; }
        .pipe-name { font-size: 12px; font-weight: 500; color: var(--muted); }
        .pipe-item.pipe-done .pipe-name  { color: var(--text); }
        .pipe-item.pipe-active .pipe-name { color: var(--blue); font-weight: 600; }
        .pipe-ai   { font-size: 9px; font-weight: 700; color: var(--purple); background: var(--purple-bg); border: 1px solid var(--purple-border); padding: 0 4px; border-radius: 3px; }
        .pipe-check{ font-size: 11px; color: var(--green); font-weight: 700; }
        .pipe-spin { width: 10px; height: 10px; border: 2px solid var(--blue-bg); border-top-color: var(--blue); border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pipe-status { font-size: 11px; color: var(--blue); margin-top: 8px; font-weight: 500; }

        main { display: flex; flex-direction: column; gap: 12px; min-width: 0; }

        .error-bar { padding: 10px 14px; background: var(--red-bg); border: 1px solid var(--red-border); border-radius: var(--radius-sm); font-size: 13px; color: var(--red); font-weight: 500; }

        /* Tabs */
        .tabs-wrap { display: flex; gap: 2px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; box-shadow: var(--shadow-sm); }
        .tab { flex: 1; padding: 7px 8px; background: transparent; border: none; border-radius: var(--radius-xs); font-family: var(--sans); font-size: 13px; font-weight: 500; color: var(--muted); cursor: pointer; transition: all 0.1s; display: flex; align-items: center; justify-content: center; gap: 5px; }
        .tab:hover { background: var(--surface2); color: var(--text); }
        .tab-on { background: var(--surface2) !important; color: var(--text) !important; font-weight: 600; box-shadow: var(--shadow-sm); }
        .tab-badge { background: var(--red); color: white; font-size: 10px; font-weight: 700; width: 15px; height: 15px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }

        .tcontent { display: flex; flex-direction: column; gap: 12px; }
        .fade-in { animation: fadeUp 0.25s ease forwards; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }

        /* KPI */
        .kpi-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
        .kpi-card { background: var(--surface); border: 1px solid var(--border); border-top: 3px solid; border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow-sm); }
        .kpi-val  { font-size: 22px; font-weight: 700; color: var(--text); line-height: 1; }
        .kpi-unit { font-size: 12px; font-weight: 500; color: var(--muted); }
        .kpi-label{ font-size: 11px; color: var(--muted); font-weight: 500; margin-top: 3px; }
        .kpi-delta{ font-size: 11px; font-weight: 600; margin-top: 5px; }

        .results-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        /* Empty state */
        .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); gap: 8px; box-shadow: var(--shadow-sm); }
        .empty-icon  { font-size: 32px; opacity: 0.3; animation: rotate 10s linear infinite; }
        @keyframes rotate { to { transform: rotate(360deg); } }
        .empty-title { font-size: 16px; font-weight: 700; color: var(--text); }
        .empty-sub   { font-size: 13px; color: var(--muted); text-align: center; max-width: 280px; }

        /* Section header */
        .section-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .section-title  { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
        .section-sub    { font-size: 12px; color: var(--muted); }
        .section-badge  { padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid; }

        /* Shared table */
        .table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); }
        .table-head { display: grid; padding: 10px 16px; background: var(--surface2); font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; gap: 12px; }
        .table-row  { display: grid; padding: 12px 16px; border-top: 1px solid var(--border); align-items: center; gap: 12px; transition: background 0.1s; }
        .table-row:hover { background: var(--surface2); }
        .inv-cols { grid-template-columns: 90px 1fr 110px 80px 70px 80px; }
        .mono-tag { font-family: var(--mono); font-size: 11px; background: var(--surface2); padding: 2px 7px; border-radius: 4px; color: var(--muted); border: 1px solid var(--border); white-space: nowrap; }
        .mono-val { font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--text); }
        .row-name { font-size: 13px; font-weight: 500; color: var(--text); }
        .mini-bar { height: 3px; background: var(--surface2); border-radius: 2px; overflow: hidden; margin-bottom: 3px; }
        .mini-fill{ height: 100%; background: var(--green); border-radius: 2px; }
        .badge    { padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap; }

        /* Planning */
        .plan-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .plan-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow-sm); }
        .plan-top  { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .plan-id   { font-family: var(--mono); font-size: 12px; color: var(--muted); margin-bottom: 2px; }
        .plan-method { font-size: 14px; font-weight: 700; color: var(--text); }
        .plan-row  { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); padding: 4px 0; border-bottom: 1px solid var(--border); }
        .plan-row:last-child { border: none; }
        .plan-row strong { color: var(--text); font-weight: 600; }
        .summary-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow-sm); }
        .sum-item { text-align: center; }
        .sum-val  { font-size: 20px; font-weight: 700; color: var(--text); }
        .sum-label{ font-size: 11px; color: var(--muted); font-weight: 500; margin-top: 2px; }

        /* Stock policy */
        .formula-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
        .formula-card { background: var(--surface); border: 1px solid var(--border); border-top: 3px solid; border-radius: var(--radius); padding: 12px 14px; box-shadow: var(--shadow-sm); }
        .formula-name { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
        .formula-eq   { font-family: var(--mono); font-size: 11px; color: var(--muted); display: block; background: var(--surface2); padding: 3px 7px; border-radius: 4px; margin-bottom: 6px; }
        .formula-desc { font-size: 11px; color: var(--muted); line-height: 1.4; }
        .sp-cols { grid-template-columns: 150px 60px 90px 90px 100px 90px 80px; }
        .sp-highlight { font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-xs); font-family: var(--mono); }
        .insight-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
        .insight-card { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid; border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow-sm); }
        .insight-label{ font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 5px; }
        .insight-val  { font-size: 18px; font-weight: 700; line-height: 1.1; }
        .insight-val span { font-size: 11px; font-weight: 500; color: var(--muted); }

        /* Risk */
        .risk-list { display: flex; flex-direction: column; gap: 8px; }
        .risk-card { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid; border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow-sm); }
        .risk-top  { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .risk-title{ font-size: 13px; font-weight: 700; color: var(--text); }
        .risk-time { font-size: 11px; color: var(--muted); }
        .risk-desc { font-size: 12px; color: var(--muted); line-height: 1.5; }
        .risk-sum-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
        .risk-sum  { border: 1px solid; border-radius: var(--radius); padding: 14px; text-align: center; box-shadow: var(--shadow-sm); }
        .risk-sum-n{ font-size: 26px; font-weight: 800; line-height: 1; }
        .risk-sum-l{ font-size: 12px; font-weight: 600; margin-top: 3px; }

        @media (max-width: 1100px) {
          .kpi-row { grid-template-columns: repeat(2,1fr); }
          .formula-row { grid-template-columns: repeat(2,1fr); }
          .insight-row { grid-template-columns: repeat(2,1fr); }
        }
        @media (max-width: 900px) {
          .layout { grid-template-columns: 1fr; padding: 12px; }
          aside { position: static; }
          .results-grid { grid-template-columns: 1fr; }
          .plan-grid { grid-template-columns: 1fr; }
          .summary-row { grid-template-columns: repeat(2,1fr); }
          .tabs-wrap .tab { font-size: 11px; }
          .hright .header-btn { display: none; }
        }
      `}</style>
    </div>
  );
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
