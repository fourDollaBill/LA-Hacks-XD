"use client";
import { DecisionResult, TransportResult, InventoryResult, ForecastResult } from "@/lib/api";

interface Props {
  decision:       DecisionResult;
  transport:      TransportResult;
  inventory:      InventoryResult;
  forecast:       ForecastResult;
  llmExplanation: string | null;
}

export default function DecisionCard({ decision, transport, inventory, forecast, llmExplanation }: Props) {
  const isReorder   = decision.should_reorder;
  const accentColor = isReorder ? "#b91c1c" : "#1a7a3c";
  const accentBg    = isReorder ? "#fdeaea" : "#e6f9ee";
  const accentBorder= isReorder ? "#f87171" : "#4ade80";
  const total       = decision.total_cost_score;

  // ── Order deadline logic ───────────────────────────────────────────────────
  // days_until_stockout = how many days of usable stock remain at current demand
  // To avoid stockout: order must be placed with enough time for delivery to arrive
  // order_by_days = days_until_stockout - lead_time  (days from today)
  // If <= 0, the window is already missed for that method

  const stockoutDays    = inventory.days_until_stockout;
  const truckLead       = transport.truck.lead_time_days;
  const intermodalLead  = transport.intermodal.lead_time_days;

  const truckOrderDays      = Math.round(stockoutDays - truckLead);
  const intermodalOrderDays = Math.round(stockoutDays - intermodalLead);

  const today = new Date();
  function dateFromNow(days: number): string {
    if (days <= 0) return "Overdue";
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  function arrivalDate(orderDays: number, leadDays: number): string {
    const d = new Date(today);
    d.setDate(d.getDate() + Math.max(orderDays, 0) + leadDays);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  const truckOrderLabel      = dateFromNow(truckOrderDays);
  const truckArrivalLabel    = arrivalDate(truckOrderDays, truckLead);
  const intermodalOrderLabel = dateFromNow(intermodalOrderDays);
  const intermodalArrivalLabel = arrivalDate(intermodalOrderDays, intermodalLead);

  const truckMissed      = truckOrderDays <= 0;
  const intermodalMissed = intermodalOrderDays <= 0;
  const truckUrgent      = !truckMissed && truckOrderDays <= 2;
  const intermodalUrgent = !intermodalMissed && intermodalOrderDays <= 2;

  const costDiff   = Math.abs(transport.truck.total_score - transport.intermodal.total_score).toFixed(2);
  const cheaperIs  = transport.truck.total_score <= transport.intermodal.total_score ? "truck" : "intermodal";

  const costBars = [
    { label: "Transport",    val: decision.reasoning.transport_cost,    color: "#2e7de8" },
    { label: "Stockout risk",val: decision.reasoning.stockout_risk_cost, color: "#f0921a" },
    { label: "Spoilage risk",val: decision.reasoning.spoilage_risk_cost, color: "#e84c3d" },
  ];

  function urgencyColor(missed: boolean, urgent: boolean) {
    if (missed) return "#b91c1c";
    if (urgent) return "#c24a10";
    return "#1a7a3c";
  }
  function urgencyBg(missed: boolean, urgent: boolean) {
    if (missed) return "#fdeaea";
    if (urgent) return "#fff4e0";
    return "#e6f9ee";
  }

  return (
    <div className="card" style={{ borderColor: accentBorder }}>

      {/* ── Header ── */}
      <div className="card-top">
        <div className="icon-wrap" style={{ background: accentBg }}>🧠</div>
        <div style={{ flex: 1 }}>
          <div className="card-title">Decision & Transport</div>
          <span className="action-chip" style={{ background: accentBg, color: accentColor }}>
            {decision.action}
          </span>
        </div>
        <div className="cost-pill">
          <span className="cost-label">Total cost score</span>
          <span className="cost-val">${total.toFixed(2)}</span>
        </div>
      </div>

      {/* ── Order summary boxes ── */}
      {isReorder && (
        <div className="order-row">
          <div className="order-box" style={{ background: "#e8f4fd", borderColor: "#93c5fd" }}>
            <div className="order-label">Order quantity</div>
            <div className="order-val" style={{ color: "#1a6aa8" }}>
              {decision.order_quantity.toLocaleString()} <span>units</span>
            </div>
          </div>
          <div className="order-box" style={{ background: "#e6f9ee", borderColor: "#86efac" }}>
            <div className="order-label">Recommended method</div>
            <div className="order-val" style={{ color: "#1a7a3c", fontSize: 16 }}>
              {decision.transport_method}
            </div>
          </div>
          <div className="order-box" style={{ background: "#fff4e0", borderColor: "#fcd34d" }}>
            <div className="order-label">Days until stockout</div>
            <div className="order-val" style={{ color: stockoutDays <= 3 ? "#b91c1c" : "#c47a00" }}>
              {stockoutDays} <span>days</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Transport comparison ── */}
      <div className="section-label">Transport Options — Cost & Order Deadline</div>
      <div className="transport-grid">

        {/* Truck */}
        <div className="t-card" style={{
          borderColor: transport.recommended === "truck" ? "#2e7de8" : "var(--border)",
          boxShadow: transport.recommended === "truck" ? "0 0 0 3px #e8f4fd" : "none",
        }}>
          <div className="t-header" style={{ background: "#e8f4fd" }}>
            <div className="t-name-row">
              <span className="t-icon">🚛</span>
              <span className="t-name" style={{ color: "#1a6aa8" }}>Truck</span>
              {transport.recommended === "truck" && <span className="rec-tag" style={{ background: "#2e7de8" }}>Recommended</span>}
            </div>
            <span className="t-lead" style={{ color: "#1a6aa8" }}>{truckLead}-day lead time</span>
          </div>

          <div className="t-body">
            <div className="t-cost-row">
              <span>Cost per unit</span>
              <span className="t-cost-val">${transport.truck.cost_per_unit.toFixed(2)}</span>
            </div>
            {transport.fuel_index > 1 && (
              <div className="t-cost-row">
                <span>Fuel surcharge ×{transport.fuel_index}</span>
                <span className="t-cost-val" style={{ color: "#c24a10" }}>included</span>
              </div>
            )}
            <div className="t-cost-row">
              <span>Spoilage penalty</span>
              <span className="t-cost-val">—</span>
            </div>
            <div className="t-cost-row total">
              <span>Total score</span>
              <span className="t-total" style={{ color: "#1a6aa8" }}>${transport.truck.total_score.toFixed(2)}/unit</span>
            </div>

            <div className="t-divider" />

            <div className="t-timeline">
              <div className="tl-row">
                <div className="tl-dot" style={{ background: urgencyColor(truckMissed, truckUrgent) }} />
                <div>
                  <div className="tl-date" style={{ color: urgencyColor(truckMissed, truckUrgent) }}>
                    {truckMissed ? "⚠️ Order overdue" : truckOrderDays === 0 ? "⚠️ Order today" : `Order by ${truckOrderLabel}`}
                  </div>
                  <div className="tl-sub">
                    {truckMissed
                      ? "Stockout likely before truck arrives"
                      : `${truckOrderDays} day${truckOrderDays === 1 ? "" : "s"} remaining to place order`}
                  </div>
                </div>
              </div>
              <div className="tl-line" />
              <div className="tl-row">
                <div className="tl-dot" style={{ background: "#2e7de8", opacity: 0.5 }} />
                <div>
                  <div className="tl-date" style={{ color: "var(--muted)" }}>Arrives {truckArrivalLabel}</div>
                  <div className="tl-sub">{truckLead} days after order</div>
                </div>
              </div>
            </div>

            <div
              className="urgency-tag"
              style={{ background: urgencyBg(truckMissed, truckUrgent), color: urgencyColor(truckMissed, truckUrgent) }}
            >
              {truckMissed
                ? "Window missed — too late for safe delivery"
                : truckUrgent
                ? `Urgent — only ${truckOrderDays} day${truckOrderDays === 1 ? "" : "s"} to order`
                : `✓ ${truckOrderDays} days to place order`}
            </div>
          </div>
        </div>

        {/* Intermodal */}
        <div className="t-card" style={{
          borderColor: transport.recommended === "intermodal" ? "#0d9e75" : "var(--border)",
          boxShadow: transport.recommended === "intermodal" ? "0 0 0 3px #e6f9ee" : "none",
        }}>
          <div className="t-header" style={{ background: "#e6f9ee" }}>
            <div className="t-name-row">
              <span className="t-icon">🚂</span>
              <span className="t-name" style={{ color: "#1a7a3c" }}>Intermodal</span>
              {transport.recommended === "intermodal" && <span className="rec-tag" style={{ background: "#0d9e75" }}>Recommended</span>}
            </div>
            <span className="t-lead" style={{ color: "#1a7a3c" }}>{intermodalLead}-day lead time</span>
          </div>

          <div className="t-body">
            <div className="t-cost-row">
              <span>Cost per unit</span>
              <span className="t-cost-val">${transport.intermodal.cost_per_unit.toFixed(2)}</span>
            </div>
            {transport.fuel_index > 1 && (
              <div className="t-cost-row">
                <span>Fuel surcharge ×{transport.fuel_index}</span>
                <span className="t-cost-val" style={{ color: "#c24a10" }}>included</span>
              </div>
            )}
            <div className="t-cost-row">
              <span>Spoilage penalty</span>
              <span className="t-cost-val" style={{ color: transport.intermodal.spoilage_penalty > 0 ? "#c24a10" : "var(--muted)" }}>
                {transport.intermodal.spoilage_penalty > 0 ? `+$${transport.intermodal.spoilage_penalty.toFixed(2)}/unit` : "—"}
              </span>
            </div>
            <div className="t-cost-row total">
              <span>Total score</span>
              <span className="t-total" style={{ color: "#1a7a3c" }}>${transport.intermodal.total_score.toFixed(2)}/unit</span>
            </div>

            <div className="t-divider" />

            <div className="t-timeline">
              <div className="tl-row">
                <div className="tl-dot" style={{ background: urgencyColor(intermodalMissed, intermodalUrgent) }} />
                <div>
                  <div className="tl-date" style={{ color: urgencyColor(intermodalMissed, intermodalUrgent) }}>
                    {intermodalMissed ? "⚠️ Order overdue" : intermodalOrderDays === 0 ? "⚠️ Order today" : `Order by ${intermodalOrderLabel}`}
                  </div>
                  <div className="tl-sub">
                    {intermodalMissed
                      ? "Stockout will occur before intermodal arrives"
                      : `${intermodalOrderDays} day${intermodalOrderDays === 1 ? "" : "s"} remaining to place order`}
                  </div>
                </div>
              </div>
              <div className="tl-line" />
              <div className="tl-row">
                <div className="tl-dot" style={{ background: "#0d9e75", opacity: 0.5 }} />
                <div>
                  <div className="tl-date" style={{ color: "var(--muted)" }}>Arrives {intermodalArrivalLabel}</div>
                  <div className="tl-sub">{intermodalLead} days after order</div>
                </div>
              </div>
            </div>

            <div
              className="urgency-tag"
              style={{ background: urgencyBg(intermodalMissed, intermodalUrgent), color: urgencyColor(intermodalMissed, intermodalUrgent) }}
            >
              {intermodalMissed
                ? "Window missed — switch to truck"
                : intermodalUrgent
                ? `Urgent — only ${intermodalOrderDays} day${intermodalOrderDays === 1 ? "" : "s"} to order`
                : `✓ ${intermodalOrderDays} days to place order`}
            </div>
          </div>
        </div>
      </div>

      {/* ── Savings callout ── */}
      <div className="savings-bar">
        <span className="savings-label">Cost difference:</span>
        <span className="savings-val">
          {cheaperIs === "truck" ? "🚛 Truck" : "🚂 Intermodal"} saves <strong>${costDiff}/unit</strong>
          {" "}vs the alternative
        </span>
        <span className="savings-label" style={{ marginLeft: "auto" }}>
          Fuel index: <strong style={{ color: transport.fuel_index > 1.3 ? "#c24a10" : "var(--text)" }}>×{transport.fuel_index.toFixed(1)}</strong>
        </span>
      </div>

      {/* ── Cost breakdown bars ── */}
      <div className="section-label" style={{ marginTop: 16 }}>Why this decision — Cost Score Breakdown</div>
      {costBars.map((b) => (
        <div key={b.label} className="bar-row">
          <span className="bar-label">{b.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: total > 0 ? `${Math.round((b.val / total) * 100)}%` : "0%", background: b.color }} />
          </div>
          <span className="bar-amt">${b.val.toFixed(2)}</span>
        </div>
      ))}

      {/* ── AI Insight ── */}
      {llmExplanation && (
        <div className="llm-box">
          <div className="llm-label">💬 AI Insight — powered by DeepSeek on DGX Spark</div>
          <p className="llm-text">{llmExplanation}</p>
        </div>
      )}

      <style jsx>{`
        .card {
          background: var(--surface);
          border: 2px solid;
          border-radius: var(--radius);
          padding: 20px;
          grid-column: 1 / -1;
          transition: border-color 0.3s;
        }

        .card-top {
          display: flex; align-items: flex-start; gap: 12px;
          margin-bottom: 18px; flex-wrap: wrap;
        }
        .icon-wrap {
          width: 40px; height: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; flex-shrink: 0;
        }
        .card-title  { font-weight: 800; font-size: 15px; color: var(--text); margin-bottom: 4px; }
        .action-chip { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 800; }
        .cost-pill   { display: flex; flex-direction: column; align-items: flex-end; }
        .cost-label  { font-size: 11px; color: var(--muted); font-weight: 700; }
        .cost-val    { font-size: 22px; font-weight: 800; color: var(--text); }

        .order-row {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 12px; margin-bottom: 20px;
        }
        .order-box   { border: 2px solid; border-radius: var(--rsm); padding: 14px 16px; }
        .order-label { font-size: 10px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .order-val   { font-weight: 800; font-size: 22px; line-height: 1.1; }
        .order-val span { font-size: 13px; font-weight: 600; }

        .section-label {
          font-size: 10px; font-weight: 700; color: var(--muted);
          text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;
        }

        .transport-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }

        .t-card   { border: 2px solid; border-radius: var(--radius); overflow: hidden; transition: all 0.2s; }
        .t-header { padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
        .t-name-row { display: flex; align-items: center; gap: 8px; }
        .t-icon  { font-size: 18px; }
        .t-name  { font-size: 16px; font-weight: 800; }
        .rec-tag { color: white; font-size: 10px; font-weight: 800; padding: 2px 9px; border-radius: 20px; }
        .t-lead  { font-size: 12px; font-weight: 700; }
        .t-body  { padding: 14px 16px; }

        .t-cost-row {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 13px; color: var(--muted); font-weight: 600; margin-bottom: 6px;
        }
        .t-cost-row.total { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 4px; font-weight: 800; color: var(--text); }
        .t-cost-val { font-family: var(--mono); font-size: 13px; font-weight: 700; color: var(--text); }
        .t-total    { font-family: var(--mono); font-size: 17px; font-weight: 800; }

        .t-divider { height: 1px; background: var(--border); margin: 12px 0; }

        .t-timeline { display: flex; flex-direction: column; gap: 0; margin-bottom: 12px; }
        .tl-row { display: flex; gap: 10px; align-items: flex-start; position: relative; }
        .tl-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
        .tl-line { width: 2px; height: 20px; background: var(--border); margin: 2px 0 2px 4px; }
        .tl-date { font-size: 13px; font-weight: 800; color: var(--text); line-height: 1.3; }
        .tl-sub  { font-size: 11px; color: var(--muted); font-weight: 600; margin-top: 1px; }

        .urgency-tag {
          padding: 8px 12px; border-radius: var(--rsm);
          font-size: 12px; font-weight: 700; line-height: 1.4;
        }

        .savings-bar {
          display: flex; align-items: center; gap: 10px;
          background: var(--surface2); border-radius: var(--rsm);
          padding: 10px 16px; font-size: 13px; color: var(--muted);
          font-weight: 600; margin-bottom: 14px; flex-wrap: wrap;
        }
        .savings-label { font-size: 12px; font-weight: 700; }
        .savings-val   { color: var(--text); }

        .bar-row {
          display: grid; grid-template-columns: 110px 1fr 70px;
          align-items: center; gap: 10px; margin-bottom: 8px;
        }
        .bar-label { font-size: 13px; color: var(--text); font-weight: 600; }
        .bar-track { height: 8px; background: var(--surface2); border-radius: 4px; overflow: hidden; }
        .bar-fill  { height: 100%; border-radius: 4px; transition: width 0.7s cubic-bezier(.4,0,.2,1); }
        .bar-amt   { font-size: 13px; font-weight: 700; color: var(--text); text-align: right; font-family: var(--mono); }

        .llm-box {
          background: #f8f5ff; border: 2px solid #e2d9f7;
          border-radius: var(--rsm); padding: 14px 16px; margin-top: 16px;
        }
        .llm-label {
          font-size: 11px; font-weight: 800; color: #7c5cbf;
          margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .llm-text { font-size: 14px; color: #4a3a6e; font-style: italic; font-weight: 400; line-height: 1.65; }

        @media (max-width: 700px) {
          .transport-grid { grid-template-columns: 1fr; }
          .order-row { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </div>
  );
}
