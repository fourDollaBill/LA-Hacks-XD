"""
llm/ollama_client.py
Handles all communication with the local Ollama LLM.
"""
import httpx
from models.responses import RunResult

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3"


def build_prompt(result: RunResult) -> str:
    d  = result.decision
    f  = result.forecast
    iv = result.inventory
    tr = result.transport

    return f"""You are a supply chain advisor. Explain this recommendation in 2-3 clear sentences for a business manager. Be direct and confident.

Scenario: {result.scenario}
Decision: {d.action}
Order quantity: {d.order_quantity} units
Transport method: {d.transport_method}
Total cost score: ${d.total_cost_score}

Key data:
- Predicted daily demand: {f.predicted_demand} units (trend: {f.trend})
- Usable inventory: {iv.usable_inventory} units ({iv.days_until_stockout} days until stockout)
- Spoilage risk: {iv.spoilage_risk} ({iv.expiring_units} units expiring soon)
- Stockout risk: {iv.stockout_risk}
- Truck score: ${tr.truck.total_score}/unit vs Intermodal: ${tr.intermodal.total_score}/unit (incl. spoilage penalty)
- Fuel index: x{tr.fuel_index}

Give a confident, jargon-free business explanation. No bullet points. 2-3 sentences only."""


async def get_explanation(result: RunResult) -> str:
    prompt = build_prompt(result)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(OLLAMA_URL, json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
            })
            resp.raise_for_status()
            return resp.json().get("response", "").strip()
    except httpx.ConnectError:
        return "LLM unavailable — run `ollama serve` then `ollama pull llama3` to enable explanations."
    except Exception as e:
        return f"LLM error: {str(e)}"
