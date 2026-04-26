"""
llm/ollama_client.py
Upgraded LLM client — structured JSON reasoning, auto model detection,
retry logic, and a general-purpose reason() call used by agents.
"""
import json
import re
import httpx
from models.responses import RunResult

OLLAMA_BASE = "http://localhost:11434"
OLLAMA_URL  = f"{OLLAMA_BASE}/api/generate"
OLLAMA_TAGS = f"{OLLAMA_BASE}/api/tags"

PREFERRED_MODELS = [
    "deepseek-r1:70b", "deepseek-r1:8b", "deepseek-r1",
    "llama3.1:70b", "llama3.1:8b", "llama3.1",
    "llama3:latest", "llama3", "mistral", "gemma2",
]

_cached_model: str | None = None


async def get_model() -> str | None:
    global _cached_model
    if _cached_model:
        return _cached_model
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(OLLAMA_TAGS)
            resp.raise_for_status()
            installed = [m["name"] for m in resp.json().get("models", [])]
            for pref in PREFERRED_MODELS:
                for inst in installed:
                    if inst.startswith(pref.split(":")[0]):
                        _cached_model = inst
                        return inst
            if installed:
                _cached_model = installed[0]
                return installed[0]
    except Exception:
        pass
    return None


async def reason(prompt: str, expect_json: bool = False, retries: int = 2) -> str:
    """
    Core reasoning call. If expect_json=True, strips markdown fences
    and returns clean JSON string. Retries on failure.
    """
    model = await get_model()
    if not model:
        return "{}" if expect_json else "LLM unavailable — run: ollama serve"

    system = (
        "You are a supply chain AI agent. "
        + ("Respond ONLY with valid JSON, no markdown, no explanation outside the JSON." if expect_json
           else "Be concise, direct, and data-driven.")
    )

    full_prompt = f"{system}\n\n{prompt}"

    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.post(OLLAMA_URL, json={
                    "model":  model,
                    "prompt": full_prompt,
                    "stream": False,
                    "options": {"temperature": 0.2},
                })
                resp.raise_for_status()
                text = resp.json().get("response", "").strip()

                if expect_json:
                    # Strip markdown fences if present
                    text = re.sub(r"```json\s*", "", text)
                    text = re.sub(r"```\s*", "", text)
                    # Extract first JSON object
                    match = re.search(r'\{.*\}', text, re.DOTALL)
                    if match:
                        return match.group(0)
                    return text

                return text

        except httpx.ConnectError:
            return "{}" if expect_json else "LLM unavailable — run: ollama serve"
        except Exception as e:
            if attempt == retries:
                return "{}" if expect_json else f"LLM error: {str(e)}"
            continue

    return "{}" if expect_json else "LLM error: max retries exceeded"


async def get_explanation(result: RunResult) -> str:
    """Final human-readable explanation — includes savings and USE THIS label."""
    truck_score = result.transport.truck.total_score
    inter_score = result.transport.intermodal.total_score
    savings     = round(abs(truck_score - inter_score), 2)
    cheaper     = "truck" if truck_score <= inter_score else "intermodal"
    recommended = result.decision.transport_method

    prompt = (
        "You are a supply chain advisor giving a final recommendation to a manager.\n\n"
        f"Scenario: {result.scenario}\n"
        f"Decision: {result.decision.action}\n"
        f"Order quantity: {result.decision.order_quantity} units\n"
        f"USE THIS transport: {recommended}\n"
        f"Savings: ${savings}/unit by choosing {cheaper} over the alternative\n"
        f"Forecast: {result.forecast.predicted_demand} units/day, trend={result.forecast.trend}\n"
        f"Inventory: {result.inventory.usable_inventory} usable units, {result.inventory.days_until_stockout} days to stockout\n"
        f"Spoilage risk: {result.inventory.spoilage_risk}, Stockout risk: {result.inventory.stockout_risk}\n"
        f"Truck: ${truck_score}/unit (2-day) vs Intermodal: ${inter_score}/unit (5-day incl. spoilage penalty)\n"
        f"Fuel index: {result.transport.fuel_index}\n"
        f"Total cost score: ${result.decision.total_cost_score}\n\n"
        "Write exactly 3 sentences:\n"
        "1. What the decision is and which transport to USE (say 'Use [method]' explicitly)\n"
        "2. Why this transport saves money or reduces risk vs the alternative (include the savings figure)\n"
        "3. The key risk factor that drove this decision\n\n"
        "Be confident and specific. No bullet points."
    )

    return await reason(prompt, expect_json=False)
