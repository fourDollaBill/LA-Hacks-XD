"""
core/inventory.py
Pure business logic for inventory evaluation.
"""
from models.responses import ForecastResult, InventoryResult


def run_inventory(
    total_units: int,
    expiring_soon: int,
    lead_time_truck: int,
    lead_time_intermodal: int,
    forecast: ForecastResult,
) -> InventoryResult:
    """
    Evaluates usable inventory, expiry risk, and days until stockout.
    """
    daily_demand = forecast.predicted_demand
    usable = max(total_units - expiring_soon, 0)
    days_until_stockout = round(usable / daily_demand, 1) if daily_demand > 0 else 999.0
    spoilage_pct = round((expiring_soon / total_units) * 100, 1) if total_units > 0 else 0.0

    # Spoilage risk
    ratio = expiring_soon / total_units if total_units > 0 else 0
    if ratio > 0.5:
        spoilage_risk = "critical"
    elif ratio > 0.2:
        spoilage_risk = "high"
    elif ratio > 0.05:
        spoilage_risk = "moderate"
    else:
        spoilage_risk = "low"

    # Stockout risk
    if days_until_stockout <= lead_time_truck:
        stockout_risk = "critical"
    elif days_until_stockout <= lead_time_intermodal:
        stockout_risk = "high"
    elif days_until_stockout <= lead_time_intermodal + 2:
        stockout_risk = "moderate"
    else:
        stockout_risk = "low"

    return InventoryResult(
        total_inventory=total_units,
        expiring_units=expiring_soon,
        usable_inventory=usable,
        spoilage_percent=spoilage_pct,
        days_until_stockout=days_until_stockout,
        spoilage_risk=spoilage_risk,
        stockout_risk=stockout_risk,
    )
