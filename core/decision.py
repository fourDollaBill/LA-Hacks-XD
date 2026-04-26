"""
core/decision.py
Pure business logic for the final supply chain decision.
Minimizes: transport cost + spoilage risk + stockout risk.
"""
from models.responses import (
    ForecastResult,
    InventoryResult,
    TransportResult,
    DecisionResult,
    CostBreakdown,
)

STOCKOUT_PENALTY = {"low": 0, "moderate": 1.5, "high": 4.0, "critical": 8.0}
SPOILAGE_PENALTY = {"low": 0, "moderate": 0.5, "high": 2.0, "critical": 5.0}


def run_decision(
    reorder_threshold: int,
    order_max: int,
    forecast: ForecastResult,
    inventory: InventoryResult,
    transport: TransportResult,
) -> DecisionResult:
    """
    Combines all agent outputs into a final reorder recommendation.
    """
    daily_demand = forecast.predicted_demand
    usable = inventory.usable_inventory

    # Trigger reorder?
    should_reorder = (
        usable <= reorder_threshold
        or inventory.stockout_risk in ("high", "critical")
        or inventory.spoilage_risk in ("high", "critical")
    )

    # How much to order?
    safety_days = 3 if forecast.trend == "rising" else 2
    target = (daily_demand * (7 + safety_days)) - usable
    order_quantity = max(0, min(round(target), order_max)) if should_reorder else 0

    # Transport method — with critical stockout override
    transport_method = transport.recommended if should_reorder else "n/a"
    if inventory.stockout_risk == "critical" and transport_method == "intermodal":
        transport_method = "truck (forced — critical stockout)"

    # Cost score breakdown
    chosen = transport.truck if "truck" in transport_method else transport.intermodal
    transport_cost = round(chosen.total_score * order_quantity, 2) if order_quantity > 0 else 0.0
    stockout_cost = round(STOCKOUT_PENALTY[inventory.stockout_risk] * daily_demand, 2)
    spoilage_cost = round(SPOILAGE_PENALTY[inventory.spoilage_risk] * inventory.expiring_units, 2)
    total_cost = round(transport_cost + stockout_cost + spoilage_cost, 2)

    action = "REORDER NOW" if should_reorder else "HOLD — sufficient stock"

    return DecisionResult(
        action=action,
        should_reorder=should_reorder,
        order_quantity=order_quantity,
        transport_method=transport_method,
        total_cost_score=total_cost,
        reasoning=CostBreakdown(
            transport_cost=transport_cost,
            stockout_risk_cost=stockout_cost,
            spoilage_risk_cost=spoilage_cost,
        ),
    )
