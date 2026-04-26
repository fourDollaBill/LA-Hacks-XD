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
const RISK_COLOR: Record<Risk, string> = { low: "#16a34a", moderate: "#d97706", high: "#c2410c", critical: "#dc2626" };

export default function DecisionCard({ decision, transport, inventory, forecast, llmExplanation }: Props) {
  const isReorder = decision.should_reorder;
  const total     = decision.total_cost_score;

  // Order deadline logic: order_by = days_until_stockout - lead_time
  const stockoutDays    = inventory.days_until_stockout;
  const truckOrderDays  = Math.round(stockoutDays - transport.truck.lead_time_days);
  const interOrderDays  = Math.round(stockoutDays - transport.intermodal.lead_time_days);

  const today = new Date();
  function deadlineLabel(days: number): string {
    if (days <= 0) return "Overdue ⚠️";
    if (days === 1) return "Tomorrow";
    const d = new Date(today); d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function arrivalLabel(orderDays: number, lead: number): string {
    const d = new Date(today); d.setDate(d.getDate() + Math.max(orderDays, 0) + lead);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const truckUrgent      = truckOrderDays <= 2 && truckOrderDays > 0;
  const truckMissed      = truckOrderDays <= 0;
  const interUrgent      = interOrderDays <= 2 && interOrderDays > 0;
  const interMissed      = interOrderDays <= 0;

  function urgColor(missed: boolean, urgent: boolean) {
    return missed ? "#dc2626" : urgent ? "#c2410c" : "#16a34a";
  }

  const costBars = [
    { label: "Transport",    val: decision.reasoning.transport_cost,    color: "#2563eb" },
    { label: "Stockout risk",val: decision.reasoning.stockout_risk_cost, color: "#d97706" },
    { label: "Spoilage risk",val: decision.reasoning.spoilage_risk_cost, color: "#dc2626" },
  ];

  const savings    = Math.abs(transport.truck.total_score - transport.intermodal.total_score).toFixed(2);
  const cheaperIs  = transport.truck.total_score <= transport.intermodal.total_score ? "Truck" : "Intermodal";

  return (
    <div className="card" style={{ borderColor: isReorder ? "var(--red-border)" : "var(--green-border)" }}>

      {/* Header */}
      <div className="card-head">
        <div className="card-title">
          <span className="icon">🧠</span>
          Decision & Transport
          <span className="ai-tag">AI</span>
        </div>
        <div className="head-right">
          <span className="action-badge" style={{
            background: isReorder ? "var(--red-bg)" : "var(--green-bg)",
            color: isReorder ? "var(--red)" : "var(--green)",
            border: `1px solid ${isReorder ? "var(--red-border)" : "var(--green-border)"}`,
          }}>
            {decision.action}
          </span>
          <div className="score-pill">
            <span className="score-label">Cost score</span>
            <span className="score-val">${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Order summary */}
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

      {/* Transport comparison */}
      <div className="section-title">Transport options</div>
      <div className="transport-grid">

        {/* Truck */}
        <div className="t-option" style={{
          borderColor: transport.recommended === "truck" ? "var(--blue-border)" : "var(--border)",
          background: transport.recommended === "truck" ? "var(--blue-bg)" : "var(--surface2)",
        }}>
          <div className="t-header">
            <div className="t-name">🚛 Truck</div>
            {transport.recommended === "truck" && <span className="t-rec">Recommended</span>}
          </div>
          <div className="t-rows">
            <div className="t-row"><span>Cost/unit</span><strong>${transport.truck.cost_per_unit.toFixed(2)}</strong></div>
            <div className="t-row"><span>Total score</span><strong style={{ color: "var(--blue)" }}>${transport.truck.total_score.toFixed(2)}</strong></div>
            <div className="t-row"><span>Lead time</span><strong>2 days</strong></div>
            <div className="t-divider" />
            <div className="t-row">
              <span>Order by</span>
              <strong style={{ color: urgColor(truckMissed, truckUrgent) }}>
                {truckMissed ? "Overdue ⚠️" : deadlineLabel(truckOrderDays)}
              </strong>
            </div>
            <div className="t-row">
              <span>Arrives</span>
              <strong>{arrivalLabel(truckOrderDays, transport.truck.lead_time_days)}</strong>
            </div>
          </div>
          <div className="urgency-tag" style={{
            background: truckMissed ? "var(--red-bg)" : truckUrgent ? "var(--amber-bg)" : "var(--green-bg)",
            color: urgColor(truckMissed, truckUrgent),
          }}>
            {truckMissed ? "Window missed" : truckUrgent ? `${truckOrderDays}d to order` : `${truckOrderDays}d window`}
          </div>
        </div>

        {/* Intermodal */}
        <div className="t-option" style={{
          borderColor: transport.recommended === "intermodal" ? "var(--green-border)" : "var(--border)",
          background: transport.recommended === "intermodal" ? "var(--green-bg)" : "var(--surface2)",
        }}>
          <div className="t-header">
            <div className="t-name">🚂 Intermodal</div>
            {transport.recommended === "intermodal" && <span className="t-rec" style={{ color: "var(--green)", background: "var(--green-bg)", borderColor: "var(--green-border)" }}>Recommended</span>}
          </div>
          <div className="t-rows">
            <div className="t-row"><span>Cost/unit</span><strong>${transport.intermodal.cost_per_unit.toFixed(2)}</strong></div>
            <div className="t-row">
              <span>Total score</span>
              <strong style={{ color: "var(--green)" }}>${transport.intermodal.total_score.toFixed(2)}</strong>
            </div>
            <div className="t-row"><span>Lead time</span><strong>5 days</strong></div>
            {transport.intermodal.spoilage_penalty > 0 && (
              <div className="t-row">
                <span>Spoilage penalty</span>
                <strong style={{ color: "var(--red)" }}>+${transport.intermodal.spoilage_penalty.toFixed(2)}</strong>
              </div>
            )}
            <div className="t-divider" />
            <div className="t-row">
              <span>Order by</span>
              <strong style={{ color: urgColor(interMissed, interUrgent) }}>
                {interMissed ? "Overdue ⚠️" : deadlineLabel(interOrderDays)}
              </strong>
            </div>
            <div className="t-row">
              <span>Arrives</span>
              <strong>{arrivalLabel(interOrderDays, transport.intermodal.lead_time_days)}</strong>
            </div>
          </div>
          <div className="urgency-tag" style={{
            background: interMissed ? "var(--red-bg)" : interUrgent ? "var(--amber-bg)" : "var(--green-bg)",
            color: urgColor(interMissed, interUrgent),
          }}>
            {interMissed ? "Window missed" : interUrgent ? `${interOrderDays}d to order` : `${interOrderDays}d window`}
          </div>
        </div>
      </div>

      {/* Savings + fuel */}
      <div className="savings-row">
        <span>{cheaperIs} saves <strong>${savings}/unit</strong> vs alternative</span>
        <span>Fuel ×{transport.fuel_index.toFixed(1)} {transport.fuel_index > 1.3 ? "⚠️" : "✓"}</span>
      </div>

      {/* Cost breakdown */}
      <div className="section-title">Cost score breakdown</div>
      {costBars.map((b) => (
        <div key={b.label} className="cost-bar-row">
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

      {/* AI reasoning */}
      {(decision as any).decision_reasoning && (
        <div className="reasoning-box" style={{ borderColor: "var(--purple-border)", background: "var(--purple-bg)" }}>
          <span className="reasoning-label">AI reasoning</span>
          <p className="reasoning-text">{(decision as any).decision_reasoning}</p>
        </div>
      )}

      {/* LLM explanation */}
      {llmExplanation && (
        <div className="llm-box">
          <span className="llm-label">💬 Summary</span>
          <p className="llm-text">{llmExplanation}</p>
        </div>
      )}

      <style jsx>{`
        .card {
          background: var(--surface);
          border: 1px solid;
          border-radius: var(--radius);
          padding: 18px;
          grid-column: 1 / -1;
          box-shadow: var(--shadow-sm);
        }

        .card-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
        .card-title { font-size: 13px; font-weight: 600; color: var(--text2); display: flex; align-items: center; gap: 6px; }
        .icon { font-size: 15px; }
        .ai-tag { font-size: 10px; font-weight: 700; background: var(--purple-bg); color: var(--purple); padding: 1px 6px; border-radius: 4px; border: 1px solid var(--purple-border); }
        .head-right { display: flex; align-items: center; gap: 12px; }
        .action-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
        .score-pill { display: flex; flex-direction: column; align-items: flex-end; }
        .score-label { font-size: 10px; color: var(--muted); }
        .score-val { font-size: 20px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }

        .order-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 18px; }
        .order-box  { border: 1px solid; border-radius: var(--radius-sm); padding: 12px 14px; }
        .ob-label   { font-size: 10px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; }
        .ob-val     { font-size: 20px; font-weight: 700; line-height: 1.1; }
        .ob-val span{ font-size: 12px; font-weight: 500; color: var(--muted); }

        .section-title { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; margin-top: 14px; }

        .transport-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }

        .t-option { border: 1px solid; border-radius: var(--radius-sm); overflow: hidden; transition: all 0.15s; }
        .t-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border); }
        .t-name   { font-size: 13px; font-weight: 700; color: var(--text); }
        .t-rec    { font-size: 10px; font-weight: 700; color: var(--blue); background: white; border: 1px solid var(--blue-border); padding: 1px 7px; border-radius: 20px; }
        .t-rows   { padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; }
        .t-row    { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
        .t-row strong { color: var(--text); }
        .t-divider{ height: 1px; background: var(--border); margin: 3px 0; }
        .urgency-tag { margin: 0 10px 10px; padding: 5px 10px; border-radius: var(--radius-xs); font-size: 11px; font-weight: 600; text-align: center; }

        .savings-row {
          display: flex; justify-content: space-between;
          font-size: 12px; color: var(--muted);
          background: var(--surface2); border-radius: var(--radius-xs);
          padding: 8px 12px; margin-bottom: 14px;
        }
        .savings-row strong { color: var(--text); }

        .cost-bar-row { display: grid; grid-template-columns: 100px 1fr 60px; align-items: center; gap: 10px; margin-bottom: 6px; }
        .cost-label   { font-size: 12px; color: var(--text2); font-weight: 500; }
        .cost-track   { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
        .cost-fill    { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
        .cost-amt     { font-size: 12px; font-weight: 600; color: var(--text); text-align: right; font-family: var(--mono); }

        .reasoning-box { border: 1px solid; border-radius: var(--radius-xs); padding: 10px 12px; margin-top: 14px; }
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
