"""
agents/decision_agent.py
DecisionAgent — LLM weighs all inputs, reasons to a final decision
with a confidence score.
"""
import json
from core.decision import run_decision
from llm.ollama_client import reason
from models.responses import ForecastResult, InventoryResult, TransportResult, DecisionResult, CostBreakdown


DECISION_PROMPT = """You are the final decision-making agent in a supply chain AI system for perishable goods.

You have received inputs from all specialist agents:

DEMAND FORECAST (AI-reasoned):
- Predicted daily demand: {predicted_demand} units/day
- Trend: {trend} | 3-day forecast: {forecast_3d} units
- Confidence: {confidence}
- Reasoning: {forecast_reasoning}

INVENTORY STATUS:
- Usable: {usable_inv} / {total_inv} units | Expiring: {expiring} units ({spoilage_pct}%)
- Days until stockout: {days_stockout} days
- Spoilage risk: {spoilage_risk} | Stockout risk: {stockout_risk}

TRANSPORT OPTIONS (AI-validated):
- Truck: ${truck_score}/unit, {truck_lead}-day lead time
- Intermodal: ${inter_score}/unit, {inter_lead}-day lead time, penalty +${inter_penalty}, available: {inter_available}
- Fuel index: x{fuel_index}
- Risk flags: {risk_flags}
- Transport reasoning: {transport_reasoning}
- Transport recommends: {algo_rec}

CONSTRAINTS: reorder threshold={threshold}, max order={order_max}

YOUR TASK: Decide whether to reorder, how much, and which transport.
Minimize: total cost = transport + stockout risk + spoilage risk.
Give confidence 0-100: how clear-cut is this decision?
- 90+: obvious, all signals agree
- 70-89: clear but one factor is borderline
- 50-69: some tension between cost and risk
- below 50: genuinely uncertain, flag it

Respond ONLY with JSON:
{{
  "should_reorder": <true|false>,
  "order_quantity": <integer>,
  "confidence_score": <0-100>,
  "transport_method": "<truck|intermodal|truck (forced — critical stockout)|n/a>",
  "action": "<REORDER NOW|HOLD — sufficient stock>",
  "reasoning": "<2-3 sentences explaining the decision, why this transport, and what drove your confidence score>"
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

        # Deterministic baseline
        deterministic = run_decision(
            reorder_threshold=reorder_threshold,
            order_max=order_max,
            forecast=forecast,
            inventory=inventory,
            transport=transport,
        )

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
            truck_lead=transport.truck.lead_time_days,
            inter_score=transport.intermodal.total_score,
            inter_lead=transport.intermodal.lead_time_days,
            inter_penalty=transport.intermodal.spoilage_penalty,
            inter_available=transport.intermodal.available,
            fuel_index=transport.fuel_index,
            risk_flags=", ".join(transport.risk_flags) if transport.risk_flags else "None",
            transport_reasoning=transport.reasoning or "N/A",
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

        if llm_result:
            should_reorder = bool(llm_result.get("should_reorder", deterministic.should_reorder))
            order_qty      = int(llm_result.get("order_quantity", deterministic.order_quantity))
            transport_method = str(llm_result.get("transport_method", deterministic.transport_method))
            action         = str(llm_result.get("action", deterministic.action))
            dec_reasoning  = str(llm_result.get("reasoning", ""))
            confidence     = int(llm_result.get("confidence_score", 75))
            confidence     = max(0, min(confidence, 100))

            # Safety overrides
            if inventory.stockout_risk == "critical":
                should_reorder = True
                if transport_method == "intermodal":
                    transport_method = "truck (forced — critical stockout)"
                    confidence = min(confidence, 70)  # lower confidence on forced override

            if not transport.intermodal.available and transport_method == "intermodal":
                transport_method = "truck (forced — intermodal unavailable)"

            if should_reorder:
                order_qty = max(1, min(order_qty, order_max))
            else:
                order_qty = 0

            chosen       = transport.truck if "truck" in transport_method else transport.intermodal
            t_cost       = round(chosen.total_score * order_qty, 2) if order_qty > 0 else 0.0
            s_cost       = round({"low":0,"moderate":1.5,"high":4.0,"critical":8.0}[inventory.stockout_risk] * forecast.predicted_demand, 2)
            p_cost       = round({"low":0,"moderate":0.5,"high":2.0,"critical":5.0}[inventory.spoilage_risk] * inventory.expiring_units, 2)
            total_cost   = round(t_cost + s_cost + p_cost, 2)

            return DecisionResult(
                action=action,
                should_reorder=should_reorder,
                order_quantity=order_qty,
                transport_method=transport_method,
                total_cost_score=total_cost,
                confidence_score=confidence,
                reasoning=CostBreakdown(
                    transport_cost=t_cost,
                    stockout_risk_cost=s_cost,
                    spoilage_risk_cost=p_cost,
                ),
                decision_reasoning=dec_reasoning,
            )

        return DecisionResult(
            **{k: v for k, v in deterministic.model_dump().items() if k != "confidence_score"},
            confidence_score=70,
            decision_reasoning="Deterministic decision (LLM unavailable).",
        )
