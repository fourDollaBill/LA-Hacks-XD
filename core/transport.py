"""
core/transport.py
Pure business logic for transport comparison.
"""
from models.responses import ForecastResult, InventoryResult, TransportOption, TransportResult

SPOILAGE_COST_PER_UNIT = 3.00
LEAD_TIME_DIFF_DAYS = 3  # intermodal is ~3 days slower than truck

SPOILAGE_RATES = {
    "low": 0.01,
    "moderate": 0.05,
    "high": 0.12,
    "critical": 0.25,
}


def run_transport(
    truck_cost_per_unit: float,
    intermodal_cost_per_unit: float,
    fuel_cost_index: float,
    inventory: InventoryResult,
    forecast: ForecastResult,
) -> TransportResult:
    """
    Compares truck vs intermodal factoring in fuel cost and spoilage penalty.
    """
    # Apply fuel index
    truck_cost = round(truck_cost_per_unit * fuel_cost_index, 2)
    intermodal_cost = round(intermodal_cost_per_unit * fuel_cost_index, 2)

    # Spoilage penalty for intermodal (slower = more units spoil in transit)
    spoilage_rate = SPOILAGE_RATES.get(inventory.spoilage_risk, 0.05)
    daily_spoilage = inventory.usable_inventory * spoilage_rate
    intermodal_penalty = round(
        LEAD_TIME_DIFF_DAYS * daily_spoilage * SPOILAGE_COST_PER_UNIT
        / max(forecast.predicted_demand, 1),
        2,
    )

    truck_total = round(truck_cost, 2)
    intermodal_total = round(intermodal_cost + intermodal_penalty, 2)

    recommended = "truck" if truck_total <= intermodal_total else "intermodal"

    return TransportResult(
        truck=TransportOption(
            cost_per_unit=truck_cost,
            lead_time_days=2,
            spoilage_penalty=0.0,
            total_score=truck_total,
        ),
        intermodal=TransportOption(
            cost_per_unit=intermodal_cost,
            lead_time_days=5,
            spoilage_penalty=intermodal_penalty,
            total_score=intermodal_total,
        ),
        recommended=recommended,
        fuel_index=fuel_cost_index,
    )
