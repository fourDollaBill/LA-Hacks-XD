"""
agents/transport_agent.py
Thin agent wrapper around core/transport.py.
"""
from core.transport import run_transport
from models.responses import ForecastResult, InventoryResult, TransportResult


class TransportAgent:
    name = "TransportAgent"

    def run(
        self,
        truck_cost_per_unit: float,
        intermodal_cost_per_unit: float,
        fuel_cost_index: float,
        inventory: InventoryResult,
        forecast: ForecastResult,
    ) -> TransportResult:
        return run_transport(
            truck_cost_per_unit=truck_cost_per_unit,
            intermodal_cost_per_unit=intermodal_cost_per_unit,
            fuel_cost_index=fuel_cost_index,
            inventory=inventory,
            forecast=forecast,
        )
