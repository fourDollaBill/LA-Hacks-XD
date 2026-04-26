"""
agentverse/supply_chain_agent_hosted.py
=========================================
SupplyMind — Agentverse Hosted Version

Paste directly into Agentverse code editor.
All logic is self-contained — no local imports needed.

https://agentverse.ai → My Agents → New Agent → Blank Agent → Paste → Run
"""

import re
import json
import httpx
from datetime import datetime
from uuid import uuid4

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

# Hosted agents: NO parameters
agent = Agent()

# ── Embedded scenario data ────────────────────────────────────────────────────

SCENARIOS = {
    "normal":      {"label":"Normal Operations",  "inv":500, "exp":50,  "demand":[80,85,78,90,88,82,86], "fuel":1.0, "threshold":200, "order_max":400},
    "high_demand": {"label":"Demand Spike",        "inv":300, "exp":40,  "demand":[80,95,130,160,175,180,190], "fuel":1.0, "threshold":200, "order_max":600},
    "high_fuel":   {"label":"Fuel Price Surge",    "inv":450, "exp":30,  "demand":[80,82,79,84,83,81,85], "fuel":2.1, "threshold":200, "order_max":400},
    "expiry_risk": {"label":"Expiry Crisis",       "inv":420, "exp":280, "demand":[80,82,79,84,83,81,85], "fuel":1.0, "threshold":200, "order_max":400},
    "low_stock":   {"label":"Critical Stock",      "inv":120, "exp":10,  "demand":[80,88,95,102,108,115,120], "fuel":1.0, "threshold":200, "order_max":500},
}

OLLAMA_URL = "http://localhost:11434/api/generate"

# ── LLM reasoning ─────────────────────────────────────────────────────────────

async def llm_reason(prompt: str, expect_json: bool = False) -> str:
    """Call local Ollama for reasoning. Falls back gracefully."""
    system = (
        "You are a supply chain AI agent. Respond ONLY with valid JSON, no markdown."
        if expect_json else
        "You are a supply chain advisor. Be concise and data-driven."
    )
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # Auto-detect model
            tags = await client.get("http://localhost:11434/api/tags")
            models = [m["name"] for m in tags.json().get("models", [])]
            model = next(
                (m for pref in ["deepseek-r1","llama3.1","llama3","mistral"]
                 for m in models if m.startswith(pref)),
                models[0] if models else None
            )
            if not model:
                return "{}" if expect_json else ""

            resp = await client.post(OLLAMA_URL, json={
                "model": model,
                "prompt": f"{system}\n\n{prompt}",
                "stream": False,
                "options": {"temperature": 0.2},
            })
            text = resp.json().get("response", "").strip()
            if expect_json:
                text = re.sub(r"```json\s*|```\s*", "", text)
                m = re.search(r'\{.*\}', text, re.DOTALL)
                return m.group(0) if m else "{}"
            return text
    except Exception:
        return "{}" if expect_json else ""

# ── Core agent logic ──────────────────────────────────────────────────────────

async def run_forecast_agent(demand: list[int]) -> dict:
    """ForecastAgent: LLM reasons about demand, math as safety net."""
    n = len(demand)
    weights = list(range(1, n + 1))
    det_demand = round(sum(d * w for d, w in zip(demand, weights)) / sum(weights))
    recent = sum(demand[-3:]) / 3
    older  = sum(demand[:3])  / 3
    det_trend = "rising" if recent > older * 1.1 else ("falling" if recent < older * 0.9 else "stable")

    prompt = f"""Analyze this 7-day demand history: {demand}
Predict tomorrow's demand and the 3-day total. Identify the trend.

Respond ONLY with JSON:
{{"predicted_demand": <int>, "forecast_3_days": <int>, "trend": "<rising|stable|falling>", "confidence": "<high|medium|low>", "reasoning": "<1 sentence>"}}"""

    raw = await llm_reason(prompt, expect_json=True)
    try:
        llm = json.loads(raw)
        llm_demand = int(llm.get("predicted_demand", det_demand))
        # Sanity check
        final_demand = llm_demand if abs(llm_demand - det_demand) / max(det_demand, 1) <= 0.25 else det_demand
        return {
            "predicted_demand": final_demand,
            "forecast_3_days": int(llm.get("forecast_3_days", final_demand * 3)),
            "trend": llm.get("trend", det_trend),
            "confidence": llm.get("confidence", "high"),
            "reasoning": llm.get("reasoning", ""),
            "history": demand,
        }
    except Exception:
        return {"predicted_demand": det_demand, "forecast_3_days": det_demand*3, "trend": det_trend, "confidence": "high", "reasoning": "", "history": demand}


def run_inventory_agent(inv: int, exp: int, lt_truck: int, lt_inter: int, forecast: dict) -> dict:
    """InventoryAgent: deterministic."""
    daily  = forecast["predicted_demand"]
    usable = max(inv - exp, 0)
    days   = round(usable / daily, 1) if daily > 0 else 999.0
    ratio  = exp / inv if inv > 0 else 0
    spoi   = "critical" if ratio > 0.5 else ("high" if ratio > 0.2 else ("moderate" if ratio > 0.05 else "low"))
    stock  = "critical" if days <= lt_truck else ("high" if days <= lt_inter else ("moderate" if days <= lt_inter+2 else "low"))
    return {"total": inv, "expiring": exp, "usable": usable, "days_until_stockout": days,
            "spoilage_risk": spoi, "stockout_risk": stock, "spoilage_pct": round((exp/inv)*100,1) if inv>0 else 0}


def run_transport_agent(truck_cpu: float, inter_cpu: float, fuel: float, inventory: dict, forecast: dict) -> dict:
    """TransportAgent: deterministic."""
    tc = round(truck_cpu * fuel, 2)
    ic = round(inter_cpu * fuel, 2)
    rates = {"low":0.01,"moderate":0.05,"high":0.12,"critical":0.25}
    penalty = round(3 * inventory["usable"] * rates.get(inventory["spoilage_risk"],0.05) * 3.0 / max(forecast["predicted_demand"],1), 2)
    it = round(ic + penalty, 2)
    return {"truck_score": tc, "inter_score": it, "inter_penalty": penalty, "recommended": "truck" if tc <= it else "intermodal", "fuel_index": fuel}


async def run_decision_agent(threshold: int, order_max: int, forecast: dict, inventory: dict, transport: dict) -> dict:
    """DecisionAgent: LLM reasons, deterministic as safety net."""
    # Deterministic baseline
    daily = forecast["predicted_demand"]
    usable = inventory["usable"]
    det_reorder = (usable <= threshold or inventory["stockout_risk"] in ("high","critical") or inventory["spoilage_risk"] in ("high","critical"))
    safety = 3 if forecast["trend"] == "rising" else 2
    det_qty = max(0, min(round((daily*(7+safety))-usable), order_max)) if det_reorder else 0
    det_method = transport["recommended"] if det_reorder else "n/a"
    if inventory["stockout_risk"] == "critical" and det_method == "intermodal":
        det_method = "truck (forced — critical stockout)"

    prompt = f"""You are the final decision-making agent in a supply chain AI system.

FORECAST (AI-reasoned): {forecast["predicted_demand"]} units/day, trend={forecast["trend"]}, reasoning="{forecast.get("reasoning","")}"
INVENTORY: {inventory["usable"]}/{inventory["total"]} usable, {inventory["expiring"]} expiring, {inventory["days_until_stockout"]}d to stockout, spoilage={inventory["spoilage_risk"]}, stockout={inventory["stockout_risk"]}
TRANSPORT: truck=${transport["truck_score"]}/unit (2d) vs intermodal=${transport["inter_score"]}/unit (5d, +${transport["inter_penalty"]} spoilage penalty), fuel=x{transport["fuel_index"]}
CONSTRAINTS: reorder threshold={threshold}, max order={order_max}

Decide: should we reorder? How much? Which transport minimizes total cost (transport + spoilage risk + stockout risk)?

Respond ONLY with JSON:
{{"should_reorder": <true|false>, "order_quantity": <int>, "transport_method": "<truck|intermodal|n/a>", "action": "<REORDER NOW|HOLD — sufficient stock>", "reasoning": "<2 sentences explaining your decision>"}}"""

    raw = await llm_reason(prompt, expect_json=True)
    try:
        llm = json.loads(raw)
        should = bool(llm.get("should_reorder", det_reorder))
        qty    = int(llm.get("order_quantity", det_qty))
        method = str(llm.get("transport_method", det_method))
        action = str(llm.get("action", "REORDER NOW" if should else "HOLD — sufficient stock"))
        dec_reasoning = str(llm.get("reasoning", ""))

        # Safety overrides
        if inventory["stockout_risk"] == "critical":
            should = True
            if method == "intermodal":
                method = "truck (forced — critical stockout)"
        if should:
            qty = max(1, min(qty, order_max))
        else:
            qty = 0

        chosen  = transport["truck_score"] if "truck" in method else transport["inter_score"]
        t_cost  = round(chosen * qty, 2)
        s_cost  = round({"low":0,"moderate":1.5,"high":4.0,"critical":8.0}[inventory["stockout_risk"]]*daily, 2)
        p_cost  = round({"low":0,"moderate":0.5,"high":2.0,"critical":5.0}[inventory["spoilage_risk"]]*inventory["expiring"], 2)
        return {"action":action, "should_reorder":should, "order_qty":qty, "transport":method,
                "total_cost":round(t_cost+s_cost+p_cost,2), "t_cost":t_cost, "s_cost":s_cost, "p_cost":p_cost, "reasoning":dec_reasoning}
    except Exception:
        chosen  = transport["truck_score"] if "truck" in det_method else transport["inter_score"]
        t_cost  = round(chosen * det_qty, 2)
        s_cost  = round({"low":0,"moderate":1.5,"high":4.0,"critical":8.0}[inventory["stockout_risk"]]*daily, 2)
        p_cost  = round({"low":0,"moderate":0.5,"high":2.0,"critical":5.0}[inventory["spoilage_risk"]]*inventory["expiring"], 2)
        return {"action":"REORDER NOW" if det_reorder else "HOLD","should_reorder":det_reorder,"order_qty":det_qty,"transport":det_method,
                "total_cost":round(t_cost+s_cost+p_cost,2),"t_cost":t_cost,"s_cost":s_cost,"p_cost":p_cost,"reasoning":""}


async def run_all(s: dict) -> dict:
    forecast  = await run_forecast_agent(s["demand"])
    inventory = run_inventory_agent(s["inv"], s["exp"], 2, 5, forecast)
    transport = run_transport_agent(s.get("truck_cpu",4.50), s.get("inter_cpu",2.80), s["fuel"], inventory, forecast)
    decision  = await run_decision_agent(s.get("threshold",200), s.get("order_max",600), forecast, inventory, transport)
    return {"forecast":forecast,"inventory":inventory,"transport":transport,"decision":decision}

# ── Formatters ────────────────────────────────────────────────────────────────

RISK = {"low":"🟢","moderate":"🟡","high":"🟠","critical":"🔴"}

def format_result(label: str, r: dict) -> str:
    f=r["forecast"]; iv=r["inventory"]; tr=r["transport"]; d=r["decision"]
    stockout=iv["days_until_stockout"]
    truck_od = max(0,round(stockout-2)); inter_od = max(0,round(stockout-5))
    truck_dl = "TODAY ⚠️" if truck_od==0 else f"in {truck_od}d"
    inter_dl = "OVERDUE ⚠️" if inter_od<=0 else ("TODAY ⚠️" if inter_od==0 else f"in {inter_od}d")

    lines = [
        f"## {'🔴' if d['should_reorder'] else '🟢'} SupplyMind — {label}",
        "",
        "### 📈 Demand Forecast *(AI-reasoned)*",
        f"- Daily: **{f['predicted_demand']} units/day** | Trend: **{f['trend']}** | Confidence: **{f['confidence']}**",
        f"- 3-day outlook: **{f['forecast_3_days']} units**",
    ]
    if f.get("reasoning"):
        lines.append(f"- 💭 *{f['reasoning']}*")
    lines += [
        "",
        "### 📦 Inventory",
        f"- Usable: **{iv['usable']} / {iv['total']} units** | Stockout in: **{stockout}d**",
        f"- Expiring: **{iv['expiring']} units** | Spoilage: {RISK.get(iv['spoilage_risk'],'⚪')} **{iv['spoilage_risk'].upper()}** | Stockout risk: {RISK.get(iv['stockout_risk'],'⚪')} **{iv['stockout_risk'].upper()}**",
        "",
        "### 🚚 Transport Options",
        f"| | 🚛 Truck | 🚂 Intermodal |",
        f"|--|---------|-------------|",
        f"| Cost/unit | **${tr['truck_score']:.2f}** | **${tr['inter_score']:.2f}** |",
        f"| Lead time | 2 days | 5 days |",
        f"| Order by | {truck_dl} | {inter_dl} |",
        f"| Spoilage penalty | — | +${tr['inter_penalty']:.2f} |",
        f"| **Recommended** | {'✅' if tr['recommended']=='truck' else '—'} | {'✅' if tr['recommended']=='intermodal' else '—'} |",
        f"",
        f"Fuel index: **×{tr['fuel_index']}** {'⚠️ elevated' if tr['fuel_index']>1.3 else '✅ normal'}",
        "",
        "### 🧠 Decision *(AI-reasoned)*",
        f"**{d['action']}**",
    ]
    if d["should_reorder"]:
        lines += [
            f"- Order **{d['order_qty']} units** via **{d['transport']}**",
            f"- Cost score: **${d['total_cost']:.2f}** (transport ${d['t_cost']} + stockout ${d['s_cost']} + spoilage ${d['p_cost']})",
        ]
    else:
        lines.append("- Stock sufficient. No reorder needed.")
    if d.get("reasoning"):
        lines += ["", f"💭 *{d['reasoning']}*"]
    lines += ["","---","💬 Try: `demand spike` | `fuel surge` | `expiry crisis` | `compare truck vs intermodal` | `help`"]
    return "\n".join(lines)


HELP_TEXT = """## 🏭 SupplyMind v2 — LLM-Powered Supply Chain Optimizer

**5 agents** — 2 use real LLM reasoning, 2 are deterministic, 1 orchestrates:

| Agent | Type | Role |
|-------|------|------|
| 📈 ForecastAgent | 🤖 LLM | Reasons about demand trends |
| 📦 InventoryAgent | 📐 Math | Calculates stock, expiry, stockout |
| 🚚 TransportAgent | 📐 Math | Compares truck vs intermodal costs |
| 🧠 DecisionAgent | 🤖 LLM | Weighs everything, makes final call |
| 🎯 Orchestrator | 🔗 Chain | Passes context between all agents |

**Try these:**
- `normal operations` — healthy baseline
- `demand spike` — rising demand scenario
- `fuel price surge` — fuel ×2.1
- `expiry crisis` — most inventory expiring
- `low stock` / `critical stock` — near stockout
- `compare truck vs intermodal` — deep dive
- Custom: *"300 units, 80 expiring, 120 units/day demand"*"""

COMPARE_TEXT = """## 🚛 vs 🚂 Truck vs Intermodal

| | Truck | Intermodal |
|--|-------|-----------|
| Lead time | 2 days | 5 days |
| Base cost | Higher | Lower |
| Spoilage penalty | None | Added for perishables |
| Best for | Urgent, high spoilage risk | Stable demand, low risk |

**SupplyMind's formula:**
`total score = transport cost + spoilage penalty + stockout risk penalty`

When fuel spikes → intermodal's cost advantage shrinks.
When inventory expires fast → spoilage penalty flips the decision to truck.

**Try:** `run expiry crisis` to see this in action."""

# ── Chat Protocol ─────────────────────────────────────────────────────────────

chat_proto = Protocol(spec=chat_protocol_spec)


@chat_proto.on_message(ChatMessage)
async def handle_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.utcnow(),
        acknowledged_msg_id=msg.msg_id,
    ))

    user_text = " ".join(item.text for item in msg.content if hasattr(item,"text")).strip()
    ctx.logger.info(f"[SupplyMind] '{user_text[:60]}'")

    t = user_text.lower()

    try:
        if not user_text or any(w in t for w in ["help","what can","options","capabilities"]):
            response = HELP_TEXT
        elif any(w in t for w in ["compare","vs","versus","truck or","intermodal or"]):
            response = COMPARE_TEXT
        else:
            scenario_map = {
                "normal":       ["normal","baseline","standard"],
                "high_demand":  ["high demand","demand spike","surge","spike"],
                "high_fuel":    ["fuel","gas price","fuel cost"],
                "expiry_risk":  ["expir","spoil","perishable","waste"],
                "low_stock":    ["low stock","critical","stockout","running low"],
            }
            scenario_key = None
            for key, kws in scenario_map.items():
                if any(k in t for k in kws):
                    scenario_key = key
                    break

            if scenario_key:
                s = SCENARIOS[scenario_key]
                result = await run_all(s)
                response = format_result(s["label"], result)
            else:
                inv_m  = re.search(r'(\d+)\s*(?:units?|inventory|stock)', t)
                dem_m  = re.search(r'(\d+)\s*(?:demand|units?/day|daily)', t)
                exp_m  = re.search(r'(\d+)\s*expir', t)
                fuel_m = re.search(r'fuel[^\d]*(\d+\.?\d*)', t)
                if inv_m or dem_m:
                    custom = {
                        "inv": int(inv_m.group(1)) if inv_m else 400,
                        "exp": int(exp_m.group(1)) if exp_m else 30,
                        "demand": [int(dem_m.group(1))]*7 if dem_m else [85]*7,
                        "fuel": float(fuel_m.group(1)) if fuel_m else 1.0,
                        "threshold": 200, "order_max": 600,
                    }
                    result = await run_all(custom)
                    response = format_result("Custom Scenario", result)
                else:
                    # Default to normal
                    result = await run_all(SCENARIOS["normal"])
                    response = format_result("Normal Operations", result)

    except Exception as e:
        ctx.logger.error(f"[SupplyMind] Error: {e}")
        response = f"⚠️ Error: {str(e)}\n\nTry: `help` to see available commands."

    await ctx.send(sender, ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=[
            TextContent(type="text", text=response),
            EndSessionContent(type="end-session"),
        ],
    ))


agent.include(chat_proto, publish_manifest=True)

if __name__ == "__main__":
    print(f"\nSupplyMind v2 — Address: {agent.address}")
    agent.run()
