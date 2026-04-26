"use client";
import { RunResult } from "@/lib/api";

interface Props {
  result: RunResult;
}

export default function PredictionGraph({ result }: Props) {
  const DAYS = 30;
  const daily      = result.forecast.predicted_demand;
  const trend      = result.forecast.trend;
  const usable     = result.inventory.usable_inventory;
  const orderQty   = result.decision.order_quantity;
  const shouldReorder = result.decision.should_reorder;
  const leadTruck  = result.transport.truck.lead_time_days;
  const leadInter  = result.transport.intermodal.lead_time_days;
  const recMethod  = result.decision.transport_method;
  const leadTime   = recMethod.includes("intermodal") ? leadInter : leadTruck;
  const reorderPoint = result.inventory.days_until_stockout;

  // Project daily demand with trend drift
  function projectedDemand(day: number): number {
    const drift = trend === "rising" ? 0.008 : trend === "falling" ? -0.005 : 0;
    return Math.max(1, Math.round(daily * Math.pow(1 + drift, day)));
  }

  // Build inventory projection day by day
  const data: { day: number; inventory: number; demand: number; reorder: boolean; arrival: boolean }[] = [];
  let inv = usable;
  let orderPlaced = false;
  let orderArrivalDay = -1;

  for (let d = 0; d < DAYS; d++) {
    const dem = projectedDemand(d);

    // Place order when inventory hits reorder point
    if (!orderPlaced && shouldReorder && inv <= (daily * (leadTime + 1))) {
      orderPlaced = true;
      orderArrivalDay = d + leadTime;
    }

    // Order arrives
    if (d === orderArrivalDay) {
      inv += orderQty;
    }

    inv = Math.max(0, inv - dem);

    data.push({
      day: d + 1,
      inventory: inv,
      demand: dem,
      reorder: d === 0 && shouldReorder,
      arrival: d === orderArrivalDay,
    });
  }

  // Chart dimensions
  const W = 680;
  const H = 220;
  const PAD = { top: 16, right: 20, bottom: 32, left: 52 };
  const CW = W - PAD.left - PAD.right;
  const CH = H - PAD.top - PAD.bottom;

  const maxInv  = Math.max(...data.map(d => d.inventory), orderQty + usable);
  const maxDem  = Math.max(...data.map(d => d.demand));
  const maxY    = Math.max(maxInv, maxDem) * 1.1;

  function xPos(day: number) { return PAD.left + ((day - 1) / (DAYS - 1)) * CW; }
  function yPos(val: number) { return PAD.top + CH - (val / maxY) * CH; }

  // Build SVG paths
  const invPath = data.map((d, i) =>
    `${i === 0 ? "M" : "L"}${xPos(d.day).toFixed(1)},${yPos(d.inventory).toFixed(1)}`
  ).join(" ");

  const demPath = data.map((d, i) =>
    `${i === 0 ? "M" : "L"}${xPos(d.day).toFixed(1)},${yPos(d.demand).toFixed(1)}`
  ).join(" ");

  const invFill = data.map((d, i) =>
    `${i === 0 ? "M" : "L"}${xPos(d.day).toFixed(1)},${yPos(d.inventory).toFixed(1)}`
  ).join(" ") + ` L${xPos(DAYS).toFixed(1)},${(PAD.top + CH).toFixed(1)} L${PAD.left},${(PAD.top + CH).toFixed(1)} Z`;

  // Stockout day
  const stockoutDay = data.find(d => d.inventory === 0);

  // Y axis labels
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(t => ({
    val: Math.round(maxY * t),
    y: yPos(maxY * t),
  }));

  // X axis labels (every 5 days)
  const xTicks = [1, 5, 10, 15, 20, 25, 30];

  const safeReorderY = yPos(daily * (leadTime + 2));

  return (
    <div className="wrap">
      <div className="header">
        <div>
          <div className="title">30-Day Inventory Prediction</div>
          <div className="sub">
            Projected inventory levels based on {result.forecast.predicted_demand} units/day demand ({result.forecast.trend} trend)
          </div>
        </div>
        <div className="legend">
          <span className="leg-item"><span className="leg-dot" style={{ background: "#2563eb" }} />Inventory</span>
          <span className="leg-item"><span className="leg-dot" style={{ background: "#f59e0b", borderRadius: 2 }} />Demand</span>
          {stockoutDay && <span className="leg-item"><span className="leg-dot" style={{ background: "#dc2626" }} />Stockout</span>}
          {orderArrivalDay >= 0 && <span className="leg-item"><span className="leg-dot" style={{ background: "#16a34a" }} />Reorder arrives</span>}
        </div>
      </div>

      <div className="chart-wrap">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">

          {/* Grid lines */}
          {yTicks.map(t => (
            <g key={t.val}>
              <line x1={PAD.left} y1={t.y} x2={PAD.left + CW} y2={t.y}
                stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
              <text x={PAD.left - 6} y={t.y + 4} textAnchor="end"
                fontSize="10" fill="#9ca3af" fontFamily="JetBrains Mono, monospace">
                {t.val >= 1000 ? `${(t.val/1000).toFixed(1)}k` : t.val}
              </text>
            </g>
          ))}

          {/* Reorder point line */}
          <line
            x1={PAD.left} y1={safeReorderY}
            x2={PAD.left + CW} y2={safeReorderY}
            stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6,3"
          />
          <text x={PAD.left + CW - 2} y={safeReorderY - 4}
            textAnchor="end" fontSize="9" fill="#f59e0b" fontFamily="JetBrains Mono, monospace">
            reorder point
          </text>

          {/* Stockout zone */}
          {stockoutDay && (
            <rect
              x={xPos(stockoutDay.day)} y={PAD.top}
              width={PAD.left + CW - xPos(stockoutDay.day)} height={CH}
              fill="rgba(220,38,38,0.05)"
            />
          )}

          {/* Inventory fill */}
          <path d={invFill} fill="rgba(37,99,235,0.08)" />

          {/* Demand line */}
          <path d={demPath} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,2" />

          {/* Inventory line */}
          <path d={invPath} fill="none" stroke="#2563eb" strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Order arrival marker */}
          {orderArrivalDay >= 0 && orderArrivalDay < DAYS && (
            <g>
              <line
                x1={xPos(orderArrivalDay + 1)} y1={PAD.top}
                x2={xPos(orderArrivalDay + 1)} y2={PAD.top + CH}
                stroke="#16a34a" strokeWidth="2" strokeDasharray="4,2"
              />
              <circle
                cx={xPos(orderArrivalDay + 1)}
                cy={yPos(data[orderArrivalDay]?.inventory ?? 0)}
                r="5" fill="#16a34a"
              />
              <text
                x={xPos(orderArrivalDay + 1) + 5}
                y={PAD.top + 14}
                fontSize="9" fill="#16a34a" fontFamily="JetBrains Mono, monospace">
                +{orderQty} units
              </text>
            </g>
          )}

          {/* Stockout marker */}
          {stockoutDay && (
            <g>
              <circle
                cx={xPos(stockoutDay.day)}
                cy={yPos(0) }
                r="5" fill="#dc2626"
              />
              <text
                x={xPos(stockoutDay.day)}
                y={yPos(0) - 10}
                textAnchor="middle"
                fontSize="9" fill="#dc2626" fontFamily="JetBrains Mono, monospace">
                stockout day {stockoutDay.day}
              </text>
            </g>
          )}

          {/* X axis */}
          <line x1={PAD.left} y1={PAD.top + CH} x2={PAD.left + CW} y2={PAD.top + CH}
            stroke="#e5e7eb" strokeWidth="1" />
          {xTicks.map(d => (
            <g key={d}>
              <line x1={xPos(d)} y1={PAD.top + CH} x2={xPos(d)} y2={PAD.top + CH + 4}
                stroke="#e5e7eb" strokeWidth="1" />
              <text x={xPos(d)} y={PAD.top + CH + 14}
                textAnchor="middle" fontSize="10" fill="#9ca3af" fontFamily="JetBrains Mono, monospace">
                d{d}
              </text>
            </g>
          ))}

          {/* Y axis */}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CH}
            stroke="#e5e7eb" strokeWidth="1" />

          {/* Axis labels */}
          <text x={PAD.left - 38} y={PAD.top + CH / 2}
            textAnchor="middle" fontSize="10" fill="#6b7280"
            transform={`rotate(-90, ${PAD.left - 38}, ${PAD.top + CH / 2})`}>
            units
          </text>
          <text x={PAD.left + CW / 2} y={H - 4}
            textAnchor="middle" fontSize="10" fill="#6b7280">
            days from today
          </text>
        </svg>
      </div>

      {/* Summary stats */}
      <div className="stats-row">
        <div className="stat">
          <div className="stat-val" style={{ color: "#2563eb" }}>{data[DAYS-1]?.inventory.toLocaleString()}</div>
          <div className="stat-label">Inventory day 30</div>
        </div>
        <div className="stat">
          <div className="stat-val" style={{ color: stockoutDay ? "#dc2626" : "#16a34a" }}>
            {stockoutDay ? `Day ${stockoutDay.day}` : "None"}
          </div>
          <div className="stat-label">Stockout risk</div>
        </div>
        <div className="stat">
          <div className="stat-val" style={{ color: "#f59e0b" }}>
            {projectedDemand(DAYS - 1)}
          </div>
          <div className="stat-label">Day 30 demand</div>
        </div>
        <div className="stat">
          <div className="stat-val" style={{ color: "#16a34a" }}>
            {orderArrivalDay >= 0 ? `Day ${orderArrivalDay + 1}` : "No order"}
          </div>
          <div className="stat-label">Reorder arrives</div>
        </div>
        <div className="stat">
          <div className="stat-val">{data.reduce((s, d) => s + d.demand, 0).toLocaleString()}</div>
          <div className="stat-label">Total 30-day demand</div>
        </div>
      </div>

      <style jsx>{`
        .wrap {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 18px;
          box-shadow: var(--shadow-sm);
          grid-column: 1 / -1;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 14px;
          flex-wrap: wrap;
          gap: 10px;
        }

        .title { font-size: 13px; font-weight: 600; color: var(--text2); margin-bottom: 2px; }
        .sub   { font-size: 11px; color: var(--muted); }

        .legend { display: flex; gap: 14px; flex-wrap: wrap; }
        .leg-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); font-weight: 500; }
        .leg-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        .chart-wrap {
          background: var(--surface2);
          border-radius: var(--radius-sm);
          padding: 8px;
          margin-bottom: 14px;
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
          background: var(--surface2);
          border-radius: var(--radius-xs);
          padding: 12px 0;
        }

        .stat { text-align: center; }
        .stat-val   { font-size: 18px; font-weight: 700; line-height: 1; font-family: var(--mono); }
        .stat-label { font-size: 10px; color: var(--muted); margin-top: 3px; font-weight: 500; }

        @media (max-width: 640px) {
          .stats-row { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>
    </div>
  );
}
