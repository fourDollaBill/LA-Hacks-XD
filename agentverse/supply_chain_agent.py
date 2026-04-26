"""
agentverse/supply_chain_agent.py
===================================
SupplyMind — ASI:One Chat Protocol Agent (Local + Mailbox)

Upgraded for strong ASI:One demos:
- Multi-turn conversation context
- Calls real reasoning agents (ForecastAgent + DecisionAgent use LLM)
- Structured, impressive responses
- Natural language understanding

RUN:
  cd project/
  export AGENT_SEED="your-secret-seed-here"
  python agentverse/supply_chain_agent.py
"""

import os
import sys
import re
import json
import asyncio
from pathlib import Path
from datetime import datetime
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parent.parent))

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

from agents.orchestrator_agent import OrchestratorAgent, list_scenarios
from llm.ollama_client import reason

# ── Agent setup ───────────────────────────────────────────────────────────────

AGENT_SEED = os.getenv("AGENT_SEED", "supplymind_asi_agent_v2_change_this_seed")

agent = Agent(
    name="SupplyMind",
    seed=AGENT_SEED,
    port=8001,
    mailbox=True,
)

orchestrator = OrchestratorAgent()

# Per-session conversation history for multi-turn context
_session_history: dict[str, list[dict]] = {}

# ── Intent parsing ────────────────────────────────────────────────────────────

SCENARIO_KEYWORDS = {
    "normal":       ["normal", "baseline", "standard", "regular", "default"],
    "high_demand":  ["high demand", "demand spike", "surge", "spike", "demand increase", "busy"],
    "high_fuel":    ["fuel", "gas price", "fuel cost", "expensive fuel", "fuel surge"],
    "expiry_risk":  ["expir", "spoil", "perishable", "waste", "expiry", "going bad"],
    "low_stock":    ["low stock", "critical stock", "stockout", "out of stock", "running low", "critical"],
}

def parse_intent(text: str):
    t = text.lower()

    if any(w in t for w in ["help", "what can", "options", "list", "scenarios", "how do", "what do", "capabilities"]):
        return "help", None

    if any(w in t for w in ["compare", "vs", "versus", "difference between", "which is better", "truck or", "intermodal or"]):
        return "compare", None

    for key, keywords in SCENARIO_KEYWORDS.items():
        if any(k in t for k in keywords):
            return "scenario", key

    inv_m  = re.search(r'(\d+)\s*(?:units?|inventory|stock)', t)
    dem_m  = re.search(r'(\d+)\s*(?:demand|units?/day|daily)', t)
    exp_m  = re.search(r'(\d+)\s*expir', t)
    fuel_m = re.search(r'fuel[^\d]*(\d+\.?\d*)', t)

    if inv_m or dem_m:
        return "custom", {
            "inventory": int(inv_m.group(1)) if inv_m else 400,
            "expiring":  int(exp_m.group(1)) if exp_m else 30,
            "demand":    [int(dem_m.group(1))] * 7 if dem_m else [85] * 7,
            "fuel":      float(fuel_m.group(1)) if fuel_m else 1.0,
        }

    return "scenario", "normal"

# ── Response formatters ───────────────────────────────────────────────────────

RISK_EMOJI = {"low": "🟢", "moderate": "🟡", "high": "🟠", "critical": "🔴"}

def format_result(result, label: str) -> str:
    f  = result.forecast
    iv = result.inventory
    tr = result.transport
    d  = result.decision

    # Order deadlines
    stockout = iv.days_until_stockout
    truck_order_days = max(0, round(stockout - tr.truck.lead_time_days))
    inter_order_days = max(0, round(stockout - tr.intermodal.lead_time_days))
    truck_deadline   = "TODAY ⚠️" if truck_order_days == 0 else f"in {truck_order_days} days"
    inter_deadline   = "OVERDUE ⚠️" if inter_order_days <= 0 else ("TODAY ⚠️" if inter_order_days == 0 else f"in {inter_order_days} days")

    lines = [
        f"## {'🔴' if d.should_reorder else '🟢'} SupplyMind Analysis — {label}",
        "",
        "### 📈 Demand Forecast *(AI-reasoned)*",
        f"- Predicted demand: **{f.predicted_demand} units/day** | Trend: **{f.trend}** | Confidence: **{f.confidence}**",
        f"- 3-day outlook: **{f.forecast_3_days} units**",
    ]
    if f.reasoning:
        lines.append(f"- 💭 *{f.reasoning}*")

    lines += [
        "",
        "### 📦 Inventory Status",
        f"- Usable stock: **{iv.usable_inventory} / {iv.total_inventory} units**",
        f"- Days until stockout: **{iv.days_until_stockout}d** | Expiring: **{iv.expiring_units} units**",
        f"- Spoilage risk: {RISK_EMOJI.get(iv.spoilage_risk, '⚪')} **{iv.spoilage_risk.upper()}** | Stockout risk: {RISK_EMOJI.get(iv.stockout_risk, '⚪')} **{iv.stockout_risk.upper()}**",
        "",
        "### 🚚 Transport Comparison",
        f"| Method | Cost/unit | Lead time | Order by | Spoilage penalty |",
        f"|--------|-----------|-----------|----------|-----------------|",
        f"| 🚛 Truck {'✓' if tr.recommended == 'truck' else ''} | **${tr.truck.total_score:.2f}** | 2 days | {truck_deadline} | — |",
        f"| 🚂 Intermodal {'✓' if tr.recommended == 'intermodal' else ''} | **${tr.intermodal.total_score:.2f}** | 5 days | {inter_deadline} | +${tr.intermodal.spoilage_penalty:.2f} |",
        f"- Fuel index: **×{tr.fuel_index}** {'⚠️ elevated' if tr.fuel_index > 1.3 else '✅ normal'}",
        "",
        "### 🧠 Decision *(AI-reasoned)*",
        f"**{d.action}**",
    ]

    if d.should_reorder:
        lines += [
            f"- Order **{d.order_quantity} units** via **{d.transport_method}**",
            f"- Cost score: ${d.total_cost_score:.2f} (transport ${d.reasoning.transport_cost} + stockout risk ${d.reasoning.stockout_risk_cost} + spoilage ${d.reasoning.spoilage_risk_cost})",
        ]
    else:
        lines.append("- Stock is sufficient. No reorder needed at this time.")

    if d.decision_reasoning:
        lines += ["", f"💭 *{d.decision_reasoning}*"]

    if result.llm_explanation:
        lines += ["", "### 💬 Summary", f"*{result.llm_explanation}*"]

    lines += [
        "",
        "---",
        "💬 **Ask me:** `what if demand spikes?` | `compare truck vs intermodal` | `run fuel surge scenario` | `help`",
    ]
    return "\n".join(lines)


COMPARE_TEXT = """## 🚛 vs 🚂 Truck vs Intermodal — When to use each

### Truck
- **Lead time:** 2 days — fastest option
- **Cost:** Higher base cost per unit
- **Best for:** Critical stockouts, high spoilage risk, urgent reorders
- **Use when:** Days until stockout ≤ 5, or spoilage risk is HIGH/CRITICAL

### Intermodal (Rail + Road)
- **Lead time:** 5 days — slower but cheaper
- **Cost:** Lower base cost, but adds a spoilage penalty for perishables
- **Best for:** Stable demand, low spoilage risk, planned reorders
- **Use when:** Days until stockout > 7 and spoilage risk is LOW/MODERATE

### How SupplyMind decides
The system calculates a **total cost score** for each option:
`total = transport cost + spoilage penalty + stockout risk penalty`

If fuel prices spike (×1.3+), intermodal's cost advantage shrinks.
If inventory is expiring fast, the spoilage penalty flips the decision to truck.

**Try:** `run expiry crisis scenario` to see truck win despite higher cost."""


HELP_TEXT = """## 🏭 SupplyMind — Multi-Agent Supply Chain Optimizer

I use **5 AI agents** — two powered by LLM reasoning — to optimize supply chain decisions for perishable goods.

| Agent | Type | Role |
|-------|------|------|
| 📈 ForecastAgent | 🤖 LLM-reasoned | Analyzes demand trends and predicts future demand |
| 📦 InventoryAgent | 📐 Deterministic | Calculates usable stock, expiry risk, stockout timing |
| 🚚 TransportAgent | 📐 Deterministic | Compares truck vs intermodal with spoilage penalties |
| 🧠 DecisionAgent | 🤖 LLM-reasoned | Weighs all inputs and decides reorder strategy |
| 🎯 Orchestrator | 🔗 Coordinator | Chains all agents, passes context between them |

**Optimization goal:** `total cost = transport + spoilage risk + stockout risk`

---

### 🎬 Demo Scenarios

| Command | What it shows |
|---------|--------------|
| `normal operations` | Healthy baseline — intermodal wins |
| `demand spike` | Rising demand → larger order + faster shipping |
| `fuel price surge` | Fuel ×2.1 → system reconsiders transport |
| `expiry crisis` | 280/420 units expiring → speed over cost |
| `low stock` | Near-critical → urgent reorder triggered |

### 🔧 Custom scenario
> *"I have 350 units, 90 expiring, demand is 120 units/day"*

### 🚚 Transport question
> *"compare truck vs intermodal"*"""

# ── Chat Protocol ─────────────────────────────────────────────────────────────

chat_proto = Protocol(spec=chat_protocol_spec)


@chat_proto.on_message(ChatMessage)
async def handle_chat(ctx: Context, sender: str, msg: ChatMessage):
    # 1. ACK immediately
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.utcnow(),
        acknowledged_msg_id=msg.msg_id,
    ))

    # 2. Extract text
    user_text = " ".join(
        item.text for item in msg.content if hasattr(item, "text")
    ).strip()

    ctx.logger.info(f"[SupplyMind] From {sender[:12]}: '{user_text[:60]}'")

    # 3. Track session history for multi-turn context
    if sender not in _session_history:
        _session_history[sender] = []
    _session_history[sender].append({"role": "user", "content": user_text})

    # 4. Parse intent and build response
    intent, payload = parse_intent(user_text)

    try:
        if intent == "help" or not user_text:
            response = HELP_TEXT

        elif intent == "compare":
            response = COMPARE_TEXT

        elif intent == "custom":
            from models.responses import RunResult
            from core.forecast   import run_forecast
            from core.inventory  import run_inventory
            from core.transport  import run_transport
            from agents.decision_agent import DecisionAgent

            forecast  = await orchestrator.forecast_agent.run(payload["demand"])
            inventory = orchestrator.inventory_agent.run(
                total_units=payload["inventory"], expiring_soon=payload["expiring"],
                lead_time_truck=2, lead_time_intermodal=5, forecast=forecast,
            )
            transport = orchestrator.transport_agent.run(
                truck_cost_per_unit=4.50, intermodal_cost_per_unit=2.80,
                fuel_cost_index=payload["fuel"], inventory=inventory, forecast=forecast,
            )
            decision = await orchestrator.decision_agent.run(
                reorder_threshold=200, order_max=600,
                forecast=forecast, inventory=inventory, transport=transport,
            )
            result = RunResult(
                scenario="Custom Scenario",
                forecast=forecast, inventory=inventory,
                transport=transport, decision=decision,
            )
            from llm.ollama_client import get_explanation
            result.llm_explanation = await get_explanation(result)
            response = format_result(result, "Custom Scenario")

        else:
            # Run full agent pipeline
            result, _ = await orchestrator.run(payload)
            response = format_result(result, result.scenario)

    except Exception as e:
        ctx.logger.error(f"[SupplyMind] Error: {e}")
        response = f"⚠️ Something went wrong: {str(e)}\n\nTry: `help` to see available commands."

    # 5. Track response
    _session_history[sender].append({"role": "assistant", "content": response[:200]})

    # 6. Send response
    await ctx.send(sender, ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=[
            TextContent(type="text", text=response),
            EndSessionContent(type="end-session"),
        ],
    ))
    ctx.logger.info(f"[SupplyMind] Response sent to {sender[:12]}")


@agent.on_event("startup")
async def startup(ctx: Context):
    ctx.logger.info("=" * 55)
    ctx.logger.info("  SupplyMind v2.0 — LLM-Powered Supply Chain Agent")
    ctx.logger.info(f"  Address  : {agent.address}")
    ctx.logger.info(f"  Inspector: https://agentverse.ai/inspect/?uri=http://127.0.0.1:8001&address={agent.address}")
    ctx.logger.info("=" * 55)


agent.include(chat_proto, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
