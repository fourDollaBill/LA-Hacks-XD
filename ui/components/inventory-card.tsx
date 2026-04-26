"use client";
import { InventoryResult } from "@/lib/api";

type Risk = "low" | "moderate" | "high" | "critical";

const RISK: Record<Risk, { bg: string; color: string; border: string; label: string }> = {
  low:      { bg: "var(--green-bg)",  color: "var(--green)",  border: "var(--green-border)",  label: "Low"      },
  moderate: { bg: "var(--amber-bg)",  color: "var(--amber)",  border: "var(--amber-border)",  label: "Moderate" },
  high:     { bg: "#fff7ed",          color: "#c2410c",        border: "#fed7aa",               label: "High"     },
  critical: { bg: "var(--red-bg)",    color: "var(--red)",    border: "var(--red-border)",    label: "Critical" },
};

function RiskBadge({ level }: { level: Risk }) {
  const r = RISK[level];
  return (
    <span style={{
      background: r.bg, color: r.color, border: `1px solid ${r.border}`,
      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
    }}>
      {r.label}
    </span>
  );
}

export default function InventoryCard({ data }: { data: InventoryResult }) {
  const usablePct   = Math.round((data.usable_inventory / data.total_inventory) * 100);
  const expiringPct = Math.round((data.expiring_units / data.total_inventory) * 100);
  const r = RISK[data.spoilage_risk as Risk];

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <span className="icon">📦</span>
          Inventory Status
        </div>
        <RiskBadge level={data.spoilage_risk as Risk} />
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric-val">{data.usable_inventory.toLocaleString()}</div>
          <div className="metric-label">usable units</div>
        </div>
        <div className="divider" />
        <div className="metric">
          <div className="metric-val" style={{ color: data.days_until_stockout <= 5 ? "var(--red)" : "var(--text)" }}>
            {data.days_until_stockout}d
          </div>
          <div className="metric-label">to stockout</div>
        </div>
        <div className="divider" />
        <div className="metric">
          <div className="metric-val" style={{ color: r.color }}>{data.expiring_units}</div>
          <div className="metric-label">expiring</div>
        </div>
      </div>

      <div className="bar-section">
        <div className="bar-labels">
          <span>Usable <strong>{usablePct}%</strong></span>
          <span style={{ color: r.color }}>Expiring <strong>{expiringPct}%</strong></span>
        </div>
        <div className="bar-track">
          <div className="bar-usable" style={{ width: `${usablePct}%` }} />
          <div className="bar-expiring" style={{ width: `${expiringPct}%`, background: r.color }} />
        </div>
      </div>

      <div className="risk-row">
        <div className="risk-item">
          <span className="risk-label">Spoilage</span>
          <RiskBadge level={data.spoilage_risk as Risk} />
        </div>
        <div className="risk-item">
          <span className="risk-label">Stockout</span>
          <RiskBadge level={data.stockout_risk as Risk} />
        </div>
      </div>

      <style jsx>{`
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 18px;
          box-shadow: var(--shadow-sm);
        }

        .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .card-title { font-size: 13px; font-weight: 600; color: var(--text2); display: flex; align-items: center; gap: 6px; }
        .icon { font-size: 15px; }

        .metrics { display: flex; align-items: center; background: var(--surface2); border-radius: var(--radius-xs); padding: 12px 0; margin-bottom: 14px; }
        .metric  { flex: 1; text-align: center; }
        .divider { width: 1px; height: 28px; background: var(--border); flex-shrink: 0; }
        .metric-val   { font-size: 22px; font-weight: 700; color: var(--text); line-height: 1; }
        .metric-label { font-size: 11px; color: var(--muted); margin-top: 2px; }

        .bar-section { margin-bottom: 14px; }
        .bar-labels  { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-bottom: 5px; }
        .bar-track   { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; display: flex; position: relative; }
        .bar-usable  { height: 100%; background: var(--green); border-radius: 3px 0 0 3px; transition: width 0.5s; }
        .bar-expiring{ position: absolute; right: 0; height: 100%; border-radius: 0 3px 3px 0; transition: width 0.5s; }

        .risk-row  { display: flex; gap: 16px; }
        .risk-item { display: flex; align-items: center; gap: 8px; }
        .risk-label{ font-size: 11px; color: var(--muted); font-weight: 500; }
      `}</style>
    </div>
  );
}
