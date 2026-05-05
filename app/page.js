"use client";

import { useState } from "react";
import AgentSidebar from "../components/AgentSidebar.js";
import ChatPanel from "../components/ChatPanel.js";
import { AGENTS } from "../lib/agents.js";

export default function HomePage() {
  const [selectedAgent, setSelectedAgent] = useState("orchestrator");

  return (
    <main className="app-shell">
      <AgentSidebar
        agents={AGENTS}
        selectedAgent={selectedAgent}
        onSelect={setSelectedAgent}
      />
      <ChatPanel selectedAgent={selectedAgent} />
    </main>
  );
}
