"""
agents/inventory_agent.py
Thin agent wrapper around core/inventory.py.
"""
from core.inventory import run_inventory
from models.responses import ForecastResult, InventoryResult


class InventoryAgent:
    name = "InventoryAgent"

    def run(
        self,
        total_units: int,
        expiring_soon: int,
        lead_time_truck: int,
        lead_time_intermodal: int,
        forecast: ForecastResult,
    ) -> InventoryResult:
        return run_inventory(
            total_units=total_units,
            expiring_soon=expiring_soon,
            lead_time_truck=lead_time_truck,
            lead_time_intermodal=lead_time_intermodal,
            forecast=forecast,
        )
