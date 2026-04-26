"use client";
import { TransportResult, InventoryResult, ForecastResult } from "@/lib/api";

interface Props {
  transport: TransportResult;
  inventory: InventoryResult;
  forecast:  ForecastResult;
}

export default function TransportComparison({ transport, inventory, forecast }: Props) {
  const today = new Date();

  function addDays(d: Date, n: number) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  // When you need to ORDER so stock doesn't hit zero
  // Order must arrive before usable inventory runs out
  // order_by = today + (days_until_stockout - lead_time)
  const truckOrderBy     = Math.max(0, Math.round(inventory.days_until_stockout - transport.truck.lead_time_days));
  const intermodalOrderBy= Math.max(0, Math.round(inventory.days_until_stockout - transport.intermodal.lead_time_days));

  const truckArrives     = transport.truck.lead_time_days;
  const intermodalArrives= transport.intermodal.lead_time_days;

  const truckUrgent      = truckOrderBy <= 1;
  const intermodalUrgent = intermodalOrderBy <= 1;
  const truckMissed      = truckOrderBy < 0;
  const intermodalMissed = intermodalOrderBy < 0;

  // Total cost = cost per unit × recommended order quantity (from decision)
  const truckTotal     = transport.truck.total_score;
  const interTotal     = transport.intermodal.total_score;
  const isRecommTruck  = transport.recommended === "truck";

  const OPTIONS = [
    {
      key:         "truck",
      icon:        "🚛",
      name:        "Truck",
      color:       "#2e7de8",
      bg:          "#e8f4fd",
      border:      "#93c5fd",
      costPerUnit: transport.truck.cost_per_unit,
      totalScore:  truckTotal,
      leadDays:    transport.truck.lead_time_days,
      penalty:     0,
      orderInDays: truckOrderBy,
      arriveDate:  addDays(today, truckArrives),
      orderDate:   truckMissed ? "Order overdue!" : truckOrderBy === 0 ? "Order TODAY" : addDays(today, truckOrderBy),
      urgent:      truckUrgent,
      missed:      truckMissed,
      recommended: isRecommTruck,
    },
    {
      key:         "intermodal",
      icon:        "🚂",
      name:        "Intermodal",
      color:       "#0d9e75",
      bg:          "#e6f9ee",
      border:      "#86efac",
      costPerUnit: transport.intermodal.cost_per_unit,
      totalScore:  interTotal,
      leadDays:    transport.intermodal.lead_time_days,
      penalty:     transport.intermodal.spoilage_penalty,
      orderInDays: intermodalOrderBy,
      arriveDate:  addDays(today, intermodalArrives),
      orderDate:   intermodalMissed ? "Order overdue!" : intermodalOrderBy === 0 ? "Order TODAY" : addDays(today, intermodalOrderBy),
      urgent:      intermodalUrgent,
      missed:      intermodalMissed,
      recommended: !isRecommTruck,
    },
  ];

  const cheaper = truckTotal <= interTotal ? "truck" : "intermodal";
  const savings  = Math.abs(truckTotal - interTotal).toFixed(2);

  return (
    <div className="wrap">
      <div className="header">
        <div>
          <div className="title">Transport Decision</div>
          <div className="sub">Cost breakdown and order deadlines for each shipping method</div>
        </div>
        <div className="savings-pill">
          {cheaper === "truck" ? "🚛" : "🚂"} {cheaper === "truck" ? "Truck" : "Intermodal"} saves
          <strong> ${savings}/unit</strong>
        </div>
      </div>

      <div className="grid">
        {OPTIONS.map((opt) => (
          <div
            key={opt.key}
            className="option"
            style={{
              borderColor: opt.recommended ? opt.color : "var(--border)",
              boxShadow:   opt.recommended ? `0 0 0 3px ${opt.bg}` : "none",
            }}
          >
            {/* Option header */}
            <div className="opt-header" style={{ background: opt.bg }}>
              <div className="opt-name-row">
                <span className="opt-icon">{opt.icon}</span>
                <span className="opt-name" style={{ color: opt.color }}>{opt.name}</span>
                {opt.recommended && (
                  <span className="rec-badge" style={{ background: opt.color }}>Recommended</span>
                )}
              </div>
              <div className="opt-lead" style={{ color: opt.color }}>
                {opt.leadDays}-day lead time
              </div>
            </div>

            {/* Cost breakdown */}
            <div className="section">
              <div className="section-label">Cost Breakdown</div>
              <div className="cost-rows">
                <div className="cost-row">
                  <span>Base cost</span>
                  <span className="cost-val">${opt.costPerUnit.toFixed(2)}<span className="per">/unit</span></span>
                </div>
                <div className="cost-row">
                  <span>Fuel index ×{transport.fuel_index.toFixed(1)}</span>
                  <span className="cost-val" style={{ color: transport.fuel_index > 1.3 ? "#c24a10" : "var(--muted)" }}>
                    {transport.fuel_index > 1 ? `+$${((opt.costPerUnit / transport.fuel_index) * (transport.fuel_index - 1)).toFixed(2)}` : "no surcharge"}
                  </span>
                </div>
                {opt.penalty > 0 && (
                  <div className="cost-row">
                    <span>Spoilage penalty</span>
                    <span className="cost-val" style={{ color: "#c24a10" }}>+${opt.penalty.toFixed(2)}<span className="per">/unit</span></span>
                  </div>
                )}
                <div className="cost-row total-row">
                  <span>Total score</span>
                  <span className="total-val" style={{ color: opt.color }}>${opt.totalScore.toFixed(2)}<span className="per">/unit</span></span>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="section">
              <div className="section-label">Order Timeline</div>
              <div className="timeline">
                <div className="tl-step">
                  <div className="tl-dot" style={{ background: opt.missed || opt.urgent ? "#e84c3d" : opt.color }} />
                  <div className="tl-line" style={{ background: opt.color }} />
                  <div className="tl-info">
                    <div
                      className="tl-date"
                      style={{ color: opt.missed ? "#b91c1c" : opt.urgent ? "#c24a10" : "var(--text)" }}
                    >
                      {opt.orderDate}
                    </div>
                    <div className="tl-label">
                      {opt.missed
                        ? "⚠️ Should have ordered already"
                        : opt.urgent
                        ? "⚠️ Order immediately"
                        : `Order in ${opt.orderInDays} day${opt.orderInDays === 1 ? "" : "s"}`}
                    </div>
                  </div>
                </div>
                <div className="tl-step">
                  <div className="tl-dot" style={{ background: opt.color, opacity: 0.5 }} />
                  <div className="tl-info">
                    <div className="tl-date">{opt.arriveDate}</div>
                    <div className="tl-label">Stock arrives ({opt.leadDays} days after order)</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Urgency banner */}
            {(opt.missed || opt.urgent) && (
              <div
                className="urgency-banner"
                style={{
                  background: opt.missed ? "#fdeaea" : "#fff4e0",
                  color:      opt.missed ? "#b91c1c" : "#c47a00",
                  borderColor:opt.missed ? "#fca5a5" : "#fcd34d",
                }}
              >
                {opt.missed
                  ? `⚠️ Stockout risk — intermodal can no longer arrive in time. Switch to truck.`
                  : `⏰ Order window closing — place order within ${opt.orderInDays === 0 ? "today" : `${opt.orderInDays} day${opt.orderInDays === 1 ? "" : "s"}`}`}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary comparison bar */}
      <div className="compare-bar">
        <div className="compare-item">
          <span className="compare-label">Days until stockout</span>
          <span className="compare-val">{inventory.days_until_stockout} days</span>
        </div>
        <div className="compare-divider" />
        <div className="compare-item">
          <span className="compare-label">Truck — order deadline</span>
          <span className="compare-val" style={{ color: truckMissed ? "#b91c1c" : truckUrgent ? "#c24a10" : "#2e7de8" }}>
            {truckMissed ? "Overdue" : `In ${truckOrderBy}d`}
          </span>
        </div>
        <div className="compare-divider" />
        <div className="compare-item">
          <span className="compare-label">Intermodal — order deadline</span>
          <span className="compare-val" style={{ color: intermodalMissed ? "#b91c1c" : intermodalUrgent ? "#c24a10" : "#0d9e75" }}>
            {intermodalMissed ? "Overdue" : `In ${intermodalOrderBy}d`}
          </span>
        </div>
        <div className="compare-divider" />
        <div className="compare-item">
          <span className="compare-label">Cost difference</span>
          <span className="compare-val" style={{ color: "#7c5cbf" }}>${savings}/unit</span>
        </div>
      </div>

      <style jsx>{`
        .wrap {
          background: white;
          border: 2px solid var(--border);
          border-radius: var(--radius);
          padding: 20px;
          grid-column: 1 / -1;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 18px;
          flex-wrap: wrap;
          gap: 10px;
        }

        .title { font-size: 17px; font-weight: 800; color: var(--text); margin-bottom: 2px; }
        .sub   { font-size: 13px; color: var(--muted); font-weight: 600; }

        .savings-pill {
          padding: 6px 16px;
          background: #f8f5ff;
          border: 2px solid #e2d9f7;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          color: #7c5cbf;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }

        .option {
          border: 2px solid;
          border-radius: var(--radius);
          overflow: hidden;
          transition: all 0.2s;
        }

        .opt-header {
          padding: 14px 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .opt-name-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .opt-icon { font-size: 20px; }

        .opt-name {
          font-size: 17px;
          font-weight: 800;
        }

        .rec-badge {
          color: white;
          font-size: 11px;
          font-weight: 800;
          padding: 3px 10px;
          border-radius: 20px;
          letter-spacing: 0.3px;
        }

        .opt-lead {
          font-size: 12px;
          font-weight: 700;
        }

        .section {
          padding: 14px 18px;
          border-top: 1px solid var(--border);
        }

        .section-label {
          font-size: 10px;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 10px;
        }

        .cost-rows { display: flex; flex-direction: column; gap: 7px; }

        .cost-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          color: var(--muted);
          font-weight: 600;
        }

        .cost-val {
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 700;
          color: var(--text);
        }

        .per { font-size: 10px; color: var(--muted); font-weight: 600; }

        .total-row {
          border-top: 1px solid var(--border);
          padding-top: 7px;
          margin-top: 3px;
          color: var(--text);
          font-weight: 800;
          font-size: 14px;
        }

        .total-val {
          font-family: var(--mono);
          font-size: 18px;
          font-weight: 800;
        }

        .timeline { display: flex; flex-direction: column; gap: 0; }

        .tl-step {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          position: relative;
        }

        .tl-dot {
          width: 12px; height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
          margin-top: 4px;
          z-index: 1;
        }

        .tl-line {
          position: absolute;
          left: 5px;
          top: 16px;
          width: 2px;
          height: 28px;
          opacity: 0.3;
        }

        .tl-info { padding-bottom: 18px; }

        .tl-date {
          font-size: 14px;
          font-weight: 800;
          color: var(--text);
          line-height: 1.2;
        }

        .tl-label {
          font-size: 12px;
          color: var(--muted);
          font-weight: 600;
          margin-top: 2px;
        }

        .urgency-banner {
          margin: 0 14px 14px;
          padding: 10px 14px;
          border: 2px solid;
          border-radius: var(--rsm);
          font-size: 13px;
          font-weight: 700;
          line-height: 1.4;
        }

        .compare-bar {
          display: grid;
          grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr;
          background: var(--surface2);
          border-radius: var(--rsm);
          padding: 14px 20px;
          align-items: center;
          gap: 0;
        }

        .compare-item { text-align: center; }
        .compare-label { display: block; font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .compare-val   { font-size: 16px; font-weight: 800; color: var(--text); font-family: var(--mono); }
        .compare-divider { width: 1px; height: 36px; background: var(--border); }

        @media (max-width: 700px) {
          .grid { grid-template-columns: 1fr; }
          .compare-bar { grid-template-columns: 1fr 1fr; gap: 12px; }
          .compare-divider { display: none; }
        }
      `}</style>
    </div>
  );
}
