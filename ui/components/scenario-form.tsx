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
      <div className="label">Scenarios</div>
      <div className="list">
        {scenarios.map((s) => (
          <button
            key={s.name}
            className={`item ${selected === s.name ? "active" : ""}`}
            style={{ "--c": s.color } as React.CSSProperties}
            onClick={() => onSelect(s.name)}
          >
            <span className="dot" />
            <div className="item-text">
              <span className="item-name">{s.label}</span>
              <span className="item-desc">{s.description}</span>
            </div>
          </button>
        ))}
      </div>

      <button className="run-btn" onClick={onRun} disabled={!selected || loading}>
        {loading
          ? <><span className="spin" /> Running agents…</>
          : <>Run analysis</>
        }
      </button>

      <div className="hint">
        {loading
          ? "LLM agents are reasoning…"
          : "2 agents use LLM reasoning"}
      </div>

      <style jsx>{`
        .wrap { display: flex; flex-direction: column; gap: 12px; }

        .label {
          font-size: 11px;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        .list { display: flex; flex-direction: column; gap: 2px; }

        .item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 9px 10px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          cursor: pointer;
          text-align: left;
          transition: all 0.12s;
          width: 100%;
        }

        .item:hover {
          background: var(--surface2);
          border-color: var(--border);
        }

        .item.active {
          background: var(--surface);
          border-color: var(--border2);
          box-shadow: var(--shadow-sm);
        }

        .dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--c, var(--blue));
          flex-shrink: 0;
          margin-top: 4px;
        }

        .item-text { display: flex; flex-direction: column; gap: 1px; }

        .item-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
          line-height: 1.3;
        }

        .item-desc {
          font-size: 11px;
          color: var(--muted);
          line-height: 1.4;
        }

        .run-btn {
          padding: 10px 16px;
          background: var(--text);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          font-family: var(--sans);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.12s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 4px;
        }

        .run-btn:hover:not(:disabled) {
          background: #1f2937;
          box-shadow: var(--shadow-md);
        }

        .run-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .spin {
          width: 12px; height: 12px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .hint {
          font-size: 11px;
          color: var(--faint);
          text-align: center;
        }
      `}</style>
    </div>
  );
}
