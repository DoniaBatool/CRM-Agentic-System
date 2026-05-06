import { runAgent } from "../../../lib/agent-handlers.js";
import { routeWithLuna } from "../../../lib/orchestrator.js";
import { saveInteraction } from "../../../lib/self-learning.js";
import { compressHistory, formatHistoryForContext } from "../../../lib/compress-history.js";

function shouldShowIntro(message, context) {
  const text = (message || "").trim().toLowerCase();
  return (
    Boolean(context?.forceIntro) ||
    text.includes("what can you do") ||
    text.includes("introduce yourself") ||
    text.includes("your scope")
  );
}

function shouldHandleByLunaDirectly(message, context) {
  const text = (message || "").trim().toLowerCase();
  const greetings = [
    "hi",
    "hello",
    "hey",
    "salam",
    "assalam",
    "how are you",
    "kese ho",
    "kaise ho",
  ];
  return Boolean(context?.isFirstMessage) || greetings.some((greet) => text.includes(greet));
}

export async function POST(req) {
  try {
    const body = await req.json();
    const message = (body?.message || "").trim();
    const selectedAgent = body?.agentId || "orchestrator";
    const context = body?.context || {};

    if (!message && message !== "__action__") {
      return Response.json({ error: "Message is required." }, { status: 400 });
    }

    if (selectedAgent === "orchestrator" && shouldShowIntro(message, context)) {
      const introResult = await runAgent("orchestrator", message, context);
      return Response.json({
        selectedAgent,
        resolvedAgent: "orchestrator",
        routingMessage: null,
        handledBy: introResult.handledBy,
        response: introResult.response,
        data: introResult.data || null,
      });
    }

    if (selectedAgent === "orchestrator" && message !== "__action__" && shouldHandleByLunaDirectly(message, context)) {
      const lunaResult = await runAgent("orchestrator", message, context);
      return Response.json({
        selectedAgent,
        resolvedAgent: "orchestrator",
        routingMessage: null,
        handledBy: lunaResult.handledBy,
        response: lunaResult.response,
        data: lunaResult.data || null,
      });
    }

    const routed =
      selectedAgent === "orchestrator"
        ? routeWithLuna(message)
        : { agentId: selectedAgent, routingMessage: null };
    const resolvedAgent = routed.agentId;

    // Compress chat history server-side before passing to agent
    if (context.chatHistory && context.chatHistory.length > 0) {
      const { compressed } = await compressHistory(context.chatHistory);
      context.chatHistory = formatHistoryForContext(compressed);
    }

    const result = await runAgent(resolvedAgent, message, context);
    if (selectedAgent === "orchestrator") {
      saveInteraction(
        "orchestrator",
        message,
        `${routed.routingMessage || ""}\n${result.response}`.trim()
      );
    }

    return Response.json({
      selectedAgent,
      resolvedAgent,
      routingMessage: routed.routingMessage,
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
