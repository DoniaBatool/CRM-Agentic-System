function textHasAny(input, keywords) {
  const normalized = input.toLowerCase();
  return keywords.some((word) => normalized.includes(word));
}

export function resolveAgent(message) {
  const text = (message || "").trim().toLowerCase();

  if (!text) {
    return "ghl-assistant";
  }

  if (textHasAny(text, ["webhook", "trigger", "appointment", "contact"])) {
    return "workflow-tester";
  }

  if (textHasAny(text, ["export", "workflow json", "list workflows", "published"])) {
    return "workflow-export";
  }

  return "ghl-assistant";
}
