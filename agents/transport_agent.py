"""
agents/transport_agent.py
Upgraded TransportAgent — LLM reasons about transport choice,
considers port delays, weather, urgency, and risk flags.
"""
import json
from core.transport import run_transport
from llm.ollama_client import reason
from models.responses import ForecastResult, InventoryResult, TransportResult


TRANSPORT_PROMPT = """You are a logistics agent for a perishable goods supply chain.

You have two shipping options and must recommend the best one.

SITUATION:
- Inventory: {usable} usable units, {days_stockout} days until stockout
- Spoilage risk: {spoilage_risk} ({expiring} units expiring soon)
- Demand trend: {trend} at {daily} units/day

TRUCK:
- Cost: ${truck_cost}/unit (after fuel ×{fuel_index})
- Lead time: {truck_lead} days
- Spoilage penalty: none

INTERMODAL:
- Cost: ${inter_cost}/unit (after fuel ×{fuel_index})
- Lead time: {inter_lead} days
- Spoilage penalty: +${penalty}/unit
- Total score: ${inter_total}/unit
- Available: {inter_available}
{inter_notes}

RISK FLAGS: {risk_flags}

MATH RECOMMENDS: {math_rec}

Your job: validate or challenge the math recommendation. Consider:
1. Is the intermodal lead time actually safe given days until stockout?
2. Does the trend suggest demand will accelerate, requiring faster shipping?
3. Are there risk flags that change the calculus?

Respond ONLY with JSON:
{{"recommended": "<truck|intermodal>", "confidence": <0-100>, "reasoning": "<2 sentences explaining your transport recommendation and why>"}}"""


class TransportAgent:
    name = "TransportAgent"

    async def run(
        self,
        truck_cost_per_unit: float,
        intermodal_cost_per_unit: float,
        fuel_cost_index: float,
        inventory: InventoryResult,
        forecast: ForecastResult,
        lead_time_truck: int = 2,
        lead_time_intermodal: int = 5,
    ) -> TransportResult:

        # Step 1: Deterministic math
        result = run_transport(
            truck_cost_per_unit=truck_cost_per_unit,
            intermodal_cost_per_unit=intermodal_cost_per_unit,
            fuel_cost_index=fuel_cost_index,
            inventory=inventory,
            forecast=forecast,
            lead_time_truck=lead_time_truck,
            lead_time_intermodal=lead_time_intermodal,
        )

        # Step 2: LLM validates / challenges the math
        prompt = TRANSPORT_PROMPT.format(
            usable=inventory.usable_inventory,
            days_stockout=inventory.days_until_stockout,
            spoilage_risk=inventory.spoilage_risk,
            expiring=inventory.expiring_units,
            trend=forecast.trend,
            daily=forecast.predicted_demand,
            truck_cost=result.truck.cost_per_unit,
            truck_lead=lead_time_truck,
            inter_cost=result.intermodal.cost_per_unit,
            inter_lead=lead_time_intermodal,
            penalty=result.intermodal.spoilage_penalty,
            inter_total=result.intermodal.total_score,
            inter_available=result.intermodal.available,
            inter_notes=f"Note: {result.intermodal.notes}" if result.intermodal.notes else "",
            risk_flags=", ".join(result.risk_flags) if result.risk_flags else "None",
            fuel_index=fuel_cost_index,
            math_rec=result.recommended,
        )

        raw = await reason(prompt, expect_json=True)
        llm = None
        try:
            llm = json.loads(raw)
        except Exception:
            pass

        if llm:
            llm_rec    = str(llm.get("recommended", result.recommended))
            llm_reason = str(llm.get("reasoning", ""))

            # Safety override: never choose intermodal if it arrives after stockout
            if not result.intermodal.available and llm_rec == "intermodal":
                llm_rec = "truck"
                llm_reason = f"[Override] {llm_reason} — intermodal overridden: arrives after stockout."

            result.recommended = llm_rec
            result.reasoning   = llm_reason

        return result
