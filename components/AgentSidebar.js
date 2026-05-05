"use client";

export default function AgentSidebar({ agents, selectedAgent, onSelect }) {
  return (
    <aside className="sidebar">
      <h2>Agents</h2>
      <div className="agent-list">
        {agents.map((agent) => (
          <button
            type="button"
            key={agent.id}
            className={`agent-btn ${selectedAgent === agent.id ? "active" : ""}`}
            onClick={() => onSelect(agent.id)}
          >
            <span className="agent-name">{agent.name}</span>
            <span className="agent-key">{agent.id}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
