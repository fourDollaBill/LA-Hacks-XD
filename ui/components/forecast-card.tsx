"use client";
import { ForecastResult } from "@/lib/api";

const TREND = {
  rising:  { color: "#d97706", bg: "#fffbeb", label: "Rising ↑" },
  stable:  { color: "#2563eb", bg: "#eff6ff", label: "Stable →" },
  falling: { color: "#6b7280", bg: "#f3f4f6", label: "Falling ↓" },
};

export default function ForecastCard({ data }: { data: ForecastResult }) {
  const max = Math.max(...data.history);
  const t   = TREND[data.trend as keyof typeof TREND] ?? TREND.stable;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <span className="icon">📈</span>
          Demand Forecast
          <span className="ai-tag">AI</span>
        </div>
        <span className="trend-pill" style={{ background: t.bg, color: t.color }}>
          {t.label}
        </span>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric-val">{data.predicted_demand}</div>
          <div className="metric-label">units / day</div>
        </div>
        <div className="divider" />
        <div className="metric">
          <div className="metric-val">{data.forecast_3_days}</div>
          <div className="metric-label">3-day total</div>
        </div>
        <div className="divider" />
        <div className="metric">
          <div className="metric-val conf" style={{ color: data.confidence === "high" ? "#16a34a" : data.confidence === "medium" ? "#d97706" : "#6b7280" }}>
            {data.confidence}
          </div>
          <div className="metric-label">confidence</div>
        </div>
      </div>

      <div className="chart">
        <div className="chart-label">7-day history</div>
        <div className="bars">
          {data.history.map((v, i) => (
            <div key={i} className="bar-col">
              <div
                className="bar"
                style={{
                  height: `${Math.round((v / max) * 48)}px`,
                  background: i === data.history.length - 1 ? "var(--blue)" : "var(--border2)",
                }}
              />
              <span className="bar-num">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {data.reasoning && (
        <div className="reasoning">
          <span className="reasoning-label">AI reasoning</span>
          <p className="reasoning-text">{data.reasoning}</p>
        </div>
      )}

      <style jsx>{`
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 18px;
          box-shadow: var(--shadow-sm);
        }

        .card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .card-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text2);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .icon { font-size: 15px; }

        .ai-tag {
          font-size: 10px;
          font-weight: 700;
          background: var(--purple-bg);
          color: var(--purple);
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid var(--purple-border);
          letter-spacing: 0.3px;
        }

        .trend-pill {
          font-size: 12px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 20px;
        }

        .metrics {
          display: flex;
          align-items: center;
          background: var(--surface2);
          border-radius: var(--radius-xs);
          padding: 12px 0;
          margin-bottom: 16px;
        }

        .metric { flex: 1; text-align: center; }

        .divider { width: 1px; height: 28px; background: var(--border); flex-shrink: 0; }

        .metric-val {
          font-size: 22px;
          font-weight: 700;
          color: var(--text);
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }

        .conf { font-size: 14px !important; font-weight: 600 !important; text-transform: capitalize; }

        .metric-label {
          font-size: 11px;
          color: var(--muted);
          margin-top: 2px;
        }

        .chart { margin-bottom: 12px; }

        .chart-label {
          font-size: 11px;
          color: var(--muted);
          font-weight: 500;
          margin-bottom: 8px;
        }

        .bars {
          display: flex;
          align-items: flex-end;
          gap: 4px;
          height: 60px;
        }

        .bar-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          gap: 3px;
          height: 100%;
        }

        .bar {
          width: 100%;
          border-radius: 3px 3px 0 0;
          transition: height 0.4s ease;
          min-height: 3px;
        }

        .bar-num { font-size: 9px; color: var(--faint); font-family: var(--mono); }

        .reasoning {
          background: var(--purple-bg);
          border: 1px solid var(--purple-border);
          border-radius: var(--radius-xs);
          padding: 10px 12px;
        }

        .reasoning-label {
          font-size: 10px;
          font-weight: 600;
          color: var(--purple);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: block;
          margin-bottom: 4px;
        }

        .reasoning-text {
          font-size: 12px;
          color: #5b21b6;
          line-height: 1.5;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
