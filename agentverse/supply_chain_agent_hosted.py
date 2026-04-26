"""
agentverse/supply_chain_agent_hosted.py
========================================
AGENTVERSE HOSTED VERSION — paste this into the Agentverse code editor.
https://agentverse.ai → My Agents → New Agent → Blank Agent → paste → Run

Hosted agents MUST use Agent() with NO parameters.
All core logic is embedded here since hosted agents can't import local modules.
"""

import re
import csv
import io
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

# Agentverse hosted: NO parameters
agent = Agent()

# ── Embedded Data (mirrors data/*.csv) ───────────────────────────────────────

SCENARIOS = {
    "normal": {
        "label": "Normal Operations", "color": "#22c55e",
        "inv": 500, "exp": 50, "fuel": 1.0,
        "demand": [80, 85, 78, 90, 88, 82, 86],
        "lt_truck": 2, "lt_inter": 5, "threshold": 200, "order_max": 400,
        "truck_cpu": 4.50, "inter_cpu": 2.80,
    },
    "high_demand": {
        "label": "Demand Spike", "color": "#f59e0b",
        "inv": 300, "exp": 40, "fuel": 1.0,
        "demand": [80, 95, 130, 160, 175, 180, 190],
        "lt_truck": 2, "lt_inter": 5, "threshold": 200, "order_max": 600,
        "truck_cpu": 4.50, "inter_cpu": 2.80,
    },
    "high_fuel": {
        "label": "Fuel Price Surge", "color": "#ef4444",
        "inv": 450, "exp": 30, "fuel": 2.1,
        "demand": [80, 82, 79, 84, 83, 81, 85],
        "lt_truck": 2, "lt_inter": 5, "threshold": 200, "order_max": 400,
        "truck_cpu": 4.50, "inter_cpu": 2.80,
    },
    "expiry_risk": {
        "label": "Expiry Crisis", "color": "#8b5cf6",
        "inv": 420, "exp": 280, "fuel": 1.0,
        "demand": [80, 82, 79, 84, 83, 81, 85],
        "lt_truck": 2, "lt_inter": 5, "threshold": 200, "order_max": 400,
        "truck_cpu": 4.50, "inter_cpu": 2.80,
    },
    "low_stock": {
        "label": "Critical Stock", "color": "#f97316",
        "inv": 120, "exp": 10, "fuel": 1.0,
        "demand": [80, 88, 95, 102, 108, 115, 120],
        "lt_truck": 2, "lt_inter": 5, "threshold": 200, "order_max": 500,
        "truck_cpu": 4.50, "inter_cpu": 2.80,
    },
}

# ── Embedded Core Logic (mirrors core/*.py) ───────────────────────────────────

def core_forecast(demand: list[int]) -> dict:
    n = len(demand)
    weights = list(range(1, n + 1))
    predicted = round(sum(d * w for d, w in zip(demand, weights)) / sum(weights))
    recent = sum(demand[-3:]) / 3
    older  = sum(demand[:3])  / 3
    trend  = "rising" if recent > older * 1.1 else ("falling" if recent < older * 0.9 else "stable")
    return {"predicted_demand": predicted, "forecast_3_days": predicted * 3, "trend": trend}


def core_inventory(inv: int, exp: int, lt_truck: int, lt_inter: int, forecast: dict) -> dict:
    daily = forecast["predicted_demand"]
    usable = max(inv - exp, 0)
    days_out = round(usable / daily, 1) if daily > 0 else 999.0
    ratio = exp / inv if inv > 0 else 0
    spoilage_risk = "critical" if ratio > 0.5 else ("high" if ratio > 0.2 else ("moderate" if ratio > 0.05 else "low"))
    stockout_risk = "critical" if days_out <= lt_truck else ("high" if days_out <= lt_inter else ("moderate" if days_out <= lt_inter + 2 else "low"))
    return {
        "total": inv, "expiring": exp, "usable": usable,
        "days_until_stockout": days_out,
        "spoilage_risk": spoilage_risk, "stockout_risk": stockout_risk,
        "spoilage_pct": round((exp / inv) * 100, 1) if inv > 0 else 0,
    }


def core_transport(truck_cpu: float, inter_cpu: float, fuel: float, inventory: dict, forecast: dict) -> dict:
    truck_cost = round(truck_cpu * fuel, 2)
    inter_cost = round(inter_cpu * fuel, 2)
    rates = {"low": 0.01, "moderate": 0.05, "high": 0.12, "critical": 0.25}
    daily_spoilage = inventory["usable"] * rates.get(inventory["spoilage_risk"], 0.05)
    penalty = round(3 * daily_spoilage * 3.00 / max(forecast["predicted_demand"], 1), 2)
    inter_total = round(inter_cost + penalty, 2)
    recommended = "truck" if truck_cost <= inter_total else "intermodal"
    return {
        "truck_score": truck_cost, "inter_score": inter_total,
        "inter_penalty": penalty, "recommended": recommended, "fuel_index": fuel,
    }


def core_decision(threshold: int, order_max: int, forecast: dict, inventory: dict, transport: dict) -> dict:
    daily = forecast["predicted_demand"]
    usable = inventory["usable"]
    should_reorder = (
        usable <= threshold
        or inventory["stockout_risk"] in ("high", "critical")
        or inventory["spoilage_risk"] in ("high", "critical")
    )
    safety = 3 if forecast["trend"] == "rising" else 2
    qty = max(0, min(round((daily * (7 + safety)) - usable), order_max)) if should_reorder else 0
    method = transport["recommended"] if should_reorder else "n/a"
    if inventory["stockout_risk"] == "critical" and method == "intermodal":
        method = "truck (forced — critical stockout)"
    chosen = transport["truck_score"] if "truck" in method else transport["inter_score"]
    t_cost = round(chosen * qty, 2)
    s_cost = round({"low": 0, "moderate": 1.5, "high": 4.0, "critical": 8.0}[inventory["stockout_risk"]] * daily, 2)
    p_cost = round({"low": 0, "moderate": 0.5, "high": 2.0, "critical": 5.0}[inventory["spoilage_risk"]] * inventory["expiring"], 2)
    return {
        "action": "REORDER NOW" if should_reorder else "HOLD — sufficient stock",
        "should_reorder": should_reorder,
        "order_qty": qty,
        "transport": method,
        "total_cost": round(t_cost + s_cost + p_cost, 2),
        "breakdown": {"transport": t_cost, "stockout": s_cost, "spoilage": p_cost},
    }


def run_all_agents(s: dict) -> dict:
    forecast   = core_forecast(s["demand"])
    inventory  = core_inventory(s["inv"], s["exp"], s["lt_truck"], s["lt_inter"], forecast)
    transport  = core_transport(s["truck_cpu"], s["inter_cpu"], s["fuel"], inventory, forecast)
    decision   = core_decision(s["threshold"], s["order_max"], forecast, inventory, transport)
    return {"forecast": forecast, "inventory": inventory, "transport": transport, "decision": decision}

# ── Intent Parsing ────────────────────────────────────────────────────────────

def parse_intent(text: str):
    t = text.lower()
    if any(w in t for w in ["help", "what can", "options", "list", "scenarios", "how do"]):
        return "help", None
    scenario_map = {
        "normal":       ["normal", "baseline", "standard", "regular"],
        "high_demand":  ["high demand", "demand spike", "surge", "spike", "demand increase"],
        "high_fuel":    ["fuel", "gas price", "fuel cost", "expensive fuel"],
        "expiry_risk":  ["expir", "spoil", "perishable", "waste", "expiry"],
        "low_stock":    ["low stock", "critical stock", "stockout", "out of stock", "running low"],
    }
    for key, keywords in scenario_map.items():
        if any(k in t for k in keywords):
            return "scenario", key
    # Try custom numbers
    inv_m  = re.search(r'(\d+)\s*(?:units?|inventory|stock)', t)
    dem_m  = re.search(r'(\d+)\s*(?:demand|units?/day|daily)', t)
    exp_m  = re.search(r'(\d+)\s*expir', t)
    fuel_m = re.search(r'fuel[^\d]*(\d+\.?\d*)', t)
    if inv_m or dem_m:
        return "custom", {
            "label": "Custom Scenario", "inv": int(inv_m.group(1)) if inv_m else 400,
            "exp": int(exp_m.group(1)) if exp_m else 30,
            "demand": [int(dem_m.group(1))] * 7 if dem_m else [85] * 7,
            "fuel": float(fuel_m.group(1)) if fuel_m else 1.0,
            "lt_truck": 2, "lt_inter": 5, "threshold": 200, "order_max": 600,
            "truck_cpu": 4.50, "inter_cpu": 2.80,
        }
    return "scenario", "normal"

# ── Response Formatter ────────────────────────────────────────────────────────

RISK_EMOJI = {"low": "🟢", "moderate": "🟡", "high": "🟠", "critical": "🔴"}

def format_result(label: str, r: dict) -> str:
    f = r["forecast"]; iv = r["inventory"]; tr = r["transport"]; d = r["decision"]
    lines = [
        f"## {'🔴' if d['should_reorder'] else '🟢'} SupplyMind — {label}",
        "",
        "### 📈 Demand Forecast",
        f"- Daily demand: **{f['predicted_demand']} units/day** | Trend: **{f['trend']}** | 3-day total: **{f['forecast_3_days']} units**",
        "",
        "### 📦 Inventory Status",
        f"- Usable stock: **{iv['usable']} / {iv['total']} units** | Days to stockout: **{iv['days_until_stockout']}d**",
        f"- Expiring soon: **{iv['expiring']} units** ({iv['spoilage_pct']}% of stock)",
        f"- Spoilage risk: {RISK_EMOJI.get(iv['spoilage_risk'], '⚪')} **{iv['spoilage_risk'].upper()}** | Stockout risk: {RISK_EMOJI.get(iv['stockout_risk'], '⚪')} **{iv['stockout_risk'].upper()}**",
        "",
        "### 🚚 Transport Comparison",
        f"- 🚛 Truck: **${tr['truck_score']}/unit** (2-day lead time)",
        f"- 🚂 Intermodal: **${tr['inter_score']}/unit** incl. ${tr['inter_penalty']} spoilage penalty (5-day lead time)",
        f"- Fuel index: **×{tr['fuel_index']}** {'⚠️ elevated' if tr['fuel_index'] > 1.3 else '✅ normal'} | Recommended: **{tr['recommended'].upper()}**",
        "",
        "### 🧠 Final Decision",
        f"**{d['action']}**",
    ]
    if d["should_reorder"]:
        lines += [
            f"- Order: **{d['order_qty']} units** via **{d['transport']}**",
            "",
            "**Cost Score Breakdown:**",
            f"| Component | Cost |",
            f"|---|---|",
            f"| Transport | ${d['breakdown']['transport']} |",
            f"| Stockout risk penalty | ${d['breakdown']['stockout']} |",
            f"| Spoilage risk penalty | ${d['breakdown']['spoilage']} |",
            f"| **Total** | **${d['total_cost']}** |",
        ]
    else:
        lines.append("- Inventory is sufficient. No reorder needed at this time.")
    lines += [
        "",
        "---",
        "*SupplyMind minimizes: transport cost + spoilage risk + stockout risk*",
        "",
        "💬 **Try:** `demand spike` | `fuel surge` | `expiry crisis` | `low stock` | `help`",
    ]
    return "\n".join(lines)


HELP_TEXT = """## 🏭 SupplyMind — Multi-Agent Supply Chain Optimizer

I coordinate **5 AI agents** to optimize supply chain decisions for perishable goods in real time.

| Agent | Role |
|---|---|
| 📈 ForecastAgent | Weighted moving average demand forecasting |
| 📦 InventoryAgent | Usable stock, expiry tracking, stockout timing |
| 🚚 TransportAgent | Truck vs intermodal with spoilage cost penalties |
| 🧠 DecisionAgent | Minimizes: transport + spoilage + stockout cost |
| 🎯 Orchestrator | Coordinates all agents into one recommendation |

**I minimize:** `total cost = transport cost + spoilage risk + stockout risk`

---

### 🎬 Demo Scenarios

| Command | What happens |
|---|---|
| `normal operations` | Steady demand, healthy stock |
| `demand spike` | Surge in orders → larger reorder + faster shipping |
| `fuel price surge` | Fuel ×2.1 → system reconsiders transport method |
| `expiry crisis` | 280/420 units expiring → speed prioritized over cost |
| `low stock` | Near-critical inventory → urgent reorder triggered |

### 🔧 Custom Scenario
Describe your own situation:
> *"I have 350 units, 90 expiring, demand is 110 units/day"*
> *"500 units in stock, fuel cost is 1.8x normal"*"""


# ── Chat Protocol ─────────────────────────────────────────────────────────────

chat_proto = Protocol(spec=chat_protocol_spec)


@chat_proto.on_message(ChatMessage)
async def handle_chat(ctx: Context, sender: str, msg: ChatMessage):
    # 1. Always ACK first
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.utcnow(),
        acknowledged_msg_id=msg.msg_id,
    ))

    # 2. Extract text
    user_text = " ".join(
        item.text for item in msg.content if hasattr(item, "text")
    ).strip()
    ctx.logger.info(f"[SupplyMind] '{user_text[:80]}'")

    # 3. Parse intent and run agents
    intent, payload = parse_intent(user_text)

    if intent == "help" or not user_text:
        response = HELP_TEXT
    elif intent == "custom":
        result = run_all_agents(payload)
        response = format_result("Custom Scenario", result)
    else:
        s = SCENARIOS[payload]
        result = run_all_agents(s)
        response = format_result(s["label"], result)

    # 4. Send response + end session
    await ctx.send(sender, ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=[
            TextContent(type="text", text=response),
            EndSessionContent(type="end-session"),
        ],
    ))
    ctx.logger.info("[SupplyMind] Response sent.")


agent.include(chat_proto, publish_manifest=True)

if __name__ == "__main__":
    print(f"Agent address: {agent.address}")
    agent.run()
