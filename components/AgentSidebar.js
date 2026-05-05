"use client";

export default function AgentSidebar({ agents, selectedAgent, onSelect }) {
  const sortedAgents = [...agents].sort((a, b) => {
    if (a.id === "orchestrator") return -1;
    if (b.id === "orchestrator") return 1;
    return 0;
  });

  return (
    <aside className="sidebar">
      <h2>Agents</h2>
      <div className="agent-list">
        {sortedAgents.map((agent) => (
          <button
            type="button"
            key={agent.id}
            className={`agent-btn ${selectedAgent === agent.id ? "active" : ""} ${
              agent.id === "orchestrator" ? "orchestrator-btn" : ""
            }`}
            onClick={() => onSelect(agent.id)}
          >
            <img src={agent.image} alt={agent.name} className="agent-avatar" />
            <span className="agent-meta">
              <span className="agent-name">{agent.name}</span>
              <span className="agent-role">{agent.role}</span>
              <span className="agent-key">{agent.id}</span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
