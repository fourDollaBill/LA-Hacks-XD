"use client";
import { ForecastResult } from "@/lib/api";

const TREND_STYLES = {
  rising:  { bg: "#fff4e0", color: "#c47a00", arrow: "↑" },
  stable:  { bg: "#e8f4fd", color: "#1a6aa8", arrow: "→" },
  falling: { bg: "#f0f0f0", color: "#666",    arrow: "↓" },
};

export default function ForecastCard({ data }: { data: ForecastResult }) {
  const max = Math.max(...data.history);
  const t = TREND_STYLES[data.trend];

  return (
    <div className="card">
      <div className="card-top">
        <div className="icon-wrap" style={{ background: "#e8f4fd" }}>📈</div>
        <div>
          <div className="card-title">Demand Forecast</div>
          <span className="trend-chip" style={{ background: t.bg, color: t.color }}>
            {t.arrow} {data.trend}
          </span>
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="big-num">{data.predicted_demand}</div>
          <div className="metric-label">units / day</div>
        </div>
        <div className="divider" />
        <div className="metric">
          <div className="big-num">{data.forecast_3_days}</div>
          <div className="metric-label">3-day total</div>
        </div>
        <div className="divider" />
        <div className="metric">
          <div className="big-num" style={{ fontSize: 16, fontWeight: 700, color: "var(--teal)" }}>
            {data.confidence}
          </div>
          <div className="metric-label">confidence</div>
        </div>
      </div>

      <div className="chart-label">Last 7 days</div>
      <div className="bars">
        {data.history.map((v, i) => (
          <div key={i} className="bar-col">
            <div
              className="bar"
              style={{
                height: `${Math.round((v / max) * 52)}px`,
                background: i === data.history.length - 1 ? "var(--blue)" : "#c8dff9",
              }}
            />
            <span className="bar-num">{v}</span>
          </div>
        ))}
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
          line-height: 1.2;
          margin-bottom: 4px;
        }

        .trend-chip {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
          text-transform: capitalize;
        }

        .metrics {
          display: flex;
          align-items: center;
          gap: 0;
          margin-bottom: 18px;
          background: var(--surface2);
          border-radius: var(--rsm);
          padding: 12px 0;
        }

        .metric {
          flex: 1;
          text-align: center;
        }

        .divider {
          width: 1px;
          height: 32px;
          background: var(--border);
          flex-shrink: 0;
        }

        .big-num {
          font-weight: 800;
          font-size: 24px;
          color: var(--text);
          line-height: 1;
        }

        .metric-label {
          font-size: 11px;
          color: var(--muted);
          margin-top: 3px;
          font-weight: 600;
        }

        .chart-label {
          font-size: 12px;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.6px;
          margin-bottom: 8px;
        }

        .bars {
          display: flex;
          align-items: flex-end;
          gap: 5px;
          height: 72px;
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
          border-radius: 4px 4px 0 0;
          transition: height 0.5s cubic-bezier(.4,0,.2,1);
          min-height: 4px;
        }

        .bar-num {
          font-size: 10px;
          color: var(--muted);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
