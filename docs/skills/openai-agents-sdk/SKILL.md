---
name: openai-agents-sdk
description: >
  Complete reference for building AI agents using the OpenAI Agents SDK (Python or Node.js).
  Use this skill whenever the user wants to build an agent, create a tool, add guardrails,
  set up handoffs, configure MCP servers, implement human-in-the-loop approval flows, build
  voice agents, or debug agent behavior — in ANY project or language. Also trigger for questions
  about hooks, context injection, structured output, streaming, tracing, multi-agent orchestration,
  non-OpenAI providers (Ollama, Groq, LiteLLM), runner-managed retries, or any phrase like
  "build an agent", "add a tool", "guardrail", "handoff", "MCP", "voice agent", or
  "openai agents sdk". Use this skill even if the user just mentions wanting to automate
  something with an AI agent and doesn't explicitly name the SDK.
---

# OpenAI Agents SDK — Universal Reference

## SCOPE
This skill is for **ANY project** using OpenAI Agents SDK — Python or Node.js, new or existing.

For DentaFlow-specific architecture (lib/agents/ pattern, SDK_AGENTS map, ghl-mcp-server conventions), read:
`docs/skills/dentaflow-agent-pattern/SKILL.md`

---

## TRIGGER CONDITIONS

Use this skill when:
- User says "build an agent", "create an agent", "add an agent"
- User asks about tools, guardrails, hooks, handoffs, context, sessions, MCP, voice
- User reports agent bugs: infinite loops, wrong tool use, guardrail not triggering, model errors
- Any file involving `from agents import Agent, Runner, tool, handoff`
- Any file involving `import { Agent, run, tool } from "@openai/agents"`

---

## INSTALLATION

```bash
# Python
pip install openai-agents
export OPENAI_API_KEY=sk-...

# Node.js
npm install @openai/agents --legacy-peer-deps
npm install zod@^4.0.0 --legacy-peer-deps
```

---

## CORE PRIMITIVES

The SDK has exactly 3 core primitives:
1. **Agent** — LLM + instructions + tools
2. **Handoffs / Agents as tools** — delegation between agents
3. **Guardrails** — input/output validation

Everything else (context, hooks, streaming, tracing, MCP, voice, HITL) builds on these three.

---

## 1. AGENT — Basic Definition

```python
from agents import Agent, ModelSettings, function_tool

@function_tool
def get_weather(city: str) -> str:
    """Returns weather for a city."""
    return f"Sunny in {city}"

agent = Agent(
    name="Weather Agent",
    instructions="You help with weather questions.",
    model="gpt-4o-mini",          # optional, defaults to gpt-4o
    model_settings=ModelSettings(
        temperature=0.2,
        tool_choice="auto",        # "auto" | "required" | "none" | "tool_name"
    ),
    tools=[get_weather],
    output_type=None,              # or Pydantic model for structured output
    input_guardrails=[],           # runs on first user input
    output_guardrails=[],          # runs on final output
    hooks=None,                    # AgentHooks instance
    handoffs=[],                   # other Agent instances or Handoff objects
    tool_use_behavior="run_llm_again",  # default: LLM sees tool results
)
```

### All Agent Properties

| Property | Required | What it does |
|---|---|---|
| `name` | YES | Human-readable name |
| `instructions` | recommended | System prompt (string or dynamic function) |
| `model` | no | Which LLM to use |
| `model_settings` | no | temperature, top_p, tool_choice |
| `tools` | no | Functions the agent can call |
| `handoffs` | no | Agents to delegate to |
| `input_guardrails` | no | Runs on first user message |
| `output_guardrails` | no | Runs on final agent output |
| `output_type` | no | Pydantic model for structured output |
| `hooks` | no | Lifecycle callbacks (AgentHooks) |
| `tool_use_behavior` | no | What to do with tool results |
| `reset_tool_choice` | no | Reset to "auto" after tool call (default: True) |
| `handoff_description` | no | Shown to LLM when this agent is a handoff target |
| `mcp_servers` | no | MCP-backed tools |

---

## 2. TOOLS — Three Types

### Type 1: Function Tools (most common)

```python
from agents import function_tool

# Decorator style — auto-generates schema from type hints + docstring
@function_tool
def search_web(query: str) -> str:
    """Search the web for information."""
    return f"Results for: {query}"

# With tool-level guardrails
from agents import tool_input_guardrail, tool_output_guardrail, ToolGuardrailFunctionOutput

@tool_input_guardrail
def block_secrets(data):
    args = json.loads(data.context.tool_arguments or "{}")
    if "sk-" in json.dumps(args):
        return ToolGuardrailFunctionOutput.reject_content("No secrets allowed.")
    return ToolGuardrailFunctionOutput.allow()

@function_tool(tool_input_guardrails=[block_secrets])
def safe_tool(text: str) -> str:
    """Process text safely."""
    return text.upper()

# With human-in-the-loop approval
@function_tool(needs_approval=True)
async def cancel_order(order_id: int) -> str:
    return f"Cancelled order {order_id}"

# Conditional approval
async def requires_review(_ctx, params, _call_id) -> bool:
    return "refund" in params.get("subject", "").lower()

@function_tool(needs_approval=requires_review)
async def send_email(subject: str, body: str) -> str:
    return f"Sent '{subject}'"
```

### Type 2: Agents as Tools (manager pattern)

```python
# Sub-agent runs as a tool — manager retains control
specialist = Agent(name="Specialist", instructions="You are an expert at X.")

manager = Agent(
    name="Manager",
    instructions="Use the specialist when needed.",
    tools=[
        specialist.as_tool(
            tool_name="specialist_expert",
            tool_description="Call this for specialized X tasks.",
        )
    ],
)
```

### Type 3: Hosted Tools (OpenAI built-ins)

```python
from agents import WebSearchTool, FileSearchTool, CodeInterpreterTool

agent = Agent(
    name="Research Agent",
    tools=[WebSearchTool(), FileSearchTool(vector_store_ids=["vs_123"])],
)
```

### Tool Use Behavior

```python
# Default: tool results go back to LLM for final answer
tool_use_behavior="run_llm_again"

# Stop immediately after first tool call — use tool output as final answer
tool_use_behavior="stop_on_first_tool"

# Stop on specific tools
from agents.agent import StopAtTools
tool_use_behavior=StopAtTools(stop_at_tool_names=["get_weather"])

# Custom function: decide whether to stop based on tool results
from agents.agent import ToolsToFinalOutputResult
def custom_handler(context, tool_results) -> ToolsToFinalOutputResult:
    for r in tool_results:
        if "error" in str(r.output):
            return ToolsToFinalOutputResult(is_final_output=True, final_output="Error occurred")
    return ToolsToFinalOutputResult(is_final_output=False, final_output=None)

tool_use_behavior=custom_handler
```

---

## 3. GUARDRAILS — Input / Output / Tool Validation

### Purpose
- Input guardrails: screen user message BEFORE (or parallel to) agent execution
- Output guardrails: screen agent response AFTER execution
- Tool guardrails: validate args/output of each function tool call

### Input Guardrail

```python
from pydantic import BaseModel
from agents import Agent, GuardrailFunctionOutput, InputGuardrailTripwireTriggered, input_guardrail, Runner

class SafetyCheck(BaseModel):
    is_harmful: bool
    reason: str

safety_checker = Agent(
    name="Safety Checker",
    instructions="Detect if user input is harmful.",
    output_type=SafetyCheck,
)

@input_guardrail
async def safety_guardrail(ctx, agent, input):
    result = await Runner.run(safety_checker, input, context=ctx.context)
    return GuardrailFunctionOutput(
        output_info=result.final_output,
        tripwire_triggered=result.final_output.is_harmful,
    )

# Parallel (default) vs Blocking execution
# run_in_parallel=True  → guardrail runs alongside agent (faster, but agent may start)
# run_in_parallel=False → guardrail must pass BEFORE agent starts (use for cost savings)
from agents import InputGuardrail
guardrail_obj = InputGuardrail(guardrail_function=safety_guardrail, run_in_parallel=False)

agent = Agent(
    name="Customer Support",
    instructions="Help customers.",
    input_guardrails=[safety_guardrail],  # or [guardrail_obj]
)

# Catching tripwire
try:
    result = await Runner.run(agent, "harmful input")
except InputGuardrailTripwireTriggered:
    print("Blocked!")
```

### Output Guardrail

```python
from agents import output_guardrail, OutputGuardrailTripwireTriggered

@output_guardrail
async def no_pii_guardrail(ctx, agent, output):
    has_pii = "SSN" in str(output) or "@" in str(output)
    return GuardrailFunctionOutput(
        output_info={"has_pii": has_pii},
        tripwire_triggered=has_pii,
    )

agent = Agent(name="Support Agent", output_guardrails=[no_pii_guardrail])
```

### Tool Guardrail

```python
from agents import function_tool, tool_input_guardrail, tool_output_guardrail, ToolGuardrailFunctionOutput

@tool_input_guardrail
def validate_city(data):
    args = json.loads(data.context.tool_arguments or "{}")
    if args.get("city") == "":
        return ToolGuardrailFunctionOutput.reject_content("City cannot be empty.")
    return ToolGuardrailFunctionOutput.allow()

@tool_output_guardrail
def redact_sensitive(data):
    if "password" in str(data.output or "").lower():
        return ToolGuardrailFunctionOutput.reject_content("Output contained credentials.")
    return ToolGuardrailFunctionOutput.allow()

@function_tool(
    tool_input_guardrails=[validate_city],
    tool_output_guardrails=[redact_sensitive],
)
def get_weather(city: str) -> str:
    """Get weather for a city."""
    return f"Sunny in {city}"
```

**Important boundaries:**
- Input guardrails → only run for the FIRST agent in a chain
- Output guardrails → only run for the LAST agent (final output producer)
- Tool guardrails → run for EVERY call to that function tool, anywhere in the chain

---

## 4. HOOKS — Lifecycle Events

Two scopes:
- `RunHooks` → observes the entire `Runner.run()` call including handoffs
- `AgentHooks` → attached to one specific agent via `agent.hooks`

```python
from agents import Agent, RunHooks, AgentHooks, Runner

class MyRunHooks(RunHooks):
    async def on_agent_start(self, context, agent):
        print(f"[START] {agent.name}")

    async def on_agent_end(self, context, agent, output):
        print(f"[END] {agent.name} — usage: {context.usage}")

    async def on_llm_start(self, context, agent):
        print(f"[LLM] {agent.name} calling model")

    async def on_llm_end(self, context, agent, response):
        print(f"[LLM] {agent.name} got {len(response.output)} items")

    async def on_tool_start(self, context, agent, tool):
        print(f"[TOOL] {tool.name} called")

    async def on_tool_end(self, context, agent, tool, result):
        print(f"[TOOL] {tool.name} returned")

    async def on_handoff(self, context, from_agent, to_agent):
        print(f"[HANDOFF] {from_agent.name} → {to_agent.name}")

result = await Runner.run(agent, "Hello", hooks=MyRunHooks())

class AgentSpecificHooks(AgentHooks):
    async def on_start(self, context, agent):
        pass  # runs when THIS agent specifically starts

    async def on_end(self, context, agent, output):
        pass  # log this agent's outputs

my_agent = Agent(name="MyAgent", hooks=AgentSpecificHooks(), ...)
```

**Hook timing:**
- `on_agent_start/end` → when agent begins/finishes producing final output
- `on_llm_start/end` → around each model API call
- `on_tool_start/end` → around each local function tool call
- `on_handoff` → when control transfers between agents

---

## 5. HANDOFFS — Delegation Between Agents

### Basic Handoff

```python
from agents import Agent, handoff

billing_agent = Agent(name="Billing", instructions="Handle billing questions.")
refund_agent = Agent(name="Refund", instructions="Handle refund requests.")

triage_agent = Agent(
    name="Triage",
    instructions=(
        "Route to billing for payment questions. "
        "Route to refunds for return/refund questions."
    ),
    handoffs=[billing_agent, handoff(refund_agent)],
)
```

### Custom Handoff with Callback + Metadata

```python
from pydantic import BaseModel
from agents import handoff, RunContextWrapper

class EscalationData(BaseModel):
    reason: str
    priority: str  # "high" | "medium" | "low"

async def on_escalation(ctx: RunContextWrapper, data: EscalationData):
    print(f"Escalating: {data.reason} [{data.priority}]")

handoff_obj = handoff(
    agent=escalation_agent,
    on_handoff=on_escalation,
    input_type=EscalationData,
    tool_name_override="escalate_case",
    tool_description_override="Escalate to a human agent with reason and priority.",
    is_enabled=True,  # or a function: lambda ctx, agent: ctx.context.is_pro_user
)
```

### Input Filter (control what history next agent sees)

```python
from agents import handoff
from agents.extensions import handoff_filters

# Remove all tool call history before handoff
handoff_obj = handoff(
    agent=faq_agent,
    input_filter=handoff_filters.remove_all_tools,
)
```

### Recommended Prompt Prefix

```python
from agents.extensions.handoff_prompt import RECOMMENDED_PROMPT_PREFIX

agent = Agent(
    name="Triage",
    instructions=f"""{RECOMMENDED_PROMPT_PREFIX}
    You are a triage agent. Route customer requests to the right specialist.""",
    handoffs=[billing_agent, refund_agent],
)
```

**Handoffs vs Agents as Tools:**

| Handoffs | Agents as Tools |
|---|---|
| Specialist TAKES OVER the conversation | Manager KEEPS control |
| Conversation history passes to specialist | Sub-agent runs as a black box |
| Good for: routing, specialized domains | Good for: combining outputs, parallel tasks |
| Decentralized | Centralized |

---

## 6. CONTEXT — Dependency Injection

Context = any Python object passed to `Runner.run()`. Available everywhere (tools, hooks, guardrails) but NOT sent to the LLM.

```python
from dataclasses import dataclass
from agents import Agent, RunContextWrapper, Runner, function_tool

@dataclass
class AppContext:
    user_id: str
    user_name: str
    db_connection: Any
    is_premium: bool

@function_tool
async def fetch_user_data(ctx: RunContextWrapper[AppContext]) -> str:
    """Get current user's data."""
    user = ctx.context  # your AppContext object
    return f"User: {user.user_name} (premium: {user.is_premium})"

# Dynamic instructions using context
def build_instructions(ctx: RunContextWrapper[AppContext], agent: Agent) -> str:
    return f"You are helping {ctx.context.user_name}."

agent = Agent[AppContext](
    name="Assistant",
    instructions=build_instructions,  # dynamic!
    tools=[fetch_user_data],
)

app_ctx = AppContext(user_id="123", user_name="Donia", db_connection=db, is_premium=True)
result = await Runner.run(agent, "Hello", context=app_ctx)
```

**RunContextWrapper exposes:**
- `wrapper.context` → your app object
- `wrapper.usage` → token usage across the run
- `wrapper.tool_input` → structured input when inside `Agent.as_tool()`
- `wrapper.approve_tool(...)` / `reject_tool(...)` → human-in-the-loop

**ToolContext (advanced)** — inside a tool, get extra metadata:
```python
from agents.tool_context import ToolContext

@function_tool
def my_tool(ctx: ToolContext[AppContext], param: str) -> str:
    print(ctx.tool_name, ctx.tool_call_id, ctx.tool_arguments)
    return "done"
```

---

## 7. RUNNING AGENTS

```python
from agents import Agent, Runner

agent = Agent(name="Assistant", instructions="Be helpful.")

# Async (recommended)
result = await Runner.run(agent, "Hello")
print(result.final_output)

# Sync (for scripts, tests)
result = Runner.run_sync(agent, "Hello")

# Streaming
result = Runner.run_streamed(agent, "Hello")
async for event in result.stream_events():
    if event.type == "raw_response_event":
        pass  # Token-by-token from LLM
    elif event.type == "run_item_stream_event":
        if event.item.type == "message_output_item":
            print("Message complete")
        elif event.item.type == "tool_call_item":
            print("Tool called")
    elif event.type == "agent_updated_stream_event":
        print(f"Now running: {event.new_agent.name}")
```

### Multi-turn Conversations

```python
# Option 1: Pass previous output as new input
result1 = await Runner.run(agent, "What is 2+2?")
result2 = await Runner.run(agent, result1.to_input_list() + [{"role": "user", "content": "And times 3?"}])

# Option 2: Use Sessions (persistent memory)
result = await Runner.run(agent, "Hello", session=my_session)
```

### RunConfig — per-run settings

```python
from agents import RunConfig

result = await Runner.run(
    agent,
    "Hello",
    run_config=RunConfig(
        max_turns=10,
        model="gpt-5.5",               # override model for this run
        tracing_disabled=False,
        trace_include_sensitive_data=True,
        workflow_name="My App",         # shown in traces
    ),
)
```

---

## 8. MULTI-AGENT ORCHESTRATION

### Pattern 1: Manager (Agents as Tools)
Central manager keeps control, calls specialists as tools.

```python
booking_specialist = Agent(name="Booking Specialist", instructions="Handle bookings.")
refund_specialist = Agent(name="Refund Specialist", instructions="Handle refunds.")

customer_agent = Agent(
    name="Customer Agent",
    instructions="Handle all user requests. Delegate to specialists when needed.",
    tools=[
        booking_specialist.as_tool("booking_help", "For booking questions"),
        refund_specialist.as_tool("refund_help", "For refund questions"),
    ],
)
```

### Pattern 2: Handoffs (Routing)
Triage hands off to specialist who takes over entirely.

```python
triage = Agent(
    name="Triage",
    instructions="Route to the right specialist.",
    handoffs=[booking_agent, refund_agent],
)
```

### Pattern 3: Code Orchestration (deterministic)

```python
# Sequential chain
result1 = await Runner.run(researcher, "Research topic X")
result2 = await Runner.run(writer, result1.to_input_list() + [{"role":"user","content":"Write article"}])
result3 = await Runner.run(editor, result2.to_input_list() + [{"role":"user","content":"Polish it"}])

# Parallel execution
import asyncio
results = await asyncio.gather(
    Runner.run(agent_a, "Task A"),
    Runner.run(agent_b, "Task B"),
    Runner.run(agent_c, "Task C"),
)

# Loop with evaluator
for _ in range(5):
    draft = await Runner.run(writer_agent, prompt)
    eval_result = await Runner.run(evaluator_agent, draft.to_input_list())
    if "APPROVED" in eval_result.final_output:
        break
    prompt = eval_result.to_input_list() + [{"role":"user","content":"Revise based on feedback"}]
```

---

## 9. STRUCTURED OUTPUT

```python
from pydantic import BaseModel
from agents import Agent

class LeadInfo(BaseModel):
    name: str
    email: str
    business: str
    pain_point: str
    score: int  # 1-10

extractor = Agent(
    name="Lead Extractor",
    instructions="Extract lead information from the conversation.",
    output_type=LeadInfo,  # forces structured JSON output
)

result = await Runner.run(extractor, "Hi I'm John from Smile Dental, struggling with no-shows")
lead: LeadInfo = result.final_output  # typed!
```

---

## 10. TRACING

```python
from agents import Runner, trace, flush_traces

# Wrap multiple runs in one trace
async def main():
    with trace("My Workflow"):
        result1 = await Runner.run(agent, "Step 1")
        result2 = await Runner.run(agent, "Step 2")

# Disable tracing
import os
os.environ["OPENAI_AGENTS_DISABLE_TRACING"] = "1"

# Or per-run
from agents import RunConfig
result = await Runner.run(agent, "Hello", run_config=RunConfig(tracing_disabled=True))

# Flush immediately (for workers/background tasks)
try:
    with trace("task"):
        result = Runner.run_sync(agent, prompt)
finally:
    flush_traces()
```

View traces at: https://platform.openai.com/traces

---

## 11. CLONING AGENTS

```python
base_agent = Agent(name="Base", instructions="Be helpful.", model="gpt-4o-mini")

formal_agent = base_agent.clone(
    name="Formal Agent",
    instructions="Be very formal and professional.",
)

casual_agent = base_agent.clone(
    name="Casual Agent",
    instructions="Be casual and friendly.",
)
```

---

## 12. FORCING TOOL USE

```python
from agents import Agent, ModelSettings, function_tool

agent = Agent(
    name="Forced Agent",
    tools=[must_use_this],
    model_settings=ModelSettings(
        tool_choice="must_use_this",  # forces this specific tool
        # or: "required" — must use some tool
        # or: "none" — no tools
        # or: "auto" — LLM decides (default)
    )
)
# Note: reset_tool_choice=True (default) resets to "auto" after 1 tool call
# to prevent infinite loops
```

---

## 12b. PRACTICAL PATTERNS (from real-world usage)

### Running in Python scripts vs Jupyter

```python
# In Jupyter Notebook — just use await directly
result = await Runner.run(agent, "Hello")

# In a Python script — must wrap in asyncio.run()
import asyncio

async def main():
    result = await Runner.run(agent, "Hello")
    print(result.final_output)

if __name__ == "__main__":
    asyncio.run(main())
```

### Getting typed output from result

```python
result = await Runner.run(checker, "Who won the World Cup?")

# Option 1: result.final_output already typed when output_type is set
output: SportsCheck = result.final_output

# Option 2: explicit cast
output = result.final_output_as(SportsCheck)
```

### Full step-by-step guardrail pattern

```python
from pydantic import BaseModel
from agents import Agent, Runner, GuardrailFunctionOutput, InputGuardrail, InputGuardrailTripwireTriggered

class TopicCheck(BaseModel):
    is_relevant: bool
    reasoning: str

checker_agent = Agent(
    name="Topic Checker",
    instructions="Check if the question is relevant to [your domain].",
    output_type=TopicCheck,
)

async def topic_guardrail(ctx, agent, input_data):
    result = await Runner.run(checker_agent, input_data, context=ctx.context)
    output = result.final_output_as(TopicCheck)
    return GuardrailFunctionOutput(
        output_info=output,
        tripwire_triggered=not output.is_relevant,
    )

specialist_a = Agent(
    name="Specialist A",
    handoff_description="Handles X questions.",  # ← helps triage decide
    instructions="You are expert in X.",
)

triage = Agent(
    name="Triage Agent",
    instructions="Route to the right specialist.",
    handoffs=[specialist_a],
    input_guardrails=[InputGuardrail(guardrail_function=topic_guardrail)],
)

try:
    result = await Runner.run(triage, "Relevant question here")
    print(result.final_output)
except InputGuardrailTripwireTriggered:
    print("Sorry, out of scope question.")
```

### handoff_description — why it matters

```python
# WITHOUT: triage LLM guesses from agent name alone
billing = Agent(name="Billing")

# WITH: triage LLM knows exactly when to delegate
billing = Agent(
    name="Billing",
    handoff_description="Handles payment, invoice, and subscription questions.",
)
```

---

## 13. MODELS & CONFIGURATION

### Setting the model

```python
# Per agent
agent = Agent(name="Assistant", model="gpt-4o-mini")

# Per run (overrides agent default)
result = await Runner.run(agent, "Hello", run_config=RunConfig(model="gpt-5.5"))

# Global default via env var
# export OPENAI_DEFAULT_MODEL=gpt-5.5
```

### Global SDK configuration (set once at startup)

```python
from agents import (
    set_default_openai_key,
    set_default_openai_client,
    set_default_openai_api,
    set_tracing_disabled,
    set_tracing_export_api_key,
    enable_verbose_stdout_logging,
)
from openai import AsyncOpenAI

# Use a custom key
set_default_openai_key("sk-...")

# Use a custom base URL (OpenAI-compatible endpoints, e.g. Ollama, Azure)
custom_client = AsyncOpenAI(base_url="https://your-endpoint.com/v1", api_key="...")
set_default_openai_client(custom_client)

# Switch to Chat Completions API (default is Responses API)
# Required for most non-OpenAI providers
set_default_openai_api("chat_completions")

# Disable tracing (required when not using OpenAI — tracing requires OpenAI key)
set_tracing_disabled(True)

# Separate tracing key from model key
set_default_openai_client(custom_client, use_for_tracing=False)
set_tracing_export_api_key("sk-tracing-key")

# Debug logging
enable_verbose_stdout_logging()
```

### ModelSettings — advanced options

```python
from agents import ModelSettings

agent = Agent(
    name="Research Agent",
    model="gpt-5.5",
    model_settings=ModelSettings(
        temperature=0.2,
        parallel_tool_calls=False,     # prevent multiple tool calls per turn
        truncation="auto",             # auto-drop old context instead of failing
        store=True,                    # store response server-side
        prompt_cache_retention="24h",  # cache prompt prefix
        extra_args={"service_tier": "flex", "user": "user_123"},  # provider-specific params
    ),
)
```

### Non-OpenAI providers

```python
from agents import Agent, AsyncOpenAI, OpenAIChatCompletionsModel, set_tracing_disabled

# Any OpenAI-compatible endpoint (Ollama, Groq, Together, etc.)
set_tracing_disabled(True)  # disable tracing since no OpenAI key
client = AsyncOpenAI(api_key="your-key", base_url="https://provider.com/v1")
model = OpenAIChatCompletionsModel(model="llama-3", openai_client=client)

agent = Agent(name="Agent", instructions="Be helpful.", model=model)
```

### Mixing models across agents

```python
triage = Agent(name="Triage", model="gpt-5.4-mini", ...)  # fast, cheap
specialist = Agent(name="Specialist", model="gpt-5.5", ...)  # powerful

# Each agent in the same workflow can use a different model
triage_agent = Agent(handoffs=[specialist])
```

### Runner-managed retries

```python
from agents import ModelRetrySettings, ModelSettings, retry_policies

agent = Agent(
    name="Assistant",
    model_settings=ModelSettings(
        retry=ModelRetrySettings(
            max_retries=4,
            backoff={"initial_delay": 0.5, "max_delay": 5.0, "multiplier": 2.0, "jitter": True},
            policy=retry_policies.any(
                retry_policies.provider_suggested(),
                retry_policies.network_error(),
                retry_policies.http_status([429, 500, 502, 503]),
            ),
        )
    ),
)
```

---

## 14. MCP INTEGRATION

MCP (Model Context Protocol) = standardized way to expose external tools to agents.

### Choosing MCP transport

| Need | Use |
|---|---|
| Let OpenAI call a public MCP server | `HostedMCPTool` |
| Connect to your own HTTP server | `MCPServerStreamableHttp` |
| Legacy SSE servers | `MCPServerSse` |
| Local subprocess (npx, python, etc.) | `MCPServerStdio` |
| Multiple servers | `MCPServerManager` |

### Hosted MCP (simplest — OpenAI runs it)

```python
from agents import Agent, HostedMCPTool, Runner

agent = Agent(
    name="Assistant",
    tools=[
        HostedMCPTool(
            tool_config={
                "type": "mcp",
                "server_label": "deepwiki",
                "server_url": "https://mcp.deepwiki.com/mcp",
                "require_approval": "never",  # "always" | "never" | per-tool dict
            }
        )
    ],
)
result = await Runner.run(agent, "Inspect this repo.")
```

### Local HTTP MCP server

```python
from agents.mcp import MCPServerStreamableHttp

async with MCPServerStreamableHttp(
    name="My Server",
    params={
        "url": "http://localhost:8000/mcp",
        "headers": {"Authorization": f"Bearer {token}"},
    },
    cache_tools_list=True,         # cache tool list — set False if tools change
    max_retry_attempts=3,
) as server:
    agent = Agent(name="Assistant", mcp_servers=[server])
    result = await Runner.run(agent, "Use MCP tools.")
```

### Local subprocess MCP (stdio)

```python
from agents.mcp import MCPServerStdio

async with MCPServerStdio(
    name="Filesystem Server",
    params={
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"],
    },
) as server:
    agent = Agent(name="Assistant", mcp_servers=[server])
```

### Tool filtering

```python
from agents.mcp import create_static_tool_filter

server = MCPServerStdio(
    params={...},
    tool_filter=create_static_tool_filter(allowed_tool_names=["read_file", "write_file"]),
    require_approval={"always": {"tool_names": ["delete_file"]}},
)
```

### MCP server manager (multiple servers)

```python
from agents.mcp import MCPServerManager, MCPServerStreamableHttp

servers = [
    MCPServerStreamableHttp(name="calendar", params={"url": "http://localhost:8000/mcp"}),
    MCPServerStreamableHttp(name="docs", params={"url": "http://localhost:8001/mcp"}),
]

async with MCPServerManager(servers) as manager:
    agent = Agent(name="Assistant", mcp_servers=manager.active_servers)
```

---

## 15. HUMAN-IN-THE-LOOP (HITL)

Pause agent execution for human approval of sensitive tool calls.

### Marking tools that need approval

```python
from agents import Agent, Runner, function_tool, RunState

@function_tool(needs_approval=True)
async def delete_record(record_id: int) -> str:
    return f"Deleted {record_id}"

# Conditional approval
async def needs_approval(_ctx, params, _call_id) -> bool:
    return params.get("amount", 0) > 1000

@function_tool(needs_approval=needs_approval)
async def process_payment(amount: float) -> str:
    return f"Processed ${amount}"
```

### Approval flow: pause → inspect → approve/reject → resume

```python
agent = Agent(name="Assistant", tools=[delete_record, process_payment])

result = await Runner.run(agent, "Delete record 42 and process $2000 payment")

while result.interruptions:
    # Serialize state (can store in DB, queue, etc.)
    state = result.to_state()
    stored = state.to_json()  # or state.to_string()

    # Load state later (even in different process)
    state = await RunState.from_json(agent, stored)

    for interruption in result.interruptions:
        # interruption has: .name (tool name), .arguments (params), .agent.name
        approved = input(f"Approve {interruption.name}({interruption.arguments})? [y/N] ")
        if approved.lower() == "y":
            state.approve(interruption)           # one-time approval
            # state.approve(interruption, always_approve=True)  # sticky for future calls
        else:
            state.reject(interruption)
            # state.reject(interruption, rejection_message="Not allowed")

    result = await Runner.run(agent, state)

print(result.final_output)
```

---

## 16. VOICE AGENTS

Turn text agents into voice agents via a 3-step pipeline: STT → Agent → TTS.

```bash
pip install 'openai-agents[voice]'
```

```python
import numpy as np
import sounddevice as sd
from agents import Agent, function_tool
from agents.voice import AudioInput, SingleAgentVoiceWorkflow, VoicePipeline
from agents.extensions.handoff_prompt import prompt_with_handoff_instructions

# Define your agents normally
@function_tool
def get_weather(city: str) -> str:
    """Get weather for a city."""
    return f"Sunny in {city}"

spanish_agent = Agent(
    name="Spanish",
    handoff_description="A Spanish-speaking agent.",
    instructions=prompt_with_handoff_instructions("Speak in Spanish only."),
    model="gpt-5.5",
)

agent = Agent(
    name="Assistant",
    instructions=prompt_with_handoff_instructions(
        "Be polite and concise. If the user speaks Spanish, handoff to the Spanish agent."
    ),
    model="gpt-5.5",
    handoffs=[spanish_agent],
    tools=[get_weather],
)

# Wrap in voice pipeline
pipeline = VoicePipeline(workflow=SingleAgentVoiceWorkflow(agent))

# Run with audio input
buffer = np.zeros(24000 * 3, dtype=np.int16)  # 3 sec audio, 24kHz
audio_input = AudioInput(buffer=buffer)

result = await pipeline.run(audio_input)

# Play output audio
player = sd.OutputStream(samplerate=24000, channels=1, dtype=np.int16)
player.start()

async for event in result.stream():
    if event.type == "voice_stream_event_audio":
        player.write(event.data)
```

**Key concepts:**
- `VoicePipeline` — orchestrates STT → agent → TTS
- `SingleAgentVoiceWorkflow` — wraps any regular agent for voice
- `AudioInput` — numpy int16 array at 24kHz
- Events: `voice_stream_event_audio` — streamed PCM chunks

---

## 17. NODE.JS / JAVASCRIPT USAGE

This section applies to ANY Node.js/JavaScript project using `@openai/agents`.

```javascript
// Installation (requires zod v4)
npm install @openai/agents --legacy-peer-deps
npm install zod@^4.0.0 --legacy-peer-deps

// Basic agent
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";

const myTool = tool({
  name: "my_tool",
  description: "What this tool does",
  parameters: z.object({
    param: z.string().describe("What param is for"),
  }),
  execute: async ({ param }) => {
    const result = await someFunction(param);
    return JSON.stringify(result);
  },
});

export const myAgent = new Agent({
  name: "MyAgent",
  instructions: "You are...",
  tools: [myTool],
});

// Running
const result = await run(myAgent, userMessage);
return result.finalOutput;
```

**Node.js vs Python differences:**

| Feature | Python | Node.js (`@openai/agents`) |
|---|---|---|
| Tool definition | `@function_tool` decorator | `tool({ name, description, parameters, execute })` |
| Parameters | Type hints → auto schema | `z.object({})` — zod schema required |
| Running | `Runner.run()` / `Runner.run_sync()` | `run(agent, input)` |
| Result | `result.final_output` | `result.finalOutput` |
| Guardrails | `@input_guardrail` decorator | Not yet fully supported |
| Hooks | `RunHooks` class | `RunHooks` class |
| Context | `RunContextWrapper` | `RunContext` |

---

## 18. COMMON MISTAKES & FIXES

| Mistake | Symptom | Fix |
|---|---|---|
| Tool never called | Agent ignores tools | Check instructions mention when to use tools; use `tool_choice="required"` if needed |
| Infinite tool loop | Agent keeps calling same tool | Ensure `reset_tool_choice=True` (default); check tool returns useful data |
| Guardrail not blocking | Harmful input passes through | Guardrail only runs for FIRST agent; check `tripwire_triggered` logic |
| Context not available | `wrapper.context` is None | Must pass `context=` to `Runner.run()` |
| Wrong handoff | Agent hands off to wrong specialist | Add `handoff_description` to each agent; use `RECOMMENDED_PROMPT_PREFIX` |
| Non-OpenAI provider 404 | Responses API not supported | Call `set_default_openai_api("chat_completions")` |
| Tracing 401 with non-OpenAI | Wrong API key for traces | Call `set_tracing_disabled(True)` or `set_tracing_export_api_key("sk-openai")` |
| Node: zod schema error | `InputValidationError` on tool | Always use `z.object({})` — never skip parameters schema |
| Node: result undefined | `result.finalOutput` is undefined | Agent may have errored; check `try/catch` around `run()` |
| Node: SDK import fails | `@openai/agents` not found | Run `npm install @openai/agents --legacy-peer-deps` |
| MCP tools not listed | Agent can't see MCP tools | Use `cache_tools_list=False` during dev to always fetch fresh list |
| MCP 401 errors | Auth failure | Pass correct headers in `params: { headers: {...} }` |

---

## 19. QUICK DECISION GUIDE

| Goal | Use |
|---|---|
| Agent responds to user directly | Plain `Agent` with `Runner.run()` |
| Agent calls another agent, keeps control | `Agent.as_tool()` (manager pattern) |
| Agent routes to specialist who takes over | `handoffs=[]` |
| Block harmful input fast (cheap check) | `input_guardrails` + blocking mode |
| Screen agent's output | `output_guardrails` |
| Validate every tool call | `tool_input_guardrails` on `function_tool` |
| Log events, prefetch data | `RunHooks` or `AgentHooks` |
| Share DB/logger/user across tools | `context=` + `RunContextWrapper` |
| Force JSON output | `output_type=PydanticModel` |
| Stream response tokens | `Runner.run_streamed()` |
| Multiple agents, parallel | `asyncio.gather()` |
| Debug agent behavior | OpenAI Traces dashboard |
| Use non-OpenAI model | `set_default_openai_api("chat_completions")` + custom client |
| Connect external tools/services | MCP via `HostedMCPTool` or `MCPServerStdio` |
| Require human approval for sensitive ops | `needs_approval=True` on `function_tool` + HITL loop |
| Voice interface | `VoicePipeline` + `SingleAgentVoiceWorkflow` |
| Retry on rate limits | `ModelRetrySettings` in `ModelSettings` |
