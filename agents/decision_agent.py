"""
agents/decision_agent.py
DecisionAgent — LLM weighs all inputs and reasons to a final decision.
Deterministic logic runs in parallel as a safety net and override for
clearly wrong LLM outputs.
"""
import json
from core.decision import run_decision
from llm.ollama_client import reason
from models.responses import ForecastResult, InventoryResult, TransportResult, DecisionResult, CostBreakdown


DECISION_PROMPT = """You are the final decision-making agent in a supply chain AI system for perishable goods.

You have received the following inputs from specialist agents:

DEMAND FORECAST:
- Predicted daily demand: {predicted_demand} units/day
- Trend: {trend}
- 3-day forecast: {forecast_3d} units
- Confidence: {confidence}
- Forecast reasoning: {forecast_reasoning}

INVENTORY STATUS:
- Total inventory: {total_inv} units
- Usable inventory: {usable_inv} units
- Expiring soon: {expiring} units ({spoilage_pct}% of stock)
- Days until stockout: {days_stockout} days
- Spoilage risk: {spoilage_risk}
- Stockout risk: {stockout_risk}

TRANSPORT OPTIONS:
- Truck: ${truck_score}/unit, 2-day lead time
- Intermodal: ${inter_score}/unit, 5-day lead time (includes ${inter_penalty} spoilage penalty)
- Fuel index: x{fuel_index}
- Algorithm recommends: {algo_rec}

CONSTRAINTS:
- Reorder threshold: {threshold} units
- Maximum order: {order_max} units

YOUR TASK:
Reason through whether to reorder, how much, and which transport method minimizes:
  total cost = transport cost + stockout risk + spoilage risk

Respond ONLY with this JSON:
{{
  "should_reorder": <true|false>,
  "order_quantity": <integer>,
  "transport_method": "<truck|intermodal|truck (forced — critical stockout)|n/a>",
  "action": "<REORDER NOW|HOLD — sufficient stock>",
  "reasoning": "<2-3 sentences explaining your decision and why you chose this transport method>"
}}"""


class DecisionAgent:
    name = "DecisionAgent"

    async def run(
        self,
        reorder_threshold: int,
        order_max: int,
        forecast: ForecastResult,
        inventory: InventoryResult,
        transport: TransportResult,
    ) -> DecisionResult:

        # --- Step 1: Deterministic baseline (always safe) ---
        deterministic = run_decision(
            reorder_threshold=reorder_threshold,
            order_max=order_max,
            forecast=forecast,
            inventory=inventory,
            transport=transport,
        )

        # --- Step 2: LLM reasons through the full picture ---
        prompt = DECISION_PROMPT.format(
            predicted_demand=forecast.predicted_demand,
            trend=forecast.trend,
            forecast_3d=forecast.forecast_3_days,
            confidence=forecast.confidence,
            forecast_reasoning=getattr(forecast, "reasoning", "N/A"),
            total_inv=inventory.total_inventory,
            usable_inv=inventory.usable_inventory,
            expiring=inventory.expiring_units,
            spoilage_pct=inventory.spoilage_percent,
            days_stockout=inventory.days_until_stockout,
            spoilage_risk=inventory.spoilage_risk,
            stockout_risk=inventory.stockout_risk,
            truck_score=transport.truck.total_score,
            inter_score=transport.intermodal.total_score,
            inter_penalty=transport.intermodal.spoilage_penalty,
            fuel_index=transport.fuel_index,
            algo_rec=transport.recommended,
            threshold=reorder_threshold,
            order_max=order_max,
        )

        raw = await reason(prompt, expect_json=True)
        llm_result = None
        try:
            llm_result = json.loads(raw)
        except Exception:
            pass

        # --- Step 3: Merge LLM + deterministic with safety overrides ---
        if llm_result:
            should_reorder = bool(llm_result.get("should_reorder", deterministic.should_reorder))
            order_qty = int(llm_result.get("order_quantity", deterministic.order_quantity))
            transport_method = str(llm_result.get("transport_method", deterministic.transport_method))
            action = str(llm_result.get("action", deterministic.action))
            decision_reasoning = str(llm_result.get("reasoning", ""))

            # Safety override: if stockout is critical, force reorder
            if inventory.stockout_risk == "critical":
                should_reorder = True
                if transport_method == "intermodal":
                    transport_method = "truck (forced — critical stockout)"

            # Safety override: clamp order qty to valid range
            if should_reorder:
                order_qty = max(1, min(order_qty, order_max))
            else:
                order_qty = 0

            # Recalculate cost breakdown with final values
            chosen = transport.truck if "truck" in transport_method else transport.intermodal
            transport_cost = round(chosen.total_score * order_qty, 2) if order_qty > 0 else 0.0
            stockout_cost  = round({"low":0,"moderate":1.5,"high":4.0,"critical":8.0}[inventory.stockout_risk] * forecast.predicted_demand, 2)
            spoilage_cost  = round({"low":0,"moderate":0.5,"high":2.0,"critical":5.0}[inventory.spoilage_risk] * inventory.expiring_units, 2)
            total_cost     = round(transport_cost + stockout_cost + spoilage_cost, 2)

            return DecisionResult(
                action=action,
                should_reorder=should_reorder,
                order_quantity=order_qty,
                transport_method=transport_method,
                total_cost_score=total_cost,
                reasoning=CostBreakdown(
                    transport_cost=transport_cost,
                    stockout_risk_cost=stockout_cost,
                    spoilage_risk_cost=spoilage_cost,
                ),
                decision_reasoning=decision_reasoning,
            )

        # Full fallback
        return DecisionResult(
            **deterministic.model_dump(),
            decision_reasoning="Deterministic decision (LLM unavailable).",
        )
