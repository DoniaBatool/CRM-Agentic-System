import Anthropic from "@anthropic-ai/sdk";

const COMPRESSION_THRESHOLD = 20;
const KEEP_LAST_N = 6;

const client = new Anthropic();

/**
 * Compress chat history for API context to prevent hallucination.
 *
 * - If messages <= threshold: return as-is
 * - If messages > threshold: summarize older messages, keep last N verbatim
 * Returns { compressed: [...], wasSummarized: bool, summary: string|null }
 */
export async function compressHistory(messages) {
  if (!messages || messages.length <= COMPRESSION_THRESHOLD) {
    return { compressed: messages || [], wasSummarized: false, summary: null };
  }

  const toSummarize = messages.slice(0, messages.length - KEEP_LAST_N);
  const recent = messages.slice(messages.length - KEEP_LAST_N);

  const conversationText = toSummarize
    .map((m) => `[${m.role.toUpperCase()}${m.handledBy ? ` (${m.handledBy})` : ""}]: ${m.text}`)
    .join("\n");

  try {
    const result = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Summarize this conversation history in 3-5 sentences. Focus on: what was asked, what actions were taken, key results or data found (like lead counts, template IDs, errors). Be specific and concise.\n\n${conversationText}`,
        },
      ],
    });

    const summary = result.content[0]?.text || "";
    const summaryMessage = {
      role: "system",
      text: `[Earlier conversation summary]: ${summary}`,
      handledBy: "system",
    };

    return {
      compressed: [summaryMessage, ...recent],
      wasSummarized: true,
      summary,
    };
  } catch (err) {
    console.error("compressHistory error:", err.message);
    // Fallback: just keep last N messages if compression fails
    return {
      compressed: recent,
      wasSummarized: false,
      summary: null,
    };
  }
}

/**
 * Format compressed history for API context payload.
 * Returns a plain array of { role, text } for the API.
 */
export function formatHistoryForContext(compressed) {
  return compressed.map((m) => ({ role: m.role, text: m.text }));
}
