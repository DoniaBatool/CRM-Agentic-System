"use client";

import { useState } from "react";

export default function AgentSidebar({ agents, selectedAgent, onSelect }) {
  const [collapsed, setCollapsed] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { src, name }

  const sortedAgents = [...agents].sort((a, b) => {
    if (a.id === "orchestrator") return -1;
    if (b.id === "orchestrator") return 1;
    return 0;
  });

  return (
    <>
      <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`}>
        <div className="sidebar-header">
          {!collapsed && <h2>Agents</h2>}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "▶" : "◀"}
          </button>
        </div>
        {!collapsed && (
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
                <img
                  src={agent.image}
                  alt={agent.name}
                  className="agent-avatar"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightbox({ src: agent.image, name: agent.name });
                  }}
                />
                <span className="agent-meta">
                  <span className="agent-name">{agent.name}</span>
                  <span className="agent-role">{agent.role}</span>
                  <span className="agent-key">{agent.id}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </aside>

      {lightbox && (
        <>
          {/* invisible backdrop — click outside to close */}
          <div style={{ position: "fixed", inset: 0, zIndex: 2000 }} onClick={() => setLightbox(null)} />
          <div className="avatar-lightbox-popup">
            <button className="avatar-lightbox-close" onClick={() => setLightbox(null)}>✕</button>
            <img src={lightbox.src} alt={lightbox.name} className="avatar-lightbox-img" />
            <p className="avatar-lightbox-name">{lightbox.name}</p>
          </div>
        </>
      )}
    </>
  );
}
