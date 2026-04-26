"use client";
import { DecisionResult, TransportResult, InventoryResult, ForecastResult } from "@/lib/api";

interface Props {
  decision:       DecisionResult;
  transport:      TransportResult;
  inventory:      InventoryResult;
  forecast:       ForecastResult;
  llmExplanation: string | null;
}

type Risk = "low" | "moderate" | "high" | "critical";
const RISK_COLOR: Record<Risk, string> = {
  low: "#16a34a", moderate: "#d97706", high: "#c2410c", critical: "#dc2626",
};

function ConfidenceRing({ score }: { score: number }) {
  const color = score >= 80 ? "#16a34a" : score >= 60 ? "#d97706" : "#dc2626";
  const label = score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
  const r = 22, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r={r} fill="none" stroke="var(--surface2)" strokeWidth="5" />
        <circle
          cx="30" cy="30" r={r} fill="none"
          stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 30 30)"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        <text x="30" y="34" textAnchor="middle" fill={color} fontSize="13" fontWeight="700" fontFamily="var(--mono)">
          {score}%
        </text>
      </svg>
      <span style={{ fontSize: 10, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.4px" }}>
        {label} confidence
      </span>
    </div>
  );
}

export default function DecisionCard({ decision, transport, inventory, forecast, llmExplanation }: Props) {
  const isReorder = decision.should_reorder;
  const total     = decision.total_cost_score;
  const confidence = (decision as any).confidence_score ?? 75;

  // Order deadline logic
  const stockoutDays   = inventory.days_until_stockout;
  const truckOrderDays = Math.round(stockoutDays - transport.truck.lead_time_days);
  const interOrderDays = Math.round(stockoutDays - transport.intermodal.lead_time_days);

  const today = new Date();
  function deadlineLabel(days: number) {
    if (days <= 0) return "Overdue ⚠️";
    if (days === 1) return "Tomorrow";
    const d = new Date(today); d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function arrivalLabel(orderDays: number, lead: number) {
    const d = new Date(today); d.setDate(d.getDate() + Math.max(orderDays, 0) + lead);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function urgColor(missed: boolean, urgent: boolean) {
    return missed ? "#dc2626" : urgent ? "#c2410c" : "#16a34a";
  }
  function urgBg(missed: boolean, urgent: boolean) {
    return missed ? "var(--red-bg)" : urgent ? "#fff7ed" : "var(--green-bg)";
  }

  const truckMissed  = truckOrderDays <= 0;
  const truckUrgent  = !truckMissed && truckOrderDays <= 2;
  const interMissed  = interOrderDays <= 0 || !transport.intermodal.available;
  const interUrgent  = !interMissed && interOrderDays <= 2;

  const savings   = Math.abs(transport.truck.total_score - transport.intermodal.total_score).toFixed(2);
  const cheaperIs = transport.truck.total_score <= transport.intermodal.total_score ? "Truck" : "Intermodal";

  const costBars = [
    { label: "Transport",     val: decision.reasoning.transport_cost,    color: "#2563eb" },
    { label: "Stockout risk", val: decision.reasoning.stockout_risk_cost, color: "#d97706" },
    { label: "Spoilage risk", val: decision.reasoning.spoilage_risk_cost, color: "#dc2626" },
  ];

  return (
    <div className="card" style={{ borderColor: isReorder ? "var(--red-border)" : "var(--green-border)" }}>

      {/* ── Header ── */}
      <div className="card-head">
        <div className="card-title">
          <span>🧠</span> Decision & Transport
          <span className="ai-tag">AI</span>
        </div>
        <div className="head-right">
          <ConfidenceRing score={confidence} />
          <div className="head-meta">
            <span className="action-badge" style={{
              background: isReorder ? "var(--red-bg)" : "var(--green-bg)",
              color: isReorder ? "var(--red)" : "var(--green)",
              border: `1px solid ${isReorder ? "var(--red-border)" : "var(--green-border)"}`,
            }}>{decision.action}</span>
            <div className="score-pill">
              <span className="score-label">Cost score</span>
              <span className="score-val">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Risk flags ── */}
      {transport.risk_flags && transport.risk_flags.length > 0 && (
        <div className="risk-flags">
          {transport.risk_flags.map((flag, i) => (
            <span key={i} className="risk-flag">⚠ {flag}</span>
          ))}
        </div>
      )}

      {/* ── Order summary ── */}
      {isReorder && (
        <div className="order-grid">
          <div className="order-box" style={{ borderColor: "var(--blue-border)", background: "var(--blue-bg)" }}>
            <div className="ob-label">Order quantity</div>
            <div className="ob-val" style={{ color: "var(--blue)" }}>
              {decision.order_quantity.toLocaleString()} <span>units</span>
            </div>
          </div>
          <div className="order-box" style={{ borderColor: "var(--green-border)", background: "var(--green-bg)" }}>
            <div className="ob-label">Ship via</div>
            <div className="ob-val" style={{ color: "var(--green)", fontSize: 15 }}>
              {decision.transport_method}
            </div>
          </div>
          <div className="order-box" style={{
            borderColor: stockoutDays <= 3 ? "var(--red-border)" : "var(--amber-border)",
            background: stockoutDays <= 3 ? "var(--red-bg)" : "var(--amber-bg)",
          }}>
            <div className="ob-label">Days to stockout</div>
            <div className="ob-val" style={{ color: stockoutDays <= 3 ? "var(--red)" : "var(--amber)" }}>
              {stockoutDays} <span>days</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Transport comparison ── */}
      <div className="section-title">Transport options</div>
      <div className="transport-grid">

        {/* Truck */}
        <div className="t-option" style={{
          borderColor: transport.recommended === "truck" ? "var(--blue-border)" : "var(--border)",
          background:  transport.recommended === "truck" ? "var(--blue-bg)" : "var(--surface2)",
        }}>
          <div className="t-header">
            <div className="t-name">🚛 Truck</div>
            {transport.recommended === "truck" && <span className="t-rec">Recommended</span>}
          </div>
          <div className="t-rows">
            <div className="t-row"><span>Cost/unit</span><strong>${transport.truck.cost_per_unit.toFixed(2)}</strong></div>
            <div className="t-row"><span>Total score</span><strong style={{ color: "var(--blue)" }}>${transport.truck.total_score.toFixed(2)}</strong></div>
            <div className="t-row"><span>Lead time</span><strong>{transport.truck.lead_time_days} days</strong></div>
            <div className="t-divider" />
            <div className="t-row">
              <span>Order by</span>
              <strong style={{ color: urgColor(truckMissed, truckUrgent) }}>
                {truckMissed ? "Overdue ⚠️" : deadlineLabel(truckOrderDays)}
              </strong>
            </div>
            <div className="t-row"><span>Arrives</span><strong>{arrivalLabel(truckOrderDays, transport.truck.lead_time_days)}</strong></div>
          </div>
          <div className="urgency-tag" style={{ background: urgBg(truckMissed, truckUrgent), color: urgColor(truckMissed, truckUrgent) }}>
            {truckMissed ? "Window missed" : truckUrgent ? `${truckOrderDays}d to order` : `${truckOrderDays}d window`}
          </div>
        </div>

        {/* Intermodal */}
        <div className="t-option" style={{
          borderColor: transport.recommended === "intermodal" ? "var(--green-border)" : "var(--border)",
          background:  transport.recommended === "intermodal" ? "var(--green-bg)" : "var(--surface2)",
          opacity:     interMissed ? 0.6 : 1,
        }}>
          <div className="t-header">
            <div className="t-name">🚂 Intermodal</div>
            {transport.recommended === "intermodal" && (
              <span className="t-rec" style={{ color: "var(--green)", background: "var(--green-bg)", borderColor: "var(--green-border)" }}>
                Recommended
              </span>
            )}
            {interMissed && <span className="t-unavail">Unavailable</span>}
          </div>
          <div className="t-rows">
            <div className="t-row"><span>Cost/unit</span><strong>${transport.intermodal.cost_per_unit.toFixed(2)}</strong></div>
            <div className="t-row"><span>Total score</span><strong style={{ color: "var(--green)" }}>${transport.intermodal.total_score.toFixed(2)}</strong></div>
            <div className="t-row">
              <span>Lead time</span>
              <strong style={{ color: transport.intermodal.lead_time_days > 5 ? "#dc2626" : "var(--text)" }}>
                {transport.intermodal.lead_time_days} days
                {transport.intermodal.lead_time_days > 5 && " ⚠️"}
              </strong>
            </div>
            {transport.intermodal.spoilage_penalty > 0 && (
              <div className="t-row"><span>Spoilage penalty</span><strong style={{ color: "var(--red)" }}>+${transport.intermodal.spoilage_penalty.toFixed(2)}</strong></div>
            )}
            {transport.intermodal.notes && (
              <div className="t-note">{transport.intermodal.notes}</div>
            )}
            <div className="t-divider" />
            <div className="t-row">
              <span>Order by</span>
              <strong style={{ color: urgColor(interMissed, interUrgent) }}>
                {interMissed ? "Overdue ⚠️" : deadlineLabel(interOrderDays)}
              </strong>
            </div>
            <div className="t-row"><span>Arrives</span><strong>{arrivalLabel(interOrderDays, transport.intermodal.lead_time_days)}</strong></div>
          </div>
          <div className="urgency-tag" style={{ background: urgBg(interMissed, interUrgent), color: urgColor(interMissed, interUrgent) }}>
            {interMissed ? "Window missed" : interUrgent ? `${interOrderDays}d to order` : `${interOrderDays}d window`}
          </div>
        </div>
      </div>

      {/* Transport AI reasoning */}
      {transport.reasoning && (
        <div className="t-reasoning">
          <span className="t-reasoning-label">🚚 Transport AI reasoning</span>
          <p className="t-reasoning-text">{transport.reasoning}</p>
        </div>
      )}

      {/* Savings + fuel */}
      <div className="savings-row">
        <span>{cheaperIs} saves <strong>${savings}/unit</strong> vs alternative</span>
        <span>Fuel ×{transport.fuel_index.toFixed(1)} {transport.fuel_index >= 1.5 ? "⚠️ high" : transport.fuel_index >= 1.2 ? "⚠️ elevated" : "✓ normal"}</span>
      </div>

      {/* Cost breakdown */}
      <div className="section-title">Cost score breakdown</div>
      {costBars.map(b => (
        <div key={b.label} className="cost-row">
          <span className="cost-label">{b.label}</span>
          <div className="cost-track">
            <div className="cost-fill" style={{
              width: total > 0 ? `${Math.round((b.val / total) * 100)}%` : "0%",
              background: b.color,
            }} />
          </div>
          <span className="cost-amt">${b.val.toFixed(2)}</span>
        </div>
      ))}

      {/* Decision AI reasoning */}
      {(decision as any).decision_reasoning && (
        <div className="reasoning-box">
          <span className="reasoning-label">🧠 Decision AI reasoning</span>
          <p className="reasoning-text">{(decision as any).decision_reasoning}</p>
        </div>
      )}

      {/* LLM summary */}
      {llmExplanation && (
        <div className="llm-box">
          <span className="llm-label">💬 Summary</span>
          <p className="llm-text">{llmExplanation}</p>
        </div>
      )}

      <style jsx>{`
        .card {
          background: var(--surface); border: 1px solid;
          border-radius: var(--radius); padding: 18px;
          grid-column: 1 / -1; box-shadow: var(--shadow-sm);
        }
        .card-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; }
        .card-title { font-size: 13px; font-weight: 600; color: var(--text2); display: flex; align-items: center; gap: 6px; }
        .ai-tag { font-size: 10px; font-weight: 700; background: var(--purple-bg); color: var(--purple); padding: 1px 6px; border-radius: 4px; border: 1px solid var(--purple-border); }
        .head-right { display: flex; align-items: center; gap: 14px; }
        .head-meta  { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
        .action-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
        .score-pill { display: flex; flex-direction: column; align-items: flex-end; }
        .score-label { font-size: 10px; color: var(--muted); }
        .score-val   { font-size: 20px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }

        .risk-flags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .risk-flag  {
          font-size: 11px; font-weight: 600;
          background: var(--amber-bg); color: var(--amber);
          border: 1px solid var(--amber-border);
          padding: 3px 10px; border-radius: 20px;
        }

        .order-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 16px; }
        .order-box  { border: 1px solid; border-radius: var(--radius-sm); padding: 12px 14px; }
        .ob-label   { font-size: 10px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; }
        .ob-val     { font-size: 20px; font-weight: 700; line-height: 1.1; }
        .ob-val span{ font-size: 12px; font-weight: 500; color: var(--muted); }

        .section-title { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; margin-top: 14px; }

        .transport-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
        .t-option   { border: 1px solid; border-radius: var(--radius-sm); overflow: hidden; transition: all 0.15s; }
        .t-header   { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border); }
        .t-name     { font-size: 13px; font-weight: 700; color: var(--text); }
        .t-rec      { font-size: 10px; font-weight: 700; color: var(--blue); background: white; border: 1px solid var(--blue-border); padding: 1px 7px; border-radius: 20px; }
        .t-unavail  { font-size: 10px; font-weight: 700; color: var(--red); background: var(--red-bg); border: 1px solid var(--red-border); padding: 1px 7px; border-radius: 20px; }
        .t-rows     { padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; }
        .t-row      { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
        .t-row strong { color: var(--text); }
        .t-note     { font-size: 11px; color: var(--red); font-style: italic; background: var(--red-bg); padding: 4px 8px; border-radius: 4px; margin-top: 2px; }
        .t-divider  { height: 1px; background: var(--border); margin: 3px 0; }
        .urgency-tag{ margin: 0 10px 10px; padding: 5px 10px; border-radius: var(--radius-xs); font-size: 11px; font-weight: 600; text-align: center; }

        .t-reasoning { background: var(--blue-bg); border: 1px solid var(--blue-border); border-radius: var(--radius-xs); padding: 10px 12px; margin-bottom: 10px; }
        .t-reasoning-label { font-size: 10px; font-weight: 600; color: var(--blue); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px; }
        .t-reasoning-text  { font-size: 12px; color: #1e40af; line-height: 1.5; font-style: italic; }

        .savings-row {
          display: flex; justify-content: space-between;
          font-size: 12px; color: var(--muted);
          background: var(--surface2); border-radius: var(--radius-xs);
          padding: 8px 12px; margin-bottom: 14px;
        }
        .savings-row strong { color: var(--text); }

        .cost-row  { display: grid; grid-template-columns: 100px 1fr 60px; align-items: center; gap: 10px; margin-bottom: 6px; }
        .cost-label{ font-size: 12px; color: var(--text2); font-weight: 500; }
        .cost-track{ height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
        .cost-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
        .cost-amt  { font-size: 12px; font-weight: 600; color: var(--text); text-align: right; font-family: var(--mono); }

        .reasoning-box { border: 1px solid var(--purple-border); background: var(--purple-bg); border-radius: var(--radius-xs); padding: 10px 12px; margin-top: 12px; }
        .reasoning-label { font-size: 10px; font-weight: 600; color: var(--purple); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px; }
        .reasoning-text  { font-size: 12px; color: #5b21b6; line-height: 1.5; font-style: italic; }

        .llm-box { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-xs); padding: 10px 12px; margin-top: 10px; }
        .llm-label{ font-size: 10px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px; }
        .llm-text { font-size: 13px; color: var(--text2); line-height: 1.6; font-style: italic; }

        @media (max-width: 640px) {
          .transport-grid { grid-template-columns: 1fr; }
          .order-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </div>
  );
}
