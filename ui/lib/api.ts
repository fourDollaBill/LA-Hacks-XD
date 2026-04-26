const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Scenario {
  name:        string;
  label:       string;
  color:       string;
  description: string;
}

export interface ForecastResult {
  predicted_demand: number;
  forecast_3_days:  number;
  trend:            "rising" | "falling" | "stable";
  confidence:       string;
  history:          number[];
  reasoning?:       string;
}

export interface InventoryResult {
  total_inventory:     number;
  expiring_units:      number;
  usable_inventory:    number;
  spoilage_percent:    number;
  days_until_stockout: number;
  spoilage_risk:       "low" | "moderate" | "high" | "critical";
  stockout_risk:       "low" | "moderate" | "high" | "critical";
}

export interface TransportOption {
  cost_per_unit:    number;
  lead_time_days:   number;
  spoilage_penalty: number;
  total_score:      number;
  available?:       boolean;
  notes?:           string | null;
}

export interface TransportResult {
  truck:       TransportOption;
  intermodal:  TransportOption;
  recommended: string;
  fuel_index:  number;
  reasoning?:  string | null;
  risk_flags?: string[];
}

export interface CostBreakdown {
  transport_cost:     number;
  stockout_risk_cost: number;
  spoilage_risk_cost: number;
}

export interface DecisionResult {
  action:              string;
  should_reorder:      boolean;
  order_quantity:      number;
  transport_method:    string;
  total_cost_score:    number;
  confidence_score?:   number;
  reasoning:           CostBreakdown;
  decision_reasoning?: string | null;
}

export interface RunResult {
  scenario:        string;
  forecast:        ForecastResult;
  inventory:       InventoryResult;
  transport:       TransportResult;
  decision:        DecisionResult;
  llm_explanation: string | null;
}

export async function fetchScenarios(): Promise<Scenario[]> {
  const res = await fetch(`${API_BASE}/scenarios`);
  if (!res.ok) throw new Error("Failed to fetch scenarios");
  const data = await res.json();
  return data.scenarios;
}

export async function runScenario(
  scenario_name: string,
  overrides?: Record<string, unknown>
): Promise<RunResult> {
  const res = await fetch(`${API_BASE}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario_name, overrides }),
  });
  if (!res.ok) throw new Error("Failed to run scenario");
  return res.json();
}
