"""
main.py — SupplyMind FastAPI backend
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from agents.orchestrator_agent import OrchestratorAgent, list_scenarios
from llm.ollama_client         import get_explanation
from models.requests           import ScenarioRunRequest, CustomRunRequest
from models.responses          import RunResult
from core.forecast             import run_forecast
from core.inventory            import run_inventory
from core.transport            import run_transport
from agents.decision_agent     import DecisionAgent

app = FastAPI(title="SupplyMind API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = OrchestratorAgent()


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/scenarios")
def get_scenarios():
    return {"scenarios": list_scenarios()}


@app.post("/run", response_model=RunResult)
async def run_scenario(req: ScenarioRunRequest):
    try:
        result, _ = await orchestrator.run(req.scenario_name, req.overrides)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result


@app.post("/run/custom", response_model=RunResult)
async def run_custom(req: CustomRunRequest):
    decision_agent = DecisionAgent()

    forecast  = run_forecast(req.demand.last_7_days)
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
    decision = await decision_agent.run(
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
