"use client";
import { TransportResult } from "@/lib/api";

export default function TransportCard({ data }: { data: TransportResult }) {
  const fuelHigh = data.fuel_index > 1.3;
  const maxScore = Math.max(data.truck.total_score, data.intermodal.total_score);

  return (
    <div className="card">
      <div className="card-top">
        <div className="icon-wrap" style={{ background: "#fff4e0" }}>🚚</div>
        <div>
          <div className="card-title">Transport</div>
          <span
            className="chip"
            style={{
              background: fuelHigh ? "#fff0e8" : "#f0f0f0",
              color: fuelHigh ? "#c24a10" : "var(--muted)",
            }}
          >
            Fuel ×{data.fuel_index.toFixed(1)} {fuelHigh ? "⚠️" : ""}
          </span>
        </div>
      </div>

      {[
        { key: "truck", label: "Truck 🚛", opt: data.truck, win: data.recommended === "truck" },
        { key: "intermodal", label: "Intermodal 🚂", opt: data.intermodal, win: data.recommended === "intermodal" },
      ].map(({ key, label, opt, win }) => (
        <div
          key={key}
          className="option"
          style={{
            borderColor: win ? "var(--teal)" : "var(--border)",
            opacity: win ? 1 : 0.55,
          }}
        >
          <div className="opt-header">
            <span className="opt-name">{label}</span>
            {win && <span className="selected-tag">Selected</span>}
          </div>
          <div className="score-bar-track">
            <div
              className="score-bar"
              style={{
                width: `${Math.round((opt.total_score / maxScore) * 100)}%`,
                background: win ? "var(--teal)" : "var(--border)",
              }}
            />
          </div>
          <div className="opt-stats">
            <span>${opt.cost_per_unit.toFixed(2)}/unit</span>
            <span>{opt.lead_time_days}-day lead</span>
            {opt.spoilage_penalty > 0 && (
              <span style={{ color: "var(--red)" }}>+${opt.spoilage_penalty.toFixed(2)} spoilage</span>
            )}
            <span className="score"><strong>${opt.total_score.toFixed(2)}</strong> total</span>
          </div>
        </div>
      ))}

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

        .chip {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
        }

        .option {
          border: 2px solid;
          border-radius: var(--rsm);
          padding: 12px 14px;
          margin-bottom: 10px;
          transition: all 0.2s;
        }

        .option:last-child { margin-bottom: 0; }

        .opt-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .opt-name { font-weight: 800; font-size: 14px; color: var(--text); }

        .selected-tag {
          font-size: 11px;
          font-weight: 800;
          color: var(--teal);
          background: #e6f9ee;
          padding: 2px 8px;
          border-radius: 20px;
          letter-spacing: 0.3px;
        }

        .score-bar-track {
          height: 6px;
          background: var(--surface2);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .score-bar {
          height: 100%;
          border-radius: 3px;
          transition: width 0.6s cubic-bezier(.4,0,.2,1);
        }

        .opt-stats {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: var(--muted);
          font-weight: 600;
          flex-wrap: wrap;
        }

        .score { color: var(--text); }
      `}</style>
    </div>
  );
}
