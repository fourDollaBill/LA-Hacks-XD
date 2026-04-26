"""
agents/decision_agent.py
Thin agent wrapper around core/decision.py.
"""
from core.decision import run_decision
from models.responses import ForecastResult, InventoryResult, TransportResult, DecisionResult


class DecisionAgent:
    name = "DecisionAgent"

    def run(
        self,
        reorder_threshold: int,
        order_max: int,
        forecast: ForecastResult,
        inventory: InventoryResult,
        transport: TransportResult,
    ) -> DecisionResult:
        return run_decision(
            reorder_threshold=reorder_threshold,
            order_max=order_max,
            forecast=forecast,
            inventory=inventory,
            transport=transport,
        )
