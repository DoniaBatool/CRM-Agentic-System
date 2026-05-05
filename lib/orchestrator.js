function textHasAny(input, keywords) {
  const normalized = input.toLowerCase();
  return keywords.some((word) => normalized.includes(word));
}

export function resolveAgent(message) {
  const text = (message || "").trim().toLowerCase();

  if (!text) {
    return "ghl-assistant";
  }

  if (textHasAny(text, ["learn", "how does", "workflow help"])) {
    return "ghl-assistant";
  }

  if (
    textHasAny(text, [
      "survey",
      "form fill",
      "autofill",
      "auto fill",
      "plan picker",
      "nurtura",
      "onboarding form",
    ])
  ) {
    return "survey-tester";
  }

  if (
    textHasAny(text, [
      "debug",
      "issue",
      "error",
      "bug",
      "stuck",
      "fix workflow",
      "workflow problem",
      "end to end",
      "end-to-end",
      "analyzer",
      "summary report",
      "veronica",
    ])
  ) {
    return "veronica";
  }

  if (textHasAny(text, ["export", "json", "extract", "download workflows"])) {
    return "workflow-export";
  }

  if (
    textHasAny(text, [
      "contact",
      "book",
      "trigger",
      "treatment",
      "consultation",
      "webhook",
    ])
  ) {
    return "workflow-tester";
  }

  return "ghl-assistant";
}

export function routeWithLuna(message) {
  const agentId = resolveAgent(message);
  const routeNames = {
    "ghl-assistant": "Nova",
    veronica: "Veronica",
    "workflow-export": "Echo",
    "workflow-tester": "Sara",
    "survey-tester": "Ayla",
  };

  return {
    agentId,
    routingMessage: `🔄 Routing to [${routeNames[agentId] || "Nova"}]...`,
  };
}
