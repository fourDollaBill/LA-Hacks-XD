"""
agents/orchestrator_agent.py
Coordinates all agents, loads scenario data, and uses an LLM planning loop.
"""
import csv
import json
from pathlib import Path

from agents.forecast_agent import ForecastAgent
from agents.inventory_agent import InventoryAgent
from agents.transport_agent import TransportAgent
from agents.decision_agent import DecisionAgent
from models.responses import RunResult
from ollama_client import get_explanation

DATA_DIR = Path(__file__).parent.parent / "data"


def load_csv(filename: str) -> list[dict]:
    path = DATA_DIR / filename
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def get_scenario_data(scenario_name: str) -> dict:
    scenarios = {r["scenario_name"]: r for r in load_csv("scenarios.csv")}
    demands = {r["scenario_name"]: r for r in load_csv("demand_history.csv")}

    if scenario_name not in scenarios:
        raise ValueError(f"Scenario '{scenario_name}' not found in scenarios.csv")

    s = scenarios[scenario_name]
    d = demands[scenario_name]

    demand_history = [
        int(d["day_1"]), int(d["day_2"]), int(d["day_3"]), int(d["day_4"]),
        int(d["day_5"]), int(d["day_6"]), int(d["day_7"]),
    ]

    return {
        "label": s["label"],
        "color": s["color"],
        "description": s["description"],
        "total_units": int(s["total_units"]),
        "expiring_soon": int(s["expiring_soon"]),
        "days_to_expiry": int(s["days_to_expiry"]),
        "lead_time_truck": int(s["lead_time_truck"]),
        "lead_time_intermodal": int(s["lead_time_intermodal"]),
        "truck_cost_per_unit": float(s["truck_cost_per_unit"]),
        "intermodal_cost_per_unit": float(s["intermodal_cost_per_unit"]),
        "fuel_cost_index": float(s["fuel_cost_index"]),
        "reorder_threshold": int(s["reorder_threshold"]),
        "order_max": int(s["order_max"]),
        "demand_history": demand_history,
    }


def list_scenarios() -> list[dict]:
    rows = load_csv("scenarios.csv")
    return [
        {
            "name": r["scenario_name"],
            "label": r["label"],
            "color": r["color"],
            "description": r["description"],
        }
        for r in rows
    ]


class OrchestratorAgent:
    """
    Agentic orchestrator:
    - plans which tools to call
    - executes them
    - optionally refines once
    - passes full context to the DecisionAgent
    """

    def __init__(self):
        self.forecast_agent = ForecastAgent()
        self.inventory_agent = InventoryAgent()
        self.transport_agent = TransportAgent()
        self.decision_agent = DecisionAgent()

    def _safe_json(self, raw: str, default: dict) -> dict:
        try:
            return json.loads(raw)
        except Exception:
            return default

    def _serialize(self, obj):
        if obj is None:
            return None
        if hasattr(obj, "model_dump"):
            return obj.model_dump()
        if hasattr(obj, "dict"):
            return obj.dict()
        if hasattr(obj, "__dict__"):
            return obj.__dict__
        return str(obj)

    def _plan(self, data: dict, context: dict, step: int) -> dict:
        prompt = f"""
You are an orchestration agent for a supply chain scenario.

Your job:
1. Inspect the scenario
2. Inspect current tool outputs
3. Decide which tool(s) should run next
4. Stop when enough evidence exists for a decision

Available tools:
- forecast
- inventory
- transport

Current step: {step}

Scenario:
{json.dumps(data, indent=2)}

Current context:
{json.dumps(context, indent=2)}

Return ONLY valid JSON:
{{
  "use_forecast": true,
  "use_inventory": true,
  "use_transport": true,
  "enough_information": false,
  "reason": "short explanation"
}}
"""
        raw = get_explanation(prompt)
        return self._safe_json(
            raw,
            {
                "use_forecast": context.get("forecast") is None,
                "use_inventory": context.get("inventory") is None,
                "use_transport": context.get("transport") is None,
                "enough_information": False,
                "reason": "Fallback plan due to JSON parse failure.",
            },
        )

    def run(self, scenario_name: str, overrides: dict | None = None) -> tuple[RunResult, dict]:
        data = get_scenario_data(scenario_name)
        if overrides:
            data.update(overrides)

        context = {
            "forecast": None,
            "inventory": None,
            "transport": None,
            "trace": [],
        }

        max_steps = 2

        for step in range(max_steps):
            plan = self._plan(
                data=data,
                context={
                    "forecast": self._serialize(context["forecast"]),
                    "inventory": self._serialize(context["inventory"]),
                    "transport": self._serialize(context["transport"]),
                },
                step=step,
            )

            context["trace"].append({"step": step, "plan": plan})

            if plan.get("enough_information"):
                break

            if plan.get("use_forecast") and context["forecast"] is None:
                context["forecast"] = self.forecast_agent.run(data["demand_history"])

            if plan.get("use_inventory") and context["inventory"] is None:
                context["inventory"] = self.inventory_agent.run(
                    total_units=data["total_units"],
                    expiring_soon=data["expiring_soon"],
                    lead_time_truck=data["lead_time_truck"],
                    lead_time_intermodal=data["lead_time_intermodal"],
                    forecast=context["forecast"],
                )

            if plan.get("use_transport") and context["transport"] is None:
                context["transport"] = self.transport_agent.run(
                    truck_cost_per_unit=data["truck_cost_per_unit"],
                    intermodal_cost_per_unit=data["intermodal_cost_per_unit"],
                    fuel_cost_index=data["fuel_cost_index"],
                    inventory=context["inventory"],
                    forecast=context["forecast"],
                )

        decision = self.decision_agent.run(
            scenario=data,
            reorder_threshold=data["reorder_threshold"],
            order_max=data["order_max"],
            forecast=context["forecast"],
            inventory=context["inventory"],
            transport=context["transport"],
            trace=context["trace"],
        )

        result = RunResult(
            scenario=data["label"],
            forecast=context["forecast"],
            inventory=context["inventory"],
            transport=context["transport"],
            decision=decision,
        )

        return result, data
