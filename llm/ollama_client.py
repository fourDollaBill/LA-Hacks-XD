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
    """Final human-readable explanation of a RunResult."""
    prompt = f"""You are a supply chain advisor. A manager needs a clear 2-3 sentence explanation of this decision.

Scenario: {result.scenario}
Decision: {result.decision.action}
Order quantity: {result.decision.order_quantity} units
Transport: {result.decision.transport_method}
Forecast: {result.forecast.predicted_demand} units/day, trend is {result.forecast.trend}
Inventory: {result.inventory.usable_inventory} usable units, {result.inventory.days_until_stockout} days until stockout
Spoilage risk: {result.inventory.spoilage_risk}, Stockout risk: {result.inventory.stockout_risk}
Truck cost: ${result.transport.truck.total_score}/unit vs Intermodal: ${result.transport.intermodal.total_score}/unit (incl. spoilage penalty)
Fuel index: ×{result.transport.fuel_index}
Reasoning: transport cost ${result.decision.reasoning.transport_cost}, stockout penalty ${result.decision.reasoning.stockout_risk_cost}, spoilage penalty ${result.decision.reasoning.spoilage_risk_cost}

Write 2-3 confident, jargon-free sentences explaining WHY this decision was made. No bullet points."""

    return await reason(prompt, expect_json=False)
