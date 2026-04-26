"use client";
import { useState } from "react";

export interface WhatIfValues {
  fuel_cost_index:  number;
  demand_multiplier: number;
  expiry_days:       number;
}

interface Props {
  onRun: (overrides: WhatIfValues) => void;
  loading: boolean;
}

const DEFAULTS: WhatIfValues = {
  fuel_cost_index:   1.0,
  demand_multiplier: 1.0,
  expiry_days:       6,
};

export default function WhatIfSliders({ onRun, loading }: Props) {
  const [vals, setVals] = useState<WhatIfValues>(DEFAULTS);
  const [dirty, setDirty] = useState(false);

  function set(key: keyof WhatIfValues, val: number) {
    setVals(v => ({ ...v, [key]: val }));
    setDirty(true);
  }

  function reset() { setVals(DEFAULTS); setDirty(false); }

  const fuelLabel = vals.fuel_cost_index >= 2.0 ? "🔴 Very High"
    : vals.fuel_cost_index >= 1.5 ? "🟠 High"
    : vals.fuel_cost_index >= 1.2 ? "🟡 Elevated"
    : "🟢 Normal";

  const demandLabel = vals.demand_multiplier >= 2.5 ? "🔴 3× surge"
    : vals.demand_multiplier >= 1.8 ? "🟠 High surge"
    : vals.demand_multiplier >= 1.3 ? "🟡 Elevated"
    : "🟢 Normal";

  const expiryLabel = vals.expiry_days <= 3 ? "🔴 Critical"
    : vals.expiry_days <= 5 ? "🟠 Short"
    : vals.expiry_days <= 8 ? "🟡 Moderate"
    : "🟢 Long";

  return (
    <div className="wrap">
      <div className="header">
        <div className="title">What-if Analysis</div>
        <div className="header-right">
          {dirty && (
            <button className="reset-btn" onClick={reset}>Reset</button>
          )}
          <button className="run-btn" onClick={() => onRun(vals)} disabled={loading}>
            {loading ? <><span className="spin" /> Running…</> : <>Run scenario</>}
          </button>
        </div>
      </div>

      <div className="sliders">
        {/* Fuel */}
        <div className="slider-row">
          <div className="slider-meta">
            <span className="slider-label">Fuel cost index</span>
            <span className="slider-val">{fuelLabel}</span>
          </div>
          <div className="slider-track">
            <input
              type="range" min="0.8" max="3.0" step="0.1"
              value={vals.fuel_cost_index}
              onChange={e => set("fuel_cost_index", parseFloat(e.target.value))}
            />
            <div className="slider-ticks">
              <span>0.8×</span><span>1.5×</span><span>2.0×</span><span>3.0×</span>
            </div>
          </div>
          <div className="slider-num">×{vals.fuel_cost_index.toFixed(1)}</div>
        </div>

        {/* Demand */}
        <div className="slider-row">
          <div className="slider-meta">
            <span className="slider-label">Demand multiplier</span>
            <span className="slider-val">{demandLabel}</span>
          </div>
          <div className="slider-track">
            <input
              type="range" min="0.5" max="3.0" step="0.1"
              value={vals.demand_multiplier}
              onChange={e => set("demand_multiplier", parseFloat(e.target.value))}
            />
            <div className="slider-ticks">
              <span>0.5×</span><span>1.0×</span><span>2.0×</span><span>3.0×</span>
            </div>
          </div>
          <div className="slider-num">×{vals.demand_multiplier.toFixed(1)}</div>
        </div>

        {/* Shelf life */}
        <div className="slider-row">
          <div className="slider-meta">
            <span className="slider-label">Shelf life (days)</span>
            <span className="slider-val">{expiryLabel}</span>
          </div>
          <div className="slider-track">
            <input
              type="range" min="1" max="14" step="1"
              value={vals.expiry_days}
              onChange={e => set("expiry_days", parseInt(e.target.value))}
            />
            <div className="slider-ticks">
              <span>1d</span><span>4d</span><span>8d</span><span>14d</span>
            </div>
          </div>
          <div className="slider-num">{vals.expiry_days}d</div>
        </div>
      </div>

      <style jsx>{`
        .wrap {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 16px 18px;
          box-shadow: var(--shadow-sm);
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }

        .title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text2);
        }

        .header-right { display: flex; align-items: center; gap: 8px; }

        .reset-btn {
          font-size: 12px; font-weight: 500; color: var(--muted);
          background: none; border: 1px solid var(--border);
          border-radius: var(--radius-xs); padding: 4px 10px;
          cursor: pointer; transition: all 0.1s;
        }
        .reset-btn:hover { background: var(--surface2); color: var(--text); }

        .run-btn {
          font-size: 12px; font-weight: 600;
          background: var(--text); color: white;
          border: none; border-radius: var(--radius-xs);
          padding: 5px 14px; cursor: pointer;
          transition: all 0.1s;
          display: flex; align-items: center; gap: 6px;
        }
        .run-btn:hover:not(:disabled) { background: #1f2937; }
        .run-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .spin {
          width: 10px; height: 10px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%;
          animation: spin 0.7s linear infinite; display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .sliders { display: flex; flex-direction: column; gap: 14px; }

        .slider-row {
          display: grid;
          grid-template-columns: 160px 1fr 40px;
          align-items: center;
          gap: 12px;
        }

        .slider-meta { display: flex; flex-direction: column; gap: 2px; }
        .slider-label{ font-size: 12px; font-weight: 600; color: var(--text); }
        .slider-val  { font-size: 11px; color: var(--muted); }

        .slider-track { display: flex; flex-direction: column; gap: 2px; }

        input[type="range"] {
          width: 100%; height: 4px;
          -webkit-appearance: none;
          background: var(--surface2);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          background: var(--text);
          border-radius: 50%;
          cursor: pointer;
          transition: transform 0.1s;
        }
        input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.2); }

        .slider-ticks {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: var(--faint);
          font-family: var(--mono);
          padding: 0 2px;
        }

        .slider-num {
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
          text-align: right;
        }
      `}</style>
    </div>
  );
}
