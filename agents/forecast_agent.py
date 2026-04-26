"""
agents/forecast_agent.py
ForecastAgent — uses the LLM to reason about demand trends,
then validates/adjusts with deterministic math as a safety net.
"""
import json
from core.forecast import run_forecast
from llm.ollama_client import reason
from models.responses import ForecastResult


FORECAST_PROMPT = """You are a demand forecasting agent for a perishable goods supply chain.

Analyze this 7-day demand history and provide a forecast:
{history}

Day labels (oldest to newest): Day 1 through Day 7.

Your job:
1. Identify the demand trend (rising / stable / falling) and explain why
2. Predict tomorrow's demand in units
3. Predict total demand for the next 3 days
4. Assess your confidence (high / medium / low) based on how consistent the data is

Respond ONLY with this JSON structure:
{{
  "predicted_demand": <integer units/day>,
  "forecast_3_days": <integer total units>,
  "trend": "<rising|stable|falling>",
  "confidence": "<high|medium|low>",
  "reasoning": "<1-2 sentences explaining the trend and your prediction>"
}}"""


class ForecastAgent:
    name = "ForecastAgent"

    async def run(self, last_7_days: list[int]) -> ForecastResult:
        # --- Step 1: LLM reasons about the demand data ---
        prompt = FORECAST_PROMPT.format(history=last_7_days)
        raw = await reason(prompt, expect_json=True)

        llm_result = None
        try:
            llm_result = json.loads(raw)
        except Exception:
            pass

        # --- Step 2: Deterministic fallback (always runs as safety net) ---
        deterministic = run_forecast(last_7_days)

        # --- Step 3: Merge — trust LLM for reasoning fields, math for numbers ---
        if llm_result:
            # Sanity check LLM numbers — if wildly off, fall back to math
            llm_demand = int(llm_result.get("predicted_demand", 0))
            det_demand = deterministic.predicted_demand
            # Allow LLM to deviate up to 25% from deterministic calc
            if abs(llm_demand - det_demand) / max(det_demand, 1) <= 0.25:
                predicted = llm_demand
            else:
                predicted = det_demand

            return ForecastResult(
                predicted_demand=predicted,
                forecast_3_days=int(llm_result.get("forecast_3_days", predicted * 3)),
                trend=llm_result.get("trend", deterministic.trend),
                confidence=llm_result.get("confidence", deterministic.confidence),
                history=last_7_days,
                reasoning=llm_result.get("reasoning", ""),
            )

        # Full fallback to deterministic
        return ForecastResult(
            **deterministic.model_dump(),
            reasoning="Deterministic weighted moving average (LLM unavailable).",
        )
