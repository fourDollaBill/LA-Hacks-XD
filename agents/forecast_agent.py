"""
agents/forecast_agent.py
Thin agent wrapper around core/forecast.py.
"""
from core.forecast import run_forecast
from models.responses import ForecastResult


class ForecastAgent:
    name = "ForecastAgent"

    def run(self, last_7_days: list[int]) -> ForecastResult:
        return run_forecast(last_7_days)
