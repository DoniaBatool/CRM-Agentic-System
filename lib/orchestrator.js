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

  if (
    textHasAny(text, [
      "lead",
      "leads",
      "prospect",
      "scrape",
      "scout",
      "dental clinic",
      "real estate",
      "google maps",
      "find business",
      "search business",
    ])
  ) {
    return "rex";
  }

  if (
    textHasAny(text, [
      "email template",
      "write email",
      "proposal",
      "social post",
      "linkedin post",
      "facebook post",
      "instagram post",
      "ad copy",
      "google ad",
      "meta ad",
      "content",
      "nora",
    ])
  ) {
    return "nora";
  }

  if (
    textHasAny(text, [
      "mailchimp",
      "campaign",
      "drip",
      "email sequence",
      "send email",
      "open rate",
      "click rate",
      "audience",
      "max",
    ])
  ) {
    return "max";
  }

  if (
    textHasAny(text, [
      "appointment",
      "schedule meeting",
      "calendar",
      "booking link",
      "reschedule",
      "cancel meeting",
      "available slots",
      "book meeting",
      "cal",
    ])
  ) {
    return "cal";
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
    rex: "Rex",
    nora: "Nora",
    max: "Max",
    cal: "Cal",
  };

  return {
    agentId,
    routingMessage: `🔄 Routing to [${routeNames[agentId] || "Nova"}]...`,
  };
}
