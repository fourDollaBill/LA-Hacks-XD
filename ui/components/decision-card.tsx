"use client";
import { DecisionResult } from "@/lib/api";

export default function DecisionCard({
  decision,
  llmExplanation,
}: {
  decision: DecisionResult;
  llmExplanation: string | null;
}) {
  const isReorder = decision.should_reorder;
  const accentBg = isReorder ? "#fdeaea" : "#e6f9ee";
  const accentColor = isReorder ? "#b91c1c" : "#1a7a3c";
  const accentBorder = isReorder ? "#f87171" : "#4ade80";
  const total = decision.total_cost_score;

  const bars = [
    { label: "Transport", val: decision.reasoning.transport_cost, color: "#2e7de8" },
    { label: "Stockout risk", val: decision.reasoning.stockout_risk_cost, color: "#f0921a" },
    { label: "Spoilage risk", val: decision.reasoning.spoilage_risk_cost, color: "#e84c3d" },
  ];

  return (
    <div className="card" style={{ borderColor: accentBorder }}>
      <div className="card-top">
        <div className="icon-wrap" style={{ background: accentBg }}>🧠</div>
        <div className="card-titles">
          <div className="card-title">Decision</div>
          <span className="action-chip" style={{ background: accentBg, color: accentColor }}>
            {decision.action}
          </span>
        </div>
        <div className="cost-pill">
          <span className="cost-label">Total score</span>
          <span className="cost-val">${total.toFixed(2)}</span>
        </div>
      </div>

      {isReorder && (
        <div className="order-row">
          <div className="order-box" style={{ background: "#e8f4fd", borderColor: "#93c5fd" }}>
            <div className="order-label">Order quantity</div>
            <div className="order-val" style={{ color: "#1a6aa8" }}>
              {decision.order_quantity.toLocaleString()} <span>units</span>
            </div>
          </div>
          <div className="order-box" style={{ background: "#e6f9ee", borderColor: "#86efac" }}>
            <div className="order-label">Ship via</div>
            <div className="order-val" style={{ color: "#1a7a3c", fontSize: 15 }}>
              {decision.transport_method}
            </div>
          </div>
        </div>
      )}

      <div className="breakdown">
        <p className="breakdown-title">Cost breakdown</p>
        {bars.map((b) => (
          <div key={b.label} className="bar-row">
            <span className="bar-label">{b.label}</span>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: total > 0 ? `${Math.round((b.val / total) * 100)}%` : "0%",
                  background: b.color,
                }}
              />
            </div>
            <span className="bar-amt">${b.val.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {llmExplanation && (
        <div className="llm-box">
          <div className="llm-label">💬 AI Insight</div>
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
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }

        .icon-wrap {
          width: 40px; height: 40px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }

        .card-titles { flex: 1; }

        .card-title { font-weight: 800; font-size: 15px; color: var(--text); margin-bottom: 4px; }

        .action-chip {
          display: inline-block;
          padding: 4px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 800;
        }

        .cost-pill {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .cost-label { font-size: 11px; color: var(--muted); font-weight: 700; }
        .cost-val { font-size: 22px; font-weight: 800; color: var(--text); }

        .order-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 18px;
        }

        .order-box {
          border: 2px solid;
          border-radius: var(--rsm);
          padding: 14px 16px;
        }

        .order-label { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }

        .order-val {
          font-weight: 800;
          font-size: 22px;
          line-height: 1.1;
        }

        .order-val span { font-size: 13px; font-weight: 600; }

        .breakdown { margin-bottom: 16px; }

        .breakdown-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.6px;
          margin-bottom: 10px;
        }

        .bar-row {
          display: grid;
          grid-template-columns: 110px 1fr 70px;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }

        .bar-label { font-size: 13px; color: var(--text); font-weight: 600; }

        .bar-track {
          height: 8px;
          background: var(--surface2);
          border-radius: 4px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.7s cubic-bezier(.4,0,.2,1);
        }

        .bar-amt {
          font-size: 13px;
          font-weight: 700;
          color: var(--text);
          text-align: right;
          font-family: var(--mono);
        }

        .llm-box {
          background: #f8f5ff;
          border: 2px solid #e2d9f7;
          border-radius: var(--rsm);
          padding: 14px 16px;
        }

        .llm-label {
          font-size: 12px;
          font-weight: 800;
          color: #7c5cbf;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .llm-text {
          font-size: 14px;
          color: #4a3a6e;
          font-style: italic;
          font-weight: 400;
          line-height: 1.65;
        }
      `}</style>
    </div>
  );
}
