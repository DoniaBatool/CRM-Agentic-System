"use client";

import { useState } from "react";
import { AGENT_BY_ID } from "../lib/agents.js";

export default function ChatPanel({ selectedAgent }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const selectedAgentName = AGENT_BY_ID[selectedAgent]?.name || selectedAgent;

  async function onSubmit(event) {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: message, handledBy: selectedAgentName },
    ]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          agentId: selectedAgent,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Request failed");
      }

      const handledByName = AGENT_BY_ID[data.handledBy]?.name || data.handledBy;
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: data.response,
          handledBy: handledByName,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: `Error: ${error.message}`,
          handledBy: "system",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="chat">
      <div className="chat-header">
        <h1>GHL Agent Hub</h1>
        <span className="badge">Active: {selectedAgentName}</span>
      </div>

      <div className="messages">
        {messages.length === 0 ? (
          <div className="msg agent">
            <span className="msg-label">system</span>
            <p>Select an agent and start chatting.</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div className={`msg ${msg.role}`} key={`${msg.role}-${idx}`}>
              <span className="msg-label">{msg.role === "user" ? "you" : msg.handledBy}</span>
              <p>{msg.text}</p>
            </div>
          ))
        )}
      </div>

      <form className="chat-form" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your request..."
        />
        <button type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send"}
        </button>
      </form>
    </section>
  );
}
