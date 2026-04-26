"use client";
import { InventoryResult } from "@/lib/api";

type Risk = "low" | "moderate" | "high" | "critical";

const RISK = {
  low:      { bg: "#e6f9ee", color: "#1a7a3c", label: "Low" },
  moderate: { bg: "#fff4e0", color: "#c47a00", label: "Moderate" },
  high:     { bg: "#fff0e8", color: "#c24a10", label: "High" },
  critical: { bg: "#fdeaea", color: "#b91c1c", label: "Critical" },
};

function RiskChip({ level }: { level: Risk }) {
  const r = RISK[level];
  return (
    <span style={{
      background: r.bg,
      color: r.color,
      padding: "3px 10px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 700,
    }}>
      {r.label}
    </span>
  );
}

export default function InventoryCard({ data }: { data: InventoryResult }) {
  const usablePct = Math.round((data.usable_inventory / data.total_inventory) * 100);
  const expiringPct = Math.round((data.expiring_units / data.total_inventory) * 100);
  const r = RISK[data.spoilage_risk];

  return (
    <div className="card">
      <div className="card-top">
        <div className="icon-wrap" style={{ background: "#e6f9ee" }}>📦</div>
        <div>
          <div className="card-title">Inventory</div>
          <RiskChip level={data.spoilage_risk} />
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="big-num">{data.usable_inventory.toLocaleString()}</div>
          <div className="metric-label">usable units</div>
        </div>
        <div className="divider" />
        <div className="metric">
          <div className="big-num">{data.days_until_stockout}d</div>
          <div className="metric-label">to stockout</div>
        </div>
        <div className="divider" />
        <div className="metric">
          <div className="big-num" style={{ color: r.color }}>{data.expiring_units}</div>
          <div className="metric-label">expiring</div>
        </div>
      </div>

      <div className="bar-wrap">
        <div className="bar-labels">
          <span>Usable <strong>{usablePct}%</strong></span>
          <span style={{ color: r.color }}>Expiring <strong>{expiringPct}%</strong></span>
        </div>
        <div className="bar-track">
          <div className="bar-usable" style={{ width: `${usablePct}%` }} />
          <div className="bar-expiring" style={{ width: `${expiringPct}%`, background: r.color }} />
        </div>
      </div>

      <div className="risks">
        <div className="risk-row">
          <span className="risk-label">Spoilage</span>
          <RiskChip level={data.spoilage_risk} />
        </div>
        <div className="risk-row">
          <span className="risk-label">Stockout</span>
          <RiskChip level={data.stockout_risk} />
        </div>
      </div>

      <style jsx>{`
        .card {
          background: var(--surface);
          border: 2px solid var(--border);
          border-radius: var(--radius);
          padding: 20px;
        }

        .card-top {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 18px;
        }

        .icon-wrap {
          width: 40px; height: 40px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }

        .card-title {
          font-weight: 800;
          font-size: 15px;
          color: var(--text);
          margin-bottom: 4px;
        }

        .metrics {
          display: flex;
          align-items: center;
          background: var(--surface2);
          border-radius: var(--rsm);
          padding: 12px 0;
          margin-bottom: 16px;
        }

        .metric { flex: 1; text-align: center; }

        .divider { width: 1px; height: 32px; background: var(--border); flex-shrink: 0; }

        .big-num {
          font-weight: 800;
          font-size: 24px;
          color: var(--text);
          line-height: 1;
        }

        .metric-label { font-size: 11px; color: var(--muted); margin-top: 3px; font-weight: 600; }

        .bar-wrap { margin-bottom: 16px; }

        .bar-labels {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--muted);
          font-weight: 600;
          margin-bottom: 6px;
        }

        .bar-track {
          height: 8px;
          background: var(--surface2);
          border-radius: 4px;
          overflow: hidden;
          display: flex;
          position: relative;
        }

        .bar-usable {
          height: 100%;
          background: var(--teal);
          border-radius: 4px 0 0 4px;
          transition: width 0.7s cubic-bezier(.4,0,.2,1);
        }

        .bar-expiring {
          position: absolute;
          right: 0;
          height: 100%;
          border-radius: 0 4px 4px 0;
          transition: width 0.7s;
        }

        .risks { display: flex; gap: 12px; }

        .risk-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .risk-label { font-size: 12px; color: var(--muted); font-weight: 700; }
      `}</style>
    </div>
  );
}
