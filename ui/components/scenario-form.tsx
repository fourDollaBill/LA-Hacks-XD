"use client";
import { Scenario } from "@/lib/api";

interface Props {
  scenarios: Scenario[];
  selected: string | null;
  loading: boolean;
  onSelect: (name: string) => void;
  onRun: () => void;
}

export default function ScenarioForm({ scenarios, selected, loading, onSelect, onRun }: Props) {
  return (
    <div className="wrap">
      <p className="section-label">Choose a scenario</p>
      <div className="grid">
        {scenarios.map((s) => (
          <button
            key={s.name}
            className={`btn ${selected === s.name ? "active" : ""}`}
            style={{ "--c": s.color } as React.CSSProperties}
            onClick={() => onSelect(s.name)}
          >
            <span className="dot" />
            <span className="btn-label">{s.label}</span>
            <span className="btn-desc">{s.description}</span>
          </button>
        ))}
      </div>

      <button className={`run ${loading ? "busy" : ""}`} onClick={onRun} disabled={!selected || loading}>
        {loading ? (
          <><span className="spinner" /> Agents running…</>
        ) : (
          <>Run all agents ›</>
        )}
      </button>

      <style jsx>{`
        .wrap { display: flex; flex-direction: column; gap: 14px; }

        .section-label {
          font-weight: 700;
          font-size: 13px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }

        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

        .btn {
          background: var(--surface);
          border: 2px solid var(--border);
          border-radius: var(--rsm);
          padding: 12px 14px;
          cursor: pointer;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 3px;
          transition: all 0.18s;
        }

        .btn:hover {
          border-color: var(--c, var(--blue));
          background: white;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }

        .btn.active {
          border-color: var(--c, var(--blue));
          background: white;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--c, var(--blue)) 15%, transparent);
        }

        .dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--c, var(--blue));
          display: block;
          margin-bottom: 4px;
        }

        .btn-label {
          font-weight: 800;
          font-size: 13px;
          color: var(--text);
          display: block;
          line-height: 1.2;
        }

        .btn-desc {
          font-size: 11px;
          color: var(--muted);
          display: block;
          line-height: 1.4;
        }

        .run {
          padding: 14px 20px;
          background: var(--text);
          color: white;
          border: none;
          border-radius: var(--rsm);
          font-family: var(--sans);
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.18s;
          margin-top: 4px;
          letter-spacing: 0.2px;
        }

        .run:hover:not(:disabled) {
          background: #2e2a26;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.18);
        }

        .run:disabled { opacity: 0.45; cursor: not-allowed; }

        .run.busy { background: var(--muted); }

        .spinner {
          display: inline-block;
          width: 13px; height: 13px;
          border: 2px solid rgba(255,255,255,0.4);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          vertical-align: middle;
          margin-right: 6px;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
