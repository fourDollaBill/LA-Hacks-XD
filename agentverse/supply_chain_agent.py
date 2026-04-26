"""
agentverse/supply_chain_agent.py
==================================
LOCAL agent with Agentverse mailbox support.
Imports directly from core/ and agents/ — the real project logic.

SETUP:
  pip install uagents uagents-core
  export AGENT_SEED="your-unique-seed-phrase"
  cd project/
  python agentverse/supply_chain_agent.py

Then open the inspector URL printed in the terminal,
click Connect → Mailbox to register with Agentverse.
"""

import os
import sys
from pathlib import Path
from datetime import datetime
from uuid import uuid4

# Add project root to path so core/ and agents/ are importable
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
from core.forecast import run_forecast
from core.inventory import run_inventory
from core.transport import run_transport
from core.decision import run_decision

import re

# ── Agent Setup ───────────────────────────────────────────────────────────────

AGENT_SEED = os.getenv("AGENT_SEED", "supply_mind_local_agent_seed_change_me_v1")

agent = Agent(
    name="SupplyMind",
    seed=AGENT_SEED,
    port=8001,
    mailbox=True,
)

orchestrator = OrchestratorAgent()

# ── Intent Parser ─────────────────────────────────────────────────────────────

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
    inv_m  = re.search(r'(\d+)\s*(?:units?|inventory|stock)', t)
    dem_m  = re.search(r'(\d+)\s*(?:demand|units?/day|daily)', t)
    exp_m  = re.search(r'(\d+)\s*expir', t)
    fuel_m = re.search(r'fuel[^\d]*(\d+\.?\d*)', t)
    if inv_m or dem_m:
        return "custom", {
            "inv": int(inv_m.group(1)) if inv_m else 400,
            "exp": int(exp_m.group(1)) if exp_m else 30,
            "demand": [int(dem_m.group(1))] * 7 if dem_m else [85] * 7,
            "fuel": float(fuel_m.group(1)) if fuel_m else 1.0,
        }
    return "scenario", "normal"


# ── Response Formatter ────────────────────────────────────────────────────────

RISK_EMOJI = {"low": "🟢", "moderate": "🟡", "high": "🟠", "critical": "🔴"}

def format_run_result(result) -> str:
    f  = result.forecast
    iv = result.inventory
    tr = result.transport
    d  = result.decision

    lines = [
        f"## {'🔴' if d.should_reorder else '🟢'} SupplyMind — {result.scenario}",
        "",
        "### 📈 Demand Forecast",
        f"- Daily demand: **{f.predicted_demand} units/day** | Trend: **{f.trend}** | 3-day total: **{f.forecast_3_days} units**",
        "",
        "### 📦 Inventory Status",
        f"- Usable stock: **{iv.usable_inventory} / {iv.total_inventory} units** | Days to stockout: **{iv.days_until_stockout}d**",
        f"- Expiring soon: **{iv.expiring_units} units** ({iv.spoilage_percent}% of stock)",
        f"- Spoilage risk: {RISK_EMOJI.get(iv.spoilage_risk, '⚪')} **{iv.spoilage_risk.upper()}** | Stockout risk: {RISK_EMOJI.get(iv.stockout_risk, '⚪')} **{iv.stockout_risk.upper()}**",
        "",
        "### 🚚 Transport Comparison",
        f"- 🚛 Truck: **${tr.truck.total_score}/unit** (2-day lead time)",
        f"- 🚂 Intermodal: **${tr.intermodal.total_score}/unit** incl. ${tr.intermodal.spoilage_penalty} spoilage penalty (5-day lead time)",
        f"- Fuel index: **×{tr.fuel_index}** {'⚠️ elevated' if tr.fuel_index > 1.3 else '✅ normal'} | Recommended: **{tr.recommended.upper()}**",
        "",
        "### 🧠 Final Decision",
        f"**{d.action}**",
    ]
    if d.should_reorder:
        lines += [
            f"- Order: **{d.order_quantity} units** via **{d.transport_method}**",
            "",
            "**Cost Score Breakdown:**",
            f"| Component | Cost |",
            f"|---|---|",
            f"| Transport | ${d.reasoning.transport_cost} |",
            f"| Stockout risk penalty | ${d.reasoning.stockout_risk_cost} |",
            f"| Spoilage risk penalty | ${d.reasoning.spoilage_risk_cost} |",
            f"| **Total** | **${d.total_cost_score}** |",
        ]
        if result.llm_explanation:
            lines += ["", f"💬 **AI Insight:** {result.llm_explanation}"]
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

I coordinate **5 AI agents** to optimize supply chain decisions for perishable goods.

| Agent | Role |
|---|---|
| 📈 ForecastAgent | Weighted moving average demand forecasting |
| 📦 InventoryAgent | Usable stock, expiry tracking, stockout timing |
| 🚚 TransportAgent | Truck vs intermodal with spoilage cost penalties |
| 🧠 DecisionAgent | Minimizes: transport + spoilage + stockout cost |
| 🎯 Orchestrator | Reads from live CSV data, coordinates all agents |

**I minimize:** `total cost = transport cost + spoilage risk + stockout risk`

---

### 🎬 Demo Scenarios
| Command | What happens |
|---|---|
| `normal operations` | Healthy baseline |
| `demand spike` | Surge → larger order + faster shipping |
| `fuel price surge` | Fuel ×2.1 → transport switch |
| `expiry crisis` | 280/420 units expiring → speed over cost |
| `low stock` | Near-critical → urgent reorder |

### 🔧 Custom
> *"350 units, 90 expiring, demand 110 units/day"*"""


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
    ctx.logger.info(f"[SupplyMind] '{user_text[:80]}'")

    # 3. Parse intent
    intent, payload = parse_intent(user_text)

    if intent == "help" or not user_text:
        response = HELP_TEXT

    elif intent == "custom":
        from models.responses import RunResult
        forecast  = run_forecast(payload["demand"])
        inventory = run_inventory(
            total_units=payload["inv"],
            expiring_soon=payload["exp"],
            lead_time_truck=2,
            lead_time_intermodal=5,
            forecast=forecast,
        )
        transport = run_transport(
            truck_cost_per_unit=4.50,
            intermodal_cost_per_unit=2.80,
            fuel_cost_index=payload["fuel"],
            inventory=inventory,
            forecast=forecast,
        )
        decision = run_decision(
            reorder_threshold=200,
            order_max=600,
            forecast=forecast,
            inventory=inventory,
            transport=transport,
        )
        result = RunResult(
            scenario="Custom Scenario",
            forecast=forecast,
            inventory=inventory,
            transport=transport,
            decision=decision,
        )
        response = format_run_result(result)

    else:
        try:
            result, _ = orchestrator.run(payload)
            response = format_run_result(result)
        except Exception as e:
            response = f"⚠️ Error running scenario: {str(e)}"

    # 4. Send response
    await ctx.send(sender, ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=[
            TextContent(type="text", text=response),
            EndSessionContent(type="end-session"),
        ],
    ))
    ctx.logger.info("[SupplyMind] Response sent.")


@agent.on_event("startup")
async def startup(ctx: Context):
    ctx.logger.info(f"[SupplyMind] Address: {agent.address}")
    ctx.logger.info(f"[SupplyMind] Inspector: https://agentverse.ai/inspect/?uri=http://127.0.0.1:8001&address={agent.address}")
    ctx.logger.info("[SupplyMind] Ready.")


agent.include(chat_proto, publish_manifest=True)

if __name__ == "__main__":
    print(f"\n{'='*60}")
    print(f"  SupplyMind — Local Agent")
    print(f"  Address : {agent.address}")
    print(f"  Port    : 8001")
    print(f"  Inspector: https://agentverse.ai/inspect/?uri=http://127.0.0.1:8001&address={agent.address}")
    print(f"{'='*60}\n")
    agent.run()
