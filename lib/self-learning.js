import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

const MEMORY_DIR = ".agent-memory";

if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

export function loadMemory(agentName) {
  const file = path.join(MEMORY_DIR, `${agentName}-memory.json`);
  if (!fs.existsSync(file)) {
    return { interactions: [], systemPrompt: "", lastReflection: "" };
  }

  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return { interactions: [], systemPrompt: "", lastReflection: "" };
  }
}

export function saveInteraction(agentName, userMessage, agentResponse) {
  const memory = loadMemory(agentName);
  memory.interactions.push({
    timestamp: new Date().toISOString(),
    user: userMessage,
    agent: agentResponse,
  });

  const file = path.join(MEMORY_DIR, `${agentName}-memory.json`);
  fs.writeFileSync(file, JSON.stringify(memory, null, 2));

  if (memory.interactions.length % 10 === 0) {
    reflect(agentName, memory).catch(() => {
      // Reflection is best-effort and should never break chat flow.
    });
  }
}

async function reflect(agentName, memory) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const recentInteractions = memory.interactions.slice(-10);

  const reflection = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are ${agentName} agent. Review these last 10 interactions and write an improved system prompt for yourself. Focus on: what users actually need, common patterns, how to respond better.

Interactions:
${JSON.stringify(recentInteractions, null, 2)}

Write ONLY the new system prompt, nothing else.`,
      },
    ],
  });

  memory.systemPrompt = reflection.content?.[0]?.text || memory.systemPrompt;
  memory.lastReflection = new Date().toISOString();

  const file = path.join(MEMORY_DIR, `${agentName}-memory.json`);
  fs.writeFileSync(file, JSON.stringify(memory, null, 2));
}

export function getSystemPrompt(agentName, defaultPrompt) {
  const memory = loadMemory(agentName);
  return memory.systemPrompt || defaultPrompt;
}
