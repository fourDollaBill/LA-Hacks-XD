"""
agents/decision_agent.py
LLM-driven decision agent with deterministic fallback.
"""
import json

from core.decision import run_decision
from models.responses import ForecastResult, InventoryResult, TransportResult, DecisionResult
from ollama_client import get_explanation


class DecisionAgent:
    name = "DecisionAgent"

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

    def _parse_json(self, raw: str) -> dict | None:
        try:
            return json.loads(raw)
        except Exception:
            return None

    def run(
        self,
        scenario: dict,
        reorder_threshold: int,
        order_max: int,
        forecast: ForecastResult,
        inventory: InventoryResult,
        transport: TransportResult,
        trace: list | None = None,
    ):
        baseline = run_decision(
            reorder_threshold=reorder_threshold,
            order_max=order_max,
            forecast=forecast,
            inventory=inventory,
            transport=transport,
        )

        prompt = f"""
You are a supply chain decision agent.

You must make the final operational recommendation using the scenario context and tool outputs.

Scenario:
{json.dumps(scenario, indent=2)}

Forecast result:
{json.dumps(self._serialize(forecast), indent=2)}

Inventory result:
{json.dumps(self._serialize(inventory), indent=2)}

Transport result:
{json.dumps(self._serialize(transport), indent=2)}

Orchestration trace:
{json.dumps(trace or [], indent=2)}

Deterministic baseline recommendation:
{json.dumps(self._serialize(baseline), indent=2)}

Requirements:
1. Compare forecasted demand against inventory position
2. Consider expiry risk
3. Consider transport cost vs lead time tradeoffs
4. Decide whether to reorder
5. If reorder, recommend a quantity <= order_max
6. Keep the recommendation grounded in the structured inputs

Return ONLY valid JSON:
{{
  "action": "reorder" | "hold",
  "quantity": 0,
  "priority": "low" | "medium" | "high",
  "reason": "short explanation",
  "risk_notes": ["note 1", "note 2"],
  "baseline_alignment": true
}}
"""

        raw = get_explanation(prompt)
        llm_decision = self._parse_json(raw)

        if llm_decision is None:
            return baseline

        # If your DecisionResult is a Pydantic model with matching fields,
        # you can construct it directly here.
        try:
            return DecisionResult(**llm_decision)
        except Exception:
            # Fallback: return baseline if schema doesn't match
            return baseline
