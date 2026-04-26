"""
llm/ollama_client.py
Handles communication with the local Ollama LLM.
Auto-detects which model is available so you don't get 404s.
"""
import httpx
from models.responses import RunResult

OLLAMA_BASE  = "http://localhost:11434"
OLLAMA_URL   = f"{OLLAMA_BASE}/api/generate"
OLLAMA_TAGS  = f"{OLLAMA_BASE}/api/tags"

# Preference order — first one found wins
PREFERRED_MODELS = [
    "deepseek-r1:70b",
    "deepseek-r1:8b",
    "deepseek-r1",
    "llama3.1:70b",
    "llama3.1:8b",
    "llama3.1",
    "llama3:latest",
    "llama3",
    "mistral",
    "gemma2",
]


async def get_available_model() -> str | None:
    """Ask Ollama which models are installed and pick the best one."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(OLLAMA_TAGS)
            resp.raise_for_status()
            installed = [m["name"] for m in resp.json().get("models", [])]
            # Try preferred order first
            for pref in PREFERRED_MODELS:
                for inst in installed:
                    if inst.startswith(pref.split(":")[0]):
                        return inst
            # Fall back to whatever is first
            return installed[0] if installed else None
    except Exception:
        return None


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
- Predicted daily demand: {f.predicted_demand} units/day (trend: {f.trend})
- Usable inventory: {iv.usable_inventory} units ({iv.days_until_stockout} days until stockout)
- Spoilage risk: {iv.spoilage_risk} ({iv.expiring_units} units expiring soon)
- Stockout risk: {iv.stockout_risk}
- Truck: ${tr.truck.total_score}/unit vs Intermodal: ${tr.intermodal.total_score}/unit
- Fuel index: x{tr.fuel_index}

Give a confident, jargon-free business explanation. No bullet points. 2-3 sentences only."""


async def get_explanation(result: RunResult) -> str:
    model = await get_available_model()

    if not model:
        return (
            "LLM unavailable — Ollama is not running or no models are installed. "
            "Run: ollama serve && ollama pull deepseek-r1:8b"
        )

    prompt = build_prompt(result)
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(OLLAMA_URL, json={
                "model": model,
                "prompt": prompt,
                "stream": False,
            })
            resp.raise_for_status()
            return resp.json().get("response", "").strip()
    except httpx.ConnectError:
        return "LLM unavailable — run `ollama serve` to start Ollama."
    except httpx.HTTPStatusError as e:
        return f"LLM error {e.response.status_code} — model '{model}' may not be fully downloaded. Try: ollama pull {model}"
    except Exception as e:
        return f"LLM error: {str(e)}"
