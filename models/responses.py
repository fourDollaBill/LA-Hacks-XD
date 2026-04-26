from pydantic import BaseModel
from typing import Optional


class ForecastResult(BaseModel):
    predicted_demand: int
    forecast_3_days: int
    trend: str
    confidence: str
    history: list[int]


class InventoryResult(BaseModel):
    total_inventory: int
    expiring_units: int
    usable_inventory: int
    spoilage_percent: float
    days_until_stockout: float
    spoilage_risk: str
    stockout_risk: str


class TransportOption(BaseModel):
    cost_per_unit: float
    lead_time_days: int
    spoilage_penalty: float
    total_score: float


class TransportResult(BaseModel):
    truck: TransportOption
    intermodal: TransportOption
    recommended: str
    fuel_index: float


class CostBreakdown(BaseModel):
    transport_cost: float
    stockout_risk_cost: float
    spoilage_risk_cost: float


class DecisionResult(BaseModel):
    action: str
    should_reorder: bool
    order_quantity: int
    transport_method: str
    total_cost_score: float
    reasoning: CostBreakdown


class RunResult(BaseModel):
    scenario: str
    forecast: ForecastResult
    inventory: InventoryResult
    transport: TransportResult
    decision: DecisionResult
    llm_explanation: Optional[str] = None
