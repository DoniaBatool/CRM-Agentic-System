"use client";

import { useState } from "react";
import { AGENT_BY_ID } from "../lib/agents.js";

export default function ChatPanel({ selectedAgent }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sentByAgent, setSentByAgent] = useState({});
  const [agentContexts, setAgentContexts] = useState({});
  const [echoConfig, setEchoConfig] = useState({
    subAccountName: "",
    locationId: "",
    token: "",
  });
  const [echoWorkflows, setEchoWorkflows] = useState([]);
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState([]);
  const [echoSearch, setEchoSearch] = useState("");
  const [echoExportedFiles, setEchoExportedFiles] = useState([]);
  const [selectedExportedFiles, setSelectedExportedFiles] = useState([]);
  const [surveyConfig, setSurveyConfig] = useState({ targets: [], users: [], settings: null });
  const [selectedTargetIds, setSelectedTargetIds] = useState([]);
  const [userByTarget, setUserByTarget] = useState({});
  const [answersByTarget, setAnswersByTarget] = useState({});

  const selectedAgentName = AGENT_BY_ID[selectedAgent]?.name || selectedAgent;

  async function sendAgentMessage(message, extraContext = {}) {
    const isFirstMessage = !sentByAgent[selectedAgent];
    const rememberedContext = agentContexts[selectedAgent] || {};

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 360000);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        message,
        agentId: selectedAgent,
        context: {
          isFirstMessage,
          ...rememberedContext,
          ...extraContext,
        },
      }),
    }).finally(() => clearTimeout(timeoutId));
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "Request failed");
    }

    if (data.routingMessage) {
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          text: data.routingMessage,
          handledBy: "luna",
        },
      ]);
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
    setSentByAgent((prev) => ({ ...prev, [selectedAgent]: true }));

    if (data?.data?.sessionHints) {
      setAgentContexts((prev) => ({
        ...prev,
        [selectedAgent]: {
          ...(prev[selectedAgent] || {}),
          ...data.data.sessionHints,
        },
      }));
    }

    return data;
  }

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
      await sendAgentMessage(message);
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

  async function loadEchoWorkflows() {
    if (!echoConfig.subAccountName || !echoConfig.locationId || !echoConfig.token) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Please fill sub-account name, location ID, and PIT first.",
          handledBy: "system",
        },
      ]);
      return;
    }

    setLoading(true);
    try {
      const data = await sendAgentMessage("load workflows", {
        action: "list-workflows",
        subAccountName: echoConfig.subAccountName,
        locationId: echoConfig.locationId,
        token: echoConfig.token,
      });
      const workflows = data?.data?.workflows || [];
      setEchoWorkflows(workflows);
      setSelectedWorkflowIds(workflows.map((wf) => wf.id));
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

  async function exportEchoSelected() {
    if (!selectedWorkflowIds.length) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Please select at least one workflow to export.",
          handledBy: "system",
        },
      ]);
      return;
    }

    setLoading(true);
    try {
      await sendAgentMessage("export selected workflows", {
        action: "export-selected",
        subAccountName: echoConfig.subAccountName,
        locationId: echoConfig.locationId,
        token: echoConfig.token,
        workflowIds: selectedWorkflowIds,
      });
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

  async function loadEchoExportedFiles() {
    if (!echoConfig.subAccountName) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Please enter sub-account name first.",
          handledBy: "system",
        },
      ]);
      return;
    }

    setLoading(true);
    try {
      const data = await sendAgentMessage("list exported json files", {
        action: "list-exported-json",
        subAccountName: echoConfig.subAccountName,
      });
      const files = data?.data?.files || [];
      setEchoExportedFiles(files);
      setSelectedExportedFiles(files.map((file) => file.fileName));
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

  function toggleExportedFile(fileName) {
    setSelectedExportedFiles((prev) =>
      prev.includes(fileName)
        ? prev.filter((name) => name !== fileName)
        : [...prev, fileName]
    );
  }

  async function deleteSelectedExportedFiles() {
    if (!selectedExportedFiles.length) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Please select at least one exported JSON file to delete.",
          handledBy: "system",
        },
      ]);
      return;
    }

    setLoading(true);
    try {
      await sendAgentMessage("delete selected exported json files", {
        action: "delete-selected-json",
        subAccountName: echoConfig.subAccountName,
        fileNames: selectedExportedFiles,
      });
      setEchoExportedFiles((prev) =>
        prev.filter((file) => !selectedExportedFiles.includes(file.fileName))
      );
      setSelectedExportedFiles([]);
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

  function toggleWorkflow(id) {
    setSelectedWorkflowIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  const filteredEchoWorkflows = echoWorkflows.filter((wf) => {
    const q = echoSearch.trim().toLowerCase();
    if (!q) return true;
    return wf.name.toLowerCase().includes(q) || wf.id.toLowerCase().includes(q);
  });

  function selectAllFiltered() {
    const filteredIds = filteredEchoWorkflows.map((wf) => wf.id);
    setSelectedWorkflowIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
  }

  function clearAllFiltered() {
    const filteredIds = new Set(filteredEchoWorkflows.map((wf) => wf.id));
    setSelectedWorkflowIds((prev) => prev.filter((id) => !filteredIds.has(id)));
  }

  async function loadSurveyConfig() {
    setLoading(true);
    try {
      const data = await sendAgentMessage("load survey config", {
        action: "load-config",
      });
      const cfg = {
        targets: data?.data?.targets || [],
        users: data?.data?.users || [],
        settings: data?.data?.settings || null,
      };
      setSurveyConfig(cfg);
      setSelectedTargetIds(cfg.targets.map((t) => t.id));
      const defaultUserId = cfg.users[0]?.id || "";
      const nextUserByTarget = {};
      cfg.targets.forEach((t) => {
        nextUserByTarget[t.id] = defaultUserId;
      });
      setUserByTarget(nextUserByTarget);
      setAnswersByTarget({});
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: `Error: ${error.message}`, handledBy: "system" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function toggleTargetSelection(targetId) {
    setSelectedTargetIds((prev) =>
      prev.includes(targetId) ? prev.filter((id) => id !== targetId) : [...prev, targetId]
    );
  }

  async function runSurveyTargetsUi() {
    if (!selectedTargetIds.length) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: "Please select at least one survey/form target.", handledBy: "system" },
      ]);
      return;
    }

    setLoading(true);
    try {
      await sendAgentMessage("run selected survey targets", {
        action: "run-selected-targets",
        targetIds: selectedTargetIds,
        userByTarget,
        answersByTarget,
      });
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: `Error: ${error.message}`, handledBy: "system" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function openManualVerifyForSurveyTargets() {
    if (!selectedTargetIds.length) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: "Please select at least one survey/form target.", handledBy: "system" },
      ]);
      return;
    }

    setLoading(true);
    try {
      await sendAgentMessage("open manual verify for selected targets", {
        action: "open-manual-verify",
        targetIds: selectedTargetIds,
        userByTarget,
        answersByTarget,
      });
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: `Error: ${error.message}`, handledBy: "system" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function continueAfterManualVerify() {
    const surveySessionId = agentContexts[selectedAgent]?.surveySessionId;
    if (!surveySessionId) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: "No active manual verify session found. Please open manual verify first.", handledBy: "system" },
      ]);
      return;
    }

    setLoading(true);
    try {
      await sendAgentMessage("continue auto fill after manual verify", {
        action: "continue-after-verify",
        surveySessionId,
      });
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: `Error: ${error.message}`, handledBy: "system" },
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

      {selectedAgent === "workflow-export" && (
        <div className="echo-panel">
          <div className="echo-grid">
            <input
              placeholder="Sub-account name"
              value={echoConfig.subAccountName}
              onChange={(e) =>
                setEchoConfig((prev) => ({ ...prev, subAccountName: e.target.value }))
              }
            />
            <input
              placeholder="Location ID"
              value={echoConfig.locationId}
              onChange={(e) =>
                setEchoConfig((prev) => ({ ...prev, locationId: e.target.value }))
              }
            />
            <input
              placeholder="Personal Integration Token (PIT)"
              value={echoConfig.token}
              onChange={(e) => setEchoConfig((prev) => ({ ...prev, token: e.target.value }))}
            />
          </div>
          <div className="echo-actions">
            <button type="button" onClick={loadEchoWorkflows} disabled={loading}>
              Load Workflows
            </button>
            <button type="button" onClick={exportEchoSelected} disabled={loading}>
              Export Selected
            </button>
            <button type="button" onClick={loadEchoExportedFiles} disabled={loading}>
              Load Exported JSON
            </button>
            <button type="button" onClick={deleteSelectedExportedFiles} disabled={loading}>
              Delete Selected JSON
            </button>
          </div>
          {echoWorkflows.length > 0 && (
            <div className="echo-workflows">
              <div className="echo-workflow-controls">
                <input
                  placeholder="Search workflows by name or ID"
                  value={echoSearch}
                  onChange={(e) => setEchoSearch(e.target.value)}
                />
                <div className="echo-workflow-buttons">
                  <button type="button" onClick={selectAllFiltered}>
                    Select All
                  </button>
                  <button type="button" onClick={clearAllFiltered}>
                    Clear All
                  </button>
                </div>
              </div>
              <div className="echo-workflow-count">
                Showing {filteredEchoWorkflows.length} of {echoWorkflows.length} workflows
              </div>
              {filteredEchoWorkflows.map((wf) => (
                <label key={wf.id} className="echo-workflow-item">
                  <input
                    type="checkbox"
                    checked={selectedWorkflowIds.includes(wf.id)}
                    onChange={() => toggleWorkflow(wf.id)}
                  />
                  <span>
                    {wf.name} <small>({wf.id})</small>
                  </span>
                </label>
              ))}
            </div>
          )}
          {echoExportedFiles.length > 0 && (
            <div className="echo-workflows">
              <div className="echo-workflow-count">
                Exported JSON files: {echoExportedFiles.length}
              </div>
              {echoExportedFiles.map((file) => (
                <label key={file.fileName} className="echo-workflow-item">
                  <input
                    type="checkbox"
                    checked={selectedExportedFiles.includes(file.fileName)}
                    onChange={() => toggleExportedFile(file.fileName)}
                  />
                  <span>{file.fileName}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedAgent === "survey-tester" && (
        <div className="survey-panel">
          <div className="echo-actions">
            <button type="button" onClick={loadSurveyConfig} disabled={loading}>
              Load Survey Config
            </button>
            <button type="button" onClick={openManualVerifyForSurveyTargets} disabled={loading}>
              Open Manual Verify
            </button>
            <button type="button" onClick={continueAfterManualVerify} disabled={loading}>
              Continue Auto-Fill
            </button>
            <button type="button" onClick={runSurveyTargetsUi} disabled={loading}>
              Run Selected Targets
            </button>
          </div>

          {surveyConfig.targets.length > 0 && (
            <div className="survey-target-list">
              {surveyConfig.targets.map((target) => {
                const requiredQuestions = target?.config?.requiredQuestions || [];
                return (
                  <div key={target.id} className="survey-target-item">
                    <label className="survey-target-header">
                      <input
                        type="checkbox"
                        checked={selectedTargetIds.includes(target.id)}
                        onChange={() => toggleTargetSelection(target.id)}
                      />
                      <span>
                        {target.name} <small>({target.id})</small>
                      </span>
                    </label>
                    <div className="survey-target-meta">{target.url}</div>

                    <select
                      value={userByTarget[target.id] || ""}
                      onChange={(e) =>
                        setUserByTarget((prev) => ({ ...prev, [target.id]: e.target.value }))
                      }
                    >
                      {surveyConfig.users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.firstName} {user.lastName} | {user.email} | {user.phone}
                        </option>
                      ))}
                    </select>

                    {requiredQuestions.map((question) => (
                      <div key={question.id} className="survey-question">
                        <div>{question.question}</div>
                        <select
                          value={answersByTarget[target.id]?.[question.id] || ""}
                          onChange={(e) =>
                            setAnswersByTarget((prev) => ({
                              ...prev,
                              [target.id]: {
                                ...(prev[target.id] || {}),
                                [question.id]: e.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Select answer</option>
                          {(question.options || []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
