export const AGENTS = [
  {
    id: "ghl-assistant",
    name: "GHL Assistant (NotebookLM)",
    description: "Answers knowledge questions via NotebookLM.",
  },
  {
    id: "workflow-tester",
    name: "Workflow Tester",
    description: "Triggers webhook tests from ghl-webhook-trigger.js.",
  },
  {
    id: "workflow-export",
    name: "Workflow Export Agent",
    description: "Exports workflows from workflow-agent.js.",
  },
  {
    id: "orchestrator",
    name: "Orchestrator",
    description: "Routes requests to the best agent.",
  },
];

export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((agent) => [agent.id, agent]));
