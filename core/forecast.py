"""
core/forecast.py
Pure business logic for demand forecasting.
No agent framework — called by ForecastAgent and the Agentverse agent.
"""
from models.responses import ForecastResult


def run_forecast(last_7_days: list[int]) -> ForecastResult:
    """
    Weighted moving average forecast.
    More recent days carry higher weight.
    """
    n = len(last_7_days)
    weights = list(range(1, n + 1))
    weighted_sum = sum(d * w for d, w in zip(last_7_days, weights))
    predicted_demand = round(weighted_sum / sum(weights))

    recent_avg = sum(last_7_days[-3:]) / 3
    older_avg = sum(last_7_days[:3]) / 3

    if recent_avg > older_avg * 1.1:
        trend = "rising"
    elif recent_avg < older_avg * 0.9:
        trend = "falling"
    else:
        trend = "stable"

    return ForecastResult(
        predicted_demand=predicted_demand,
        forecast_3_days=predicted_demand * 3,
        trend=trend,
        confidence="high" if n >= 7 else "medium",
        history=last_7_days,
    )
