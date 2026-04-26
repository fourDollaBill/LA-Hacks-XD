"""
main.py
FastAPI entry point. All routes use agents/ and core/ for logic.
"""
import sys
from pathlib import Path

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from agents.orchestrator_agent import OrchestratorAgent, list_scenarios
from llm.ollama_client import get_explanation
from models.requests import ScenarioRunRequest, CustomRunRequest
from models.responses import RunResult
from core.forecast import run_forecast
from core.inventory import run_inventory
from core.transport import run_transport
from core.decision import run_decision

app = FastAPI(title="SupplyMind API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = OrchestratorAgent()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/scenarios")
def get_scenarios():
    """Return all available scenarios for the frontend scenario selector."""
    return {"scenarios": list_scenarios()}


@app.post("/run", response_model=RunResult)
async def run_scenario(req: ScenarioRunRequest):
    """Run a named scenario end-to-end through all agents."""
    try:
        result, _ = orchestrator.run(req.scenario_name, req.overrides)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result.llm_explanation = await get_explanation(result)
    return result


@app.post("/run/custom", response_model=RunResult)
async def run_custom(req: CustomRunRequest):
    """Run a fully custom scenario with user-provided parameters."""
    forecast = run_forecast(req.demand.last_7_days)

    inventory = run_inventory(
        total_units=req.inventory.total_units,
        expiring_soon=req.inventory.expiring_soon,
        lead_time_truck=req.inventory.lead_time_truck,
        lead_time_intermodal=req.inventory.lead_time_intermodal,
        forecast=forecast,
    )

    transport = run_transport(
        truck_cost_per_unit=req.transport.truck_cost_per_unit,
        intermodal_cost_per_unit=req.transport.intermodal_cost_per_unit,
        fuel_cost_index=req.transport.fuel_cost_index,
        inventory=inventory,
        forecast=forecast,
    )

    decision = run_decision(
        reorder_threshold=req.inventory.reorder_threshold,
        order_max=req.inventory.order_max,
        forecast=forecast,
        inventory=inventory,
        transport=transport,
    )

    result = RunResult(
        scenario="Custom",
        forecast=forecast,
        inventory=inventory,
        transport=transport,
        decision=decision,
    )

    result.llm_explanation = await get_explanation(result)
    return result
