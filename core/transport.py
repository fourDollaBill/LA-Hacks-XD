"""
core/transport.py
Upgraded transport logic — handles dynamic lead times, port delays,
weather disruptions, and risk flags.
"""
from models.responses import ForecastResult, InventoryResult, TransportOption, TransportResult

SPOILAGE_COST_PER_UNIT = 3.00

SPOILAGE_RATES = {
    "low": 0.01, "moderate": 0.05, "high": 0.12, "critical": 0.25,
}


def run_transport(
    truck_cost_per_unit: float,
    intermodal_cost_per_unit: float,
    fuel_cost_index: float,
    inventory: InventoryResult,
    forecast: ForecastResult,
    lead_time_truck: int = 2,
    lead_time_intermodal: int = 5,
) -> TransportResult:
    """
    Compares truck vs intermodal with dynamic lead times and risk flags.
    Supports port delays (lead_time_intermodal > 5) and other disruptions.
    """
    # Apply fuel index to base costs
    truck_cost      = round(truck_cost_per_unit * fuel_cost_index, 2)
    intermodal_cost = round(intermodal_cost_per_unit * fuel_cost_index, 2)

    # Actual lead time difference (may be larger due to port delay)
    lead_diff = lead_time_intermodal - lead_time_truck

    # Spoilage penalty: extra days in transit × daily spoilage × cost
    spoilage_rate    = SPOILAGE_RATES.get(inventory.spoilage_risk, 0.05)
    daily_spoilage   = inventory.usable_inventory * spoilage_rate
    intermodal_penalty = round(
        lead_diff * daily_spoilage * SPOILAGE_COST_PER_UNIT
        / max(forecast.predicted_demand, 1),
        2,
    )

    truck_total      = round(truck_cost, 2)
    intermodal_total = round(intermodal_cost + intermodal_penalty, 2)

    # Stockout override: if intermodal can't arrive before stockout, force truck
    intermodal_arrives_in = lead_time_intermodal
    stockout_in           = inventory.days_until_stockout
    intermodal_too_slow   = intermodal_arrives_in >= stockout_in

    if intermodal_too_slow:
        recommended = "truck"
    else:
        recommended = "truck" if truck_total <= intermodal_total else "intermodal"

    # Risk flags
    risk_flags = []
    if fuel_cost_index >= 1.5:
        risk_flags.append(f"Fuel elevated ×{fuel_cost_index}")
    if lead_time_intermodal > 5:
        risk_flags.append(f"Port delay — intermodal lead time {lead_time_intermodal}d")
    if intermodal_too_slow:
        risk_flags.append("Intermodal too slow — stockout before arrival")
    if inventory.spoilage_risk in ("high", "critical"):
        risk_flags.append(f"Spoilage risk {inventory.spoilage_risk} increases intermodal penalty")

    # Notes on each option
    truck_notes = None
    intermodal_notes = None
    if intermodal_too_slow:
        intermodal_notes = f"Arrives in {lead_time_intermodal}d — after {stockout_in}d stockout"
    if lead_time_intermodal > 5:
        intermodal_notes = f"Port delay: {lead_time_intermodal}-day lead time (normally 5d)"

    return TransportResult(
        truck=TransportOption(
            cost_per_unit=truck_cost,
            lead_time_days=lead_time_truck,
            spoilage_penalty=0.0,
            total_score=truck_total,
            available=True,
            notes=truck_notes,
        ),
        intermodal=TransportOption(
            cost_per_unit=intermodal_cost,
            lead_time_days=lead_time_intermodal,
            spoilage_penalty=intermodal_penalty,
            total_score=intermodal_total,
            available=not intermodal_too_slow,
            notes=intermodal_notes,
        ),
        recommended=recommended,
        fuel_index=fuel_cost_index,
        risk_flags=risk_flags,
    )
