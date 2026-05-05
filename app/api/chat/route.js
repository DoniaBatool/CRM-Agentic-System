import { runAgent } from "../../../lib/agent-handlers.js";
import { resolveAgent } from "../../../lib/orchestrator.js";

export async function POST(req) {
  try {
    const body = await req.json();
    const message = (body?.message || "").trim();
    const selectedAgent = body?.agentId || "orchestrator";
    const context = body?.context || {};

    if (!message) {
      return Response.json({ error: "Message is required." }, { status: 400 });
    }

    const resolvedAgent =
      selectedAgent === "orchestrator" ? resolveAgent(message) : selectedAgent;

    const result = await runAgent(resolvedAgent, message, context);

    return Response.json({
      selectedAgent,
      resolvedAgent,
      handledBy: result.handledBy,
      response: result.response,
      data: result.data || null,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
