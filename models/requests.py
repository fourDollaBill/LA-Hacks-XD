from pydantic import BaseModel, Field
from typing import Optional


class InventoryInput(BaseModel):
    total_units: int
    expiring_soon: int
    days_to_expiry: int
    lead_time_truck: int = 2
    lead_time_intermodal: int = 5
    reorder_threshold: int = 200
    order_max: int = 600


class DemandInput(BaseModel):
    last_7_days: list[int]


class TransportInput(BaseModel):
    truck_cost_per_unit: float = 4.50
    intermodal_cost_per_unit: float = 2.80
    fuel_cost_index: float = 1.0


class ScenarioRunRequest(BaseModel):
    scenario_name: str
    overrides: Optional[dict] = None


class CustomRunRequest(BaseModel):
    inventory: InventoryInput
    demand: DemandInput
    transport: TransportInput
