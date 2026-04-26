"""
agents/orchestrator_agent.py
Upgraded async orchestrator — coordinates all agents including
LLM-powered ForecastAgent and DecisionAgent.
"""
import csv
from pathlib import Path

from agents.forecast_agent  import ForecastAgent
from agents.inventory_agent import InventoryAgent
from agents.transport_agent import TransportAgent
from agents.decision_agent  import DecisionAgent
from llm.ollama_client      import get_explanation
from models.responses       import RunResult

DATA_DIR = Path(__file__).parent.parent / "data"


def load_csv(filename: str) -> list[dict]:
    with open(DATA_DIR / filename, newline="") as f:
        return list(csv.DictReader(f))


def get_scenario_data(scenario_name: str) -> dict:
    scenarios = {r["scenario_name"]: r for r in load_csv("scenarios.csv")}
    demands   = {r["scenario_name"]: r for r in load_csv("demand_history.csv")}

    if scenario_name not in scenarios:
        raise ValueError(f"Scenario '{scenario_name}' not found in scenarios.csv")

    s = scenarios[scenario_name]
    d = demands[scenario_name]

    return {
        "label":                    s["label"],
        "color":                    s["color"],
        "description":              s["description"],
        "total_units":              int(s["total_units"]),
        "expiring_soon":            int(s["expiring_soon"]),
        "days_to_expiry":           int(s["days_to_expiry"]),
        "lead_time_truck":          int(s["lead_time_truck"]),
        "lead_time_intermodal":     int(s["lead_time_intermodal"]),
        "truck_cost_per_unit":      float(s["truck_cost_per_unit"]),
        "intermodal_cost_per_unit": float(s["intermodal_cost_per_unit"]),
        "fuel_cost_index":          float(s["fuel_cost_index"]),
        "reorder_threshold":        int(s["reorder_threshold"]),
        "order_max":                int(s["order_max"]),
        "demand_history": [
            int(d["day_1"]), int(d["day_2"]), int(d["day_3"]), int(d["day_4"]),
            int(d["day_5"]), int(d["day_6"]), int(d["day_7"]),
        ],
    }


def list_scenarios() -> list[dict]:
    return [
        {"name": r["scenario_name"], "label": r["label"],
         "color": r["color"], "description": r["description"]}
        for r in load_csv("scenarios.csv")
    ]


class OrchestratorAgent:
    """
    Coordinates all agents in sequence:
      1. ForecastAgent   — LLM reasons about demand trend
      2. InventoryAgent  — deterministic stock evaluation
      3. TransportAgent  — deterministic cost comparison
      4. DecisionAgent   — LLM weighs everything and decides
      5. LLM Explainer   — final human-readable summary

    Each agent's output is passed as context to the next.
    """

    def __init__(self):
        self.forecast_agent  = ForecastAgent()
        self.inventory_agent = InventoryAgent()
        self.transport_agent = TransportAgent()
        self.decision_agent  = DecisionAgent()

    async def run(self, scenario_name: str, overrides: dict | None = None) -> tuple[RunResult, dict]:
        data = get_scenario_data(scenario_name)
        if overrides:
            data.update(overrides)

        # Step 1: ForecastAgent — LLM reasons about demand
        forecast = await self.forecast_agent.run(data["demand_history"])

        # Step 2: InventoryAgent — deterministic, uses forecast as input
        inventory = self.inventory_agent.run(
            total_units=data["total_units"],
            expiring_soon=data["expiring_soon"],
            lead_time_truck=data["lead_time_truck"],
            lead_time_intermodal=data["lead_time_intermodal"],
            forecast=forecast,
        )

        # Step 3: TransportAgent — deterministic, uses inventory + forecast
        transport = self.transport_agent.run(
            truck_cost_per_unit=data["truck_cost_per_unit"],
            intermodal_cost_per_unit=data["intermodal_cost_per_unit"],
            fuel_cost_index=data["fuel_cost_index"],
            inventory=inventory,
            forecast=forecast,
        )

        # Step 4: DecisionAgent — LLM weighs forecast + inventory + transport
        decision = await self.decision_agent.run(
            reorder_threshold=data["reorder_threshold"],
            order_max=data["order_max"],
            forecast=forecast,
            inventory=inventory,
            transport=transport,
        )

        result = RunResult(
            scenario=data["label"],
            forecast=forecast,
            inventory=inventory,
            transport=transport,
            decision=decision,
        )

        # Step 5: Final LLM explanation
        result.llm_explanation = await get_explanation(result)

        return result, data
