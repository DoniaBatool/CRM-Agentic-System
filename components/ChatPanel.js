"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AGENT_BY_ID } from "../lib/agents.js";
import { loadChatHistory, saveChatMessages, clearChatHistory, loadLeadsFromSupabase, saveLeadsToSupabase, clearLeadsFromSupabase } from "../lib/supabase.js";

// Sara built-in events — static, never fetched from API
const SARA_BUILT_IN_LABELS = [
  { label: "Treatment Booked",                  eventType: "treatment",             action: "booked" },
  { label: "Treatment Rescheduled",             eventType: "treatment",             action: "rescheduled" },
  { label: "Personal Consultation Booked",      eventType: "Personal Consultation", action: "booked" },
  { label: "Personal Consultation Rescheduled", eventType: "Personal Consultation", action: "rescheduled" },
];

export default function ChatPanel({ selectedAgent }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
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
  const [echoAvailableSubAccounts, setEchoAvailableSubAccounts] = useState([]);
  const [echoTab, setEchoTab] = useState("workflows"); // "workflows" | "exported"
  const [selectedExportedFiles, setSelectedExportedFiles] = useState([]);
  const [surveyConfig, setSurveyConfig] = useState({ targets: [], users: [], settings: null });
  const [selectedTargetIds, setSelectedTargetIds] = useState([]);
  const [userByTarget, setUserByTarget] = useState({});
  const [answersByTarget, setAnswersByTarget] = useState({});

  // Custom confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }

  /** Themed replacement for window.confirm — returns a Promise<boolean> */
  function showConfirm(message) {
    return new Promise((resolve) => {
      setConfirmDialog({
        message,
        onConfirm: (result) => {
          setConfirmDialog(null);
          resolve(result);
        },
      });
    });
  }

  // Rex state
  const [rexIndustry, setRexIndustry] = useState("");
  const [rexCity, setRexCity] = useState("");
  const [rexMaxResults, setRexMaxResults] = useState(5);
  const [rexLeads, setRexLeads] = useState([]);
  const [rexSelectedIds, setRexSelectedIds] = useState([]);
  const [rexFilterIndustry, setRexFilterIndustry] = useState("");
  const [rexFilterCity, setRexFilterCity] = useState("");
  const [rexFilterEmail, setRexFilterEmail] = useState("all"); // "all" | "with-email" | "no-email"
  const [rexSortBy, setRexSortBy] = useState("scraped"); // "scraped" | "name" | "rating" | "city"
  const [rexSortDir, setRexSortDir] = useState("desc");

  // Nora state
  const [noraTab, setNoraTab] = useState("email");
  const [noraIndustry, setNoraIndustry] = useState("");
  const [noraField, setNoraField] = useState({ platform: "linkedin", topic: "", offer: "", targetAudience: "", leadName: "", businessName: "", painPoint: "", senderName: "" });
  const [noraTemplates, setNoraTemplates] = useState([]);
  const [noraOutput, setNoraOutput] = useState("");

  // Max state
  const [maxLeads, setMaxLeads] = useState([]);
  const [maxSelectedIds, setMaxSelectedIds] = useState([]);
  const [maxSequence, setMaxSequence] = useState("new_lead_sequence");
  const [maxTab, setMaxTab] = useState("leads"); // leads | history
  const [maxHistory, setMaxHistory] = useState([]);
  const [maxHistoryLeadId, setMaxHistoryLeadId] = useState("");
  const [maxStatus, setMaxStatus] = useState(null); // { emailConnected, whatsappConnected }
  const [maxStageFilter, setMaxStageFilter] = useState("");

  // Cal state
  const [calSlots, setCalSlots] = useState([]);
  const [calSelectedSlot, setCalSelectedSlot] = useState(null);
  const [calAppointments, setCalAppointments] = useState([]);
  const [calBookingForm, setCalBookingForm] = useState({ summary: "", attendeeEmail: "", attendeeName: "" });
  const [calBookingLink, setCalBookingLink] = useState("");

  // Sara state
  const [saraContactQuery, setSaraContactQuery]       = useState("");
  const [saraContacts, setSaraContacts]               = useState([]);
  const [saraSelectedContact, setSaraSelectedContact] = useState(null);
  const [saraEventType, setSaraEventType]             = useState("treatment");
  const [saraAction, setSaraAction]                   = useState("booked");
  const [saraCustomUrl, setSaraCustomUrl]             = useState("");
  const [saraDatetime, setSaraDatetime]               = useState("");
  const [saraHistory, setSaraHistory]                 = useState([]);
  const [saraHistoryTab, setSaraHistoryTab]           = useState(false); // false = builder, true = history
  const [saraHealthResults, setSaraHealthResults]     = useState([]);
  const [saraCustomEvents, setSaraCustomEvents]       = useState([]);
  const [saraTemplates, setSaraTemplates]             = useState([]);
  const [saraBuiltInMap, setSaraBuiltInMap]           = useState({});
  // Built-in labels are static — no API call needed
  const saraBuiltInLabels = SARA_BUILT_IN_LABELS;
  const [saraBulkMode, setSaraBulkMode]               = useState(false);
  const [saraBulkSelected, setSaraBulkSelected]       = useState([]);
  const [saraLoading, setSaraLoading]                 = useState(false);
  const [saraShowCustomEventForm, setSaraShowCustomEventForm] = useState(false);
  const [saraNewEvent, setSaraNewEvent]               = useState({ eventLabel: "", eventType: "", action: "booked", webhookUrl: "" });
  const [saraShowTemplateSave, setSaraShowTemplateSave] = useState(false);
  const [saraTemplateName, setSaraTemplateName]       = useState("");

  // Dash state
  const [dashBoard, setDashBoard] = useState(null); // { stages: {stage: [leads]}, totalCount }
  const [dashLoading, setDashLoading] = useState(false);
  const [dashSelectedLead, setDashSelectedLead] = useState(null); // lead object for modal
  const [dashLeadDetail, setDashLeadDetail] = useState(null); // { lead, history }
  const [dashDetailLoading, setDashDetailLoading] = useState(false);
  const [dashNoteInput, setDashNoteInput] = useState("");
  const [dashNoteSubmitting, setDashNoteSubmitting] = useState(false);
  const [dashMoveStage, setDashMoveStage] = useState(null); // stage being moved to
  const [dashMoveError, setDashMoveError] = useState(null); // error message for failed move
  const [dashDragOver, setDashDragOver] = useState(null);   // stage key currently hovered

  // Iris state
  const [irisForm, setIrisForm] = useState({
    name: "", email: "", phone: "", clinic_name: "", city: "",
    source: "survey", website_url: "", message: "",
  });
  const [irisSubmitting, setIrisSubmitting] = useState(false);
  const [irisSubmitResult, setIrisSubmitResult] = useState(null); // { success, message }
  const [irisPipelineCounts, setIrisPipelineCounts] = useState(null);
  const [irisRecentLeads, setIrisRecentLeads] = useState([]);
  const [irisTab, setIrisTab] = useState("form"); // "form" | "pipeline"
  const [irisCountsLoading, setIrisCountsLoading] = useState(false);

  // Echo panel resize state
  const [echoPanelWidth, setEchoPanelWidth] = useState(56); // left panel % width
  const isDragging = useRef(false);
  const chatSectionRef = useRef(null);

  // Veronica panel collapse/expand toggle
  const [veronicaPanelExpanded, setVeronicaPanelExpanded] = useState(true);

  // Sara panel collapse/expand toggle
  const [saraPanelExpanded, setSaraPanelExpanded] = useState(true);

  // Sara sub-account state
  const [saraSubAccounts, setSaraSubAccounts]           = useState([]);
  const [saraSelectedSubAccount, setSaraSelectedSubAccount] = useState(null);
  const [saraSubAccountWebhooks, setSaraSubAccountWebhooks] = useState([]); // [{event_type, action, webhook_url, ...}]
  const [saraShowAddSubAccount, setSaraShowAddSubAccount] = useState(false);
  const [saraNewSubAccount, setSaraNewSubAccount]       = useState({ name: "", locationId: "", pitToken: "" });
  const [saraAddingSubAccount, setSaraAddingSubAccount] = useState(false);
  const [saraSetWebhookFor, setSaraSetWebhookFor]       = useState(null); // { event_type, action } of row being edited
  const [saraSetWebhookInput, setSaraSetWebhookInput]   = useState("");

  const onResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev) => {
      if (!isDragging.current || !chatSectionRef.current) return;
      const rect = chatSectionRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setEchoPanelWidth(Math.min(Math.max(pct, 25), 75));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  // Veronica workflow menu state (legacy — kept for backward compat)
  const [veronicaMenuStep, setVeronicaMenuStep] = useState(null);
  const [veronicaSelectedQuestion, setVeronicaSelectedQuestion] = useState(null);
  const [veronicaWorkflowFiles, setVeronicaWorkflowFiles] = useState([]);
  const [veronicaSelectedFile, setVeronicaSelectedFile] = useState(null);

  // Veronica folder browser state (new panel)
  const [veronicaSubAccounts, setVeronicaSubAccounts] = useState([]);
  const [veronicaSelectedFolder, setVeronicaSelectedFolder] = useState(null);
  const [veronicaFolderWorkflows, setVeronicaFolderWorkflows] = useState([]);
  const [veronicaSelectedWorkflow, setVeronicaSelectedWorkflow] = useState(null);
  const [veronicaDebugIssue, setVeronicaDebugIssue] = useState("");
  const [veronicaFolderLoading, setVeronicaFolderLoading] = useState(false);

  const selectedAgentName = AGENT_BY_ID[selectedAgent]?.name || selectedAgent;

  // Load chat history from Supabase when agent changes
  useEffect(() => {
    if (!selectedAgent) return;
    let cancelled = false;
    setHistoryLoading(true);
    setMessages([]);
    loadChatHistory(selectedAgent).then((history) => {
      if (!cancelled) {
        setMessages(history);
        if (history.length > 0) {
          setSentByAgent((prev) => ({ ...prev, [selectedAgent]: true }));
        }
      }
      setHistoryLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedAgent]);

  // Auto-load Dash board when agent switches to dash
  useEffect(() => {
    if (selectedAgent === "dash") {
      setDashBoard(null);
      setDashSelectedLead(null);
      dashLoadBoard();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent]);

  // Auto-load Veronica sub-accounts when agent switches to veronica
  useEffect(() => {
    if (selectedAgent === "veronica") {
      setVeronicaSubAccounts([]);
      setVeronicaSelectedFolder(null);
      setVeronicaFolderWorkflows([]);
      setVeronicaSelectedWorkflow(null);
      veronicaLoadSubAccounts();
    }
    if (selectedAgent === "max") {
      maxLoadStatus();
      maxLoadLeads();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent]);

  async function callAgentAPI(message, extraContext = {}) {
    const isFirstMessage = !sentByAgent[selectedAgent];
    const rememberedContext = agentContexts[selectedAgent] || {};

    // Send last 30 messages to API; server handles compression via Anthropic
    const chatHistory = messages.slice(-30).map((m) => ({ role: m.role, text: m.text }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 360000);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        message,
        agentId: selectedAgent,
        context: { isFirstMessage, ...rememberedContext, ...extraContext, chatHistory },
      }),
    }).finally(() => clearTimeout(timeoutId));
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Request failed");
    if (data?.data?.sessionHints) {
      setAgentContexts((prev) => ({
        ...prev,
        [selectedAgent]: { ...(prev[selectedAgent] || {}), ...data.data.sessionHints },
      }));
    }
    return data;
  }

  async function clearChat() {
    const confirmed = await showConfirm(
      `Clear all chat history for ${selectedAgentName}?\n\nThis cannot be undone.`
    );
    if (!confirmed) return;
    setMessages([]);
    await clearChatHistory(selectedAgent);
  }

  // Sends message AND adds response to chat + saves to Supabase
  async function sendAgentMessage(message, extraContext = {}) {
    const userMsg = { role: "user", text: message, handledBy: selectedAgentName };
    setMessages((prev) => [...prev, userMsg]);

    let data;
    try {
      data = await callAgentAPI(message, extraContext);
    } catch (err) {
      // API failed — save what we have and rethrow so onSubmit can show the error
      saveChatMessages(selectedAgent, [userMsg]).catch(() => {});
      throw err;
    }

    const newMessages = [];
    if (data.routingMessage) {
      newMessages.push({ role: "system", text: data.routingMessage, handledBy: "luna" });
    }
    const handledByName = AGENT_BY_ID[data.handledBy]?.name || data.handledBy;
    const agentMsg = { role: "agent", text: data.response, handledBy: handledByName, cardData: data.data || null };
    newMessages.push(agentMsg);

    setMessages((prev) => [...prev, ...newMessages]);
    setSentByAgent((prev) => ({ ...prev, [selectedAgent]: true }));

    // Show Veronica workflow menu if response requests it (legacy)
    if (data.data?.type === "workflow_menu") {
      setVeronicaMenuStep("questions");
      setVeronicaSelectedQuestion(null);
      setVeronicaWorkflowFiles([]);
      setVeronicaSelectedFile(null);
    }
    if (data.data?.type === "workflow_files") {
      setVeronicaWorkflowFiles(data.data.files || []);
      setVeronicaMenuStep("files");
    }
    if (data.data?.type === "workflow_result") {
      setVeronicaMenuStep(null);
      setVeronicaSelectedFile(null);
    }
    // Sync panel when sub-accounts returned
    if (data.data?.type === "veronica_sub_accounts") {
      setVeronicaSubAccounts(data.data.subAccounts || []);
    }

    // Save to Supabase in background
    saveChatMessages(selectedAgent, [userMsg, ...newMessages]).catch(console.error);

    // Dash: auto-refresh board after any chat response (moves happen via SDK)
    if (selectedAgent === "dash") {
      dashLoadBoard().catch(() => {});
    }

    return data;
  }

  // Silently calls agent action — no chat message added
  async function callAction(extraContext = {}) {
    const data = await callAgentAPI("__action__", extraContext);
    setSentByAgent((prev) => ({ ...prev, [selectedAgent]: true }));
    return data;
  }

  async function onSubmit(event) {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) return;
    setInput("");
    setLoading(true);
    try {
      // If Veronica is active and message mentions "workflow", show the menu
      const isVeronicaActive = selectedAgent === "veronica" || selectedAgent === "orchestrator";
      const isWorkflowMsg = isVeronicaActive && message.toLowerCase().includes("workflow");
      if (isWorkflowMsg && veronicaMenuStep === null) {
        // Show the menu — call veronica with workflow-menu action
        await sendAgentMessage(message, { action: "workflow-menu" });
        return;
      }
      await sendAgentMessage(message);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: `Error: ${error.message}`, handledBy: "system" },
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
      if (workflows.length > 0) setEchoTab("workflows");
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

  /** Convert a GHL workflow name to the saved filename (mirrors server logic) */
  function workflowFileName(wfName) {
    return wfName.replace(/[<>:"/\\|?*]+/g, "_") + ".json";
  }

  async function resolveSubAccountName() {
    // Get available folders and auto-select if possible
    const subData = await sendAgentMessage("list sub accounts", { action: "list-sub-accounts" });
    const available = subData?.data?.subAccounts || [];
    setEchoAvailableSubAccounts(available);
    let subName = echoConfig.subAccountName.trim();
    if (!subName && available.length === 1) {
      subName = available[0];
      setEchoConfig((prev) => ({ ...prev, subAccountName: subName }));
    } else if (!subName) {
      throw new Error(
        available.length
          ? `Please select a sub-account. Available: ${available.join(", ")}`
          : "No exported sub-account folders found. Export workflows first."
      );
    }
    return subName;
  }

  async function loadEchoExportedFiles() {
    // If workflows are selected in the GHL list → show their JSONs in chat
    if (selectedWorkflowIds.length > 0) {
      setLoading(true);
      try {
        const subName = await resolveSubAccountName();
        for (const wfId of selectedWorkflowIds) {
          const wf = echoWorkflows.find((w) => w.id === wfId);
          if (!wf) continue;
          const fileName = workflowFileName(wf.name);
          try {
            await sendAgentMessage(`view json: ${fileName}`, {
              action: "load-json-content",
              subAccountName: subName,
              fileName,
            });
          } catch {
            setMessages((prev) => [
              ...prev,
              {
                role: "agent",
                text: `❌ JSON not available for "${wf.name}" — export it first.`,
                handledBy: "system",
              },
            ]);
          }
        }
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          { role: "agent", text: `Error: ${error.message}`, handledBy: "system" },
        ]);
      } finally {
        setLoading(false);
      }
      return;
    }

    // No workflow selected → list all exported files in the folder
    setLoading(true);
    try {
      const subName = await resolveSubAccountName();
      const data = await sendAgentMessage("list exported json files", {
        action: "list-exported-json",
        subAccountName: subName,
      });
      const files = data?.data?.files || [];
      setEchoExportedFiles(files);
      setSelectedExportedFiles([]);
      if (files.length > 0) setEchoTab("exported");
      if (data?.data?.outputDir) {
        const resolvedFolder = data.data.outputDir.replace(/^workflows\//, "");
        if (resolvedFolder !== subName.toLowerCase()) {
          setEchoConfig((prev) => ({ ...prev, subAccountName: resolvedFolder }));
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: `Error: ${error.message}`, handledBy: "system" },
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

  async function viewExportedFileJson(file) {
    setLoading(true);
    try {
      await sendAgentMessage(`view json: ${file.fileName}`, {
        action: "load-json-content",
        subAccountName: echoConfig.subAccountName,
        fileName: file.fileName,
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

  async function deleteSelectedExportedFiles() {
    // Determine which files to delete:
    // Priority 1 — workflows selected in GHL list → derive filenames from workflow names
    // Priority 2 — files checked in the exported-files list
    let filesToDelete = selectedExportedFiles;
    if (selectedWorkflowIds.length > 0) {
      filesToDelete = selectedWorkflowIds
        .map((id) => echoWorkflows.find((w) => w.id === id))
        .filter(Boolean)
        .map((wf) => workflowFileName(wf.name));
    }

    if (!filesToDelete.length) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Select workflows from the list (or check files below) to delete their JSON.",
          handledBy: "system",
        },
      ]);
      return;
    }

    const confirmed = await showConfirm(
      `Delete ${filesToDelete.length} JSON file${filesToDelete.length !== 1 ? "s" : ""}?\n\n${filesToDelete.join("\n")}\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const subName = echoConfig.subAccountName || (await resolveSubAccountName());
      await sendAgentMessage("delete selected exported json files", {
        action: "delete-selected-json",
        subAccountName: subName,
        fileNames: filesToDelete,
      });
      setEchoExportedFiles((prev) =>
        prev.filter((file) => !filesToDelete.includes(file.fileName))
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

  // ── Veronica workflow menu handlers ─────────────────────────────────────────
  async function veronicaSelectQuestion(q) {
    setVeronicaSelectedQuestion(q);
    if (q === 3) {
      // Route to Echo — just inform user
      setMessages((prev) => [...prev, {
        role: "agent",
        text: "To export a workflow, switch to Echo agent from the sidebar. Echo connects to your GHL sub-account and exports workflow JSONs.",
        handledBy: "Veronica",
      }]);
      setVeronicaMenuStep(null);
      return;
    }
    // Load workflow file list for Q1 and Q2
    setLoading(true);
    try {
      const data = await callAgentAPI("__action__", { action: "list-workflow-files" });
      const files = data?.data?.files || [];
      setVeronicaWorkflowFiles(files);
      setVeronicaMenuStep("files");
      if (files.length === 0) {
        setMessages((prev) => [...prev, {
          role: "agent",
          text: "No exported workflows found in the workflows/ folder. Use Echo to export workflows first.",
          handledBy: "Veronica",
        }]);
        setVeronicaMenuStep(null);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  async function veronicaSubmitWorkflow() {
    if (!veronicaSelectedFile) return;
    const action = veronicaSelectedQuestion === 2 ? "debug-workflow" : "explain-workflow";
    setLoading(true);
    try {
      await sendAgentMessage(
        veronicaSelectedQuestion === 2
          ? `Debug workflow: ${veronicaSelectedFile.fileName}`
          : `Explain workflow: ${veronicaSelectedFile.fileName}`,
        { action, filePath: veronicaSelectedFile.fullPath, fileName: veronicaSelectedFile.fileName }
      );
    } catch (e) {
      setMessages((prev) => [...prev, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  // ── Veronica folder browser handlers ────────────────────────────────────────
  async function veronicaLoadSubAccounts() {
    setVeronicaFolderLoading(true);
    setVeronicaSelectedFolder(null);
    setVeronicaFolderWorkflows([]);
    setVeronicaSelectedWorkflow(null);
    try {
      const data = await callAgentAPI("__action__", { action: "browse-sub-accounts" });
      setVeronicaSubAccounts(data?.data?.subAccounts || []);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "agent", text: `Error loading folders: ${e.message}`, handledBy: "system" }]);
    } finally { setVeronicaFolderLoading(false); }
  }

  async function veronicaSelectFolder(folderName) {
    setVeronicaSelectedFolder(folderName);
    setVeronicaSelectedWorkflow(null);
    setVeronicaFolderLoading(true);
    try {
      const data = await callAgentAPI("__action__", { action: "list-workflows-in-folder", folderName });
      setVeronicaFolderWorkflows(data?.data?.workflows || []);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "agent", text: `Error loading workflows: ${e.message}`, handledBy: "system" }]);
    } finally { setVeronicaFolderLoading(false); }
  }

  async function veronicaRunExplain() {
    if (!veronicaSelectedWorkflow) return;
    setLoading(true);
    try {
      await sendAgentMessage(
        `Explain workflow: ${veronicaSelectedWorkflow.workflowName}`,
        { action: "explain-workflow", filePath: veronicaSelectedWorkflow.fullPath, fileName: veronicaSelectedWorkflow.fileName }
      );
    } catch (e) {
      setMessages((prev) => [...prev, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  async function veronicaRunDebug() {
    if (!veronicaSelectedWorkflow) return;
    const issue = veronicaDebugIssue.trim() || "Find any issues or problems.";
    setLoading(true);
    try {
      await sendAgentMessage(
        `Debug workflow: ${veronicaSelectedWorkflow.workflowName}. Issue: ${issue}`,
        { action: "debug-workflow", filePath: veronicaSelectedWorkflow.fullPath, fileName: veronicaSelectedWorkflow.fileName }
      );
    } catch (e) {
      setMessages((prev) => [...prev, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  // ── Rex helpers ──────────────────────────────────────────────────────────────
  function getFilteredSortedLeads() {
    let leads = [...rexLeads];
    if (rexFilterIndustry) {
      const q = rexFilterIndustry.toLowerCase();
      leads = leads.filter((l) =>
        (l.category || "").toLowerCase().includes(q) ||
        (l.industry || "").toLowerCase().includes(q) ||
        (l.name || "").toLowerCase().includes(q)
      );
    }
    if (rexFilterCity) {
      const q = rexFilterCity.toLowerCase();
      leads = leads.filter((l) => (l.city || "").toLowerCase().includes(q));
    }
    if (rexFilterEmail === "with-email") leads = leads.filter((l) => l.email);
    if (rexFilterEmail === "no-email") leads = leads.filter((l) => !l.email);

    leads.sort((a, b) => {
      let valA, valB;
      if (rexSortBy === "name") { valA = a.name || ""; valB = b.name || ""; }
      else if (rexSortBy === "rating") { valA = a.rating || 0; valB = b.rating || 0; }
      else if (rexSortBy === "city") { valA = a.city || ""; valB = b.city || ""; }
      else { valA = a.scrapedAt || ""; valB = b.scrapedAt || ""; }
      if (valA < valB) return rexSortDir === "asc" ? -1 : 1;
      if (valA > valB) return rexSortDir === "asc" ? 1 : -1;
      return 0;
    });
    return leads;
  }

  function rexToggleSort(field) {
    if (rexSortBy === field) setRexSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setRexSortBy(field); setRexSortDir("asc"); }
  }

  // ── Dash handlers ───────────────────────────────────────────────────────────
  async function dashLoadBoard() {
    setDashLoading(true);
    try {
      const res = await callAction({ action: "get-board" });
      setDashBoard(res.data);
    } catch (e) { console.warn("dash board:", e); }
    finally { setDashLoading(false); }
  }

  async function dashOpenLead(lead) {
    setDashSelectedLead(lead);
    setDashLeadDetail(null);
    setDashNoteInput("");
    setDashDetailLoading(true);
    try {
      const res = await callAction({ action: "get-lead-detail", leadId: lead.id });
      setDashLeadDetail(res.data);
    } catch (e) { console.warn("dash detail:", e); }
    finally { setDashDetailLoading(false); }
  }

  async function dashMoveLeadStage(leadId, toStage) {
    if (!leadId || !toStage) { console.error("dashMoveLeadStage: missing leadId or toStage", { leadId, toStage }); return; }
    setDashMoveStage(toStage);
    setDashMoveError(null);
    try {
      const res = await callAction({ action: "move-stage", leadId, toStage });
      console.log("move-stage response:", res);
      if (res?.data?.success === false) {
        setDashMoveError("Move failed: " + (res?.response || "unknown error"));
        return;
      }
      await dashLoadBoard();
      // refresh detail if modal is open for this lead
      if (dashSelectedLead?.id === leadId) {
        const detail = await callAction({ action: "get-lead-detail", leadId });
        setDashLeadDetail(detail.data);
        setDashSelectedLead(prev => ({ ...prev, stage: toStage }));
      }
    } catch (e) {
      console.error("dash move error:", e);
      setDashMoveError("Move failed: " + (e?.message || "network error"));
    }
    finally { setDashMoveStage(null); }
  }

  async function dashAddNote(leadId) {
    if (!dashNoteInput.trim()) return;
    setDashNoteSubmitting(true);
    try {
      await callAction({ action: "add-note", leadId, note: dashNoteInput });
      setDashNoteInput("");
      const res = await callAction({ action: "get-lead-detail", leadId });
      setDashLeadDetail(res.data);
    } catch (e) { console.warn("dash note:", e); }
    finally { setDashNoteSubmitting(false); }
  }

  // ── Iris handlers ───────────────────────────────────────────────────────────
  async function irisSubmitLead() {
    if (!irisForm.name.trim()) { setIrisSubmitResult({ success: false, message: "Name is required." }); return; }
    if (!irisForm.email.trim() && !irisForm.phone.trim()) { setIrisSubmitResult({ success: false, message: "Email or phone is required." }); return; }
    setIrisSubmitting(true);
    setIrisSubmitResult(null);
    try {
      const res = await callAction({ action: "submit-lead", ...irisForm });
      const d = res.data;
      if (d?.success) {
        setIrisSubmitResult({ success: true, message: `✅ Lead ${d.isNew ? "added" : "already exists"} — Stage: ${d.stage}` });
        setIrisForm({ name: "", email: "", phone: "", clinic_name: "", city: "", source: "survey", website_url: "", message: "" });
        irisLoadPipeline();
      } else {
        setIrisSubmitResult({ success: false, message: d?.errors?.join(", ") || "Failed to save lead." });
      }
    } catch (e) {
      setIrisSubmitResult({ success: false, message: e.message });
    } finally {
      setIrisSubmitting(false);
    }
  }

  async function irisLoadPipeline() {
    setIrisCountsLoading(true);
    try {
      const res = await callAction({ action: "get-pipeline-counts" });
      setIrisPipelineCounts(res.data?.counts || null);
      const res2 = await callAction({ action: "get-recent-leads" });
      setIrisRecentLeads(res2.data?.leads || []);
    } catch (e) { console.warn("iris pipeline load:", e); }
    finally { setIrisCountsLoading(false); }
  }

  // ── Rex handlers ────────────────────────────────────────────────────────────
  async function rexSearch() {
    if (!rexIndustry) return;
    setLoading(true);
    try {
      const data = await sendAgentMessage(`Searching for ${rexIndustry} leads in ${rexCity}...`, {
        action: "search", industry: rexIndustry, city: rexCity, maxResults: rexMaxResults,
      });
      const newLeads = data?.data?.leads || [];
      // Merge with existing leads (dedupe by id)
      setRexLeads((prev) => {
        const existingIds = new Set(prev.map((l) => l.id));
        const merged = [...prev, ...newLeads.filter((l) => !existingIds.has(l.id))];
        // Save to Supabase in background
        if (newLeads.length > 0) saveLeadsToSupabase(newLeads).catch(console.error);
        return merged;
      });
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  async function rexGetLeads() {
    setLoading(true);
    try {
      // Try Supabase first
      let leads = null;
      try {
        leads = await loadLeadsFromSupabase();
      } catch (sbErr) {
        console.warn("Supabase load failed, falling back to JSON:", sbErr.message);
      }

      if (leads && leads.length > 0) {
        setRexLeads(leads);
      } else {
        // Fallback: load from local JSON file via API
        const data = await callAction({ action: "get-leads" });
        const jsonLeads = data?.data?.leads || [];
        setRexLeads(jsonLeads);
        // If Supabase is available, save them there too
        if (jsonLeads.length > 0) {
          saveLeadsToSupabase(jsonLeads).catch(console.error);
        }
        if (jsonLeads.length === 0) {
          setMessages((p) => [...p, { role: "agent", text: "No saved leads found. Use Search Leads to scrape new ones.", handledBy: "Rex" }]);
        }
      }
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error loading leads: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  function rexExportCsv() {
    const leads = getFilteredSortedLeads();
    if (!leads.length) return;
    const headers = ["name", "email", "phone", "address", "city", "website", "rating", "category", "source"];
    const rows = leads.map((l) =>
      headers.map((h) => JSON.stringify(l[h] ?? "")).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "rex-leads.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function rexClearLeads() {
    if (!confirm("Clear ALL saved leads? This cannot be undone.")) return;
    setLoading(true);
    try {
      await Promise.all([
        callAction({ action: "clear-leads" }),
        clearLeadsFromSupabase(),
      ]);
      setRexLeads([]);
      setRexSelectedIds([]);
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  function rexToggleLead(id) {
    setRexSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  // ── Nora handlers ────────────────────────────────────────────────────────────
  async function noraGenerate() {
    setLoading(true);
    setNoraOutput("");
    try {
      let action, extra = {};
      if (noraTab === "email") { action = "generate-email-templates"; extra = { industry: noraIndustry, senderName: noraField.senderName }; }
      else if (noraTab === "proposal") { action = "generate-proposal"; extra = { industry: noraIndustry, leadName: noraField.leadName, businessName: noraField.businessName, painPoint: noraField.painPoint, senderName: noraField.senderName }; }
      else if (noraTab === "social") { action = "generate-social-post"; extra = { industry: noraIndustry, platform: noraField.platform, topic: noraField.topic }; }
      else { action = "generate-ad-copy"; extra = { industry: noraIndustry, platform: noraField.platform, offer: noraField.offer, targetAudience: noraField.targetAudience }; }

      const data = await sendAgentMessage(`generate ${noraTab}`, { action, ...extra });
      const t = data?.data?.template;
      if (t) {
        const out = t.emails ? Object.entries(t.emails).map(([k, v]) => `=== ${k.toUpperCase()} ===\n${v}`).join("\n\n") : t.content || "";
        setNoraOutput(out);
        // (no longer sets maxTemplateId — Max uses Brevo sequences now)
      }
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  async function noraLoadTemplates() {
    setLoading(true);
    try {
      const data = await callAction({ action: "list-templates" });
      setNoraTemplates(data?.data?.templates || []);
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  async function noraDeleteTemplate(id) {
    setLoading(true);
    try {
      await callAction({ action: "delete-template", templateId: id });
      setNoraTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  // ── Max handlers ─────────────────────────────────────────────────────────────
  async function maxLoadLeads() {
    setLoading(true);
    try {
      const data = await callAction({ action: "get-pipeline-leads", stage: maxStageFilter || null });
      setMaxLeads(data?.data?.leads || []);
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Max: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  async function maxLoadStatus() {
    try {
      const data = await callAction({ action: "get-max-status" });
      setMaxStatus(data?.data || null);
    } catch (_) {}
  }

  async function maxScheduleSequence() {
    if (!maxSelectedIds.length) {
      setMessages((p) => [...p, { role: "agent", text: "Select at least one lead first.", handledBy: "Max" }]);
      return;
    }
    const selected = maxLeads.filter((l) => maxSelectedIds.includes(l.id));
    setLoading(true);
    let totalScheduled = 0;
    let errors = [];
    for (const lead of selected) {
      try {
        const data = await callAction({
          action: "schedule-sequence",
          sequenceKey: maxSequence,
          lead: {
            id:          lead.id,
            name:        lead.name,
            email:       lead.email || "",
            phone:       lead.phone || "",
            clinicName:  lead.clinic_name || lead.name,
            city:        lead.city || "",
            intakeToken: lead.intake_token || "",
          },
        });
        totalScheduled += data?.data?.scheduled ?? 0;
      } catch (e) {
        errors.push(`${lead.name}: ${e.message}`);
      }
    }
    const errMsg = errors.length ? ` Errors: ${errors.join("; ")}` : "";
    setMessages((p) => [...p, {
      role: "agent",
      text: `✅ ${totalScheduled} emails scheduled for ${selected.length} lead(s) — sequence: ${maxSequence}.${errMsg}`,
      handledBy: "Max",
    }]);
    setMaxSelectedIds([]);
    setLoading(false);
  }

  async function maxLoadHistory() {
    if (!maxHistoryLeadId) return;
    setLoading(true);
    try {
      const data = await callAction({ action: "get-history", leadId: maxHistoryLeadId });
      setMaxHistory(data?.data?.history || []);
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Max: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  function maxToggleSelect(id) {
    setMaxSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function rexAddToPipeline() {
    const selected = rexLeads.filter((l) => rexSelectedIds.includes(l.id));
    if (!selected.length) {
      setMessages((p) => [...p, { role: "agent", text: "Pehle Rex table se leads select karo.", handledBy: "system" }]);
      return;
    }
    setLoading(true);
    try {
      const prevAgent = selectedAgent;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "__action__",
          agentId: "iris",
          context: { action: "add-rex-leads", leads: selected },
        }),
      });
      const data = await res.json();
      const added = data?.data?.added ?? 0;
      const skipped = data?.data?.skipped ?? 0;
      setMessages((p) => [
        ...p,
        { role: "agent", text: `✅ ${added} leads pipeline mein add ho gaye (Iris → new_lead stage).\n${skipped > 0 ? `⚠️ ${skipped} skip hue (duplicate ya koi naam nahi).` : ""}`, handledBy: "Iris" },
      ]);
      setRexSelectedIds([]);
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `❌ Pipeline add failed: ${e.message}`, handledBy: "system" }]);
    } finally {
      setLoading(false);
    }
  }

  // ── Cal handlers ─────────────────────────────────────────────────────────────
  async function calGetSlots() {
    setLoading(true);
    try {
      const data = await callAction({ action: "get-slots" });
      setCalSlots(data?.data?.slots || []);
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  async function calBook() {
    if (!calSelectedSlot) { setMessages((p) => [...p, { role: "agent", text: "Select a time slot first.", handledBy: "system" }]); return; }
    setLoading(true);
    try {
      const data = await callAction({
        action: "book",
        summary: calBookingForm.summary || "Discovery Call",
        start: calSelectedSlot.start,
        end: calSelectedSlot.end,
        attendeeEmail: calBookingForm.attendeeEmail,
        attendeeName: calBookingForm.attendeeName,
      });
      const appt = data?.data?.appointment;
      if (appt) {
        setCalAppointments((p) => [appt, ...p]);
        setMessages((p) => [...p, { role: "agent", text: `✅ Appointment booked for ${calBookingForm.attendeeName || "attendee"}`, handledBy: "Cal" }]);
      }
      setCalSelectedSlot(null);
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  async function calLoadAppointments() {
    setLoading(true);
    try {
      const data = await callAction({ action: "list-appointments" });
      setCalAppointments(data?.data?.appointments || []);
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  async function calGetBookingLink() {
    setLoading(true);
    try {
      const data = await callAction({ action: "booking-link", meetingTitle: calBookingForm.summary || "Discovery Call" });
      setCalBookingLink(data?.data?.bookingLink || "");
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  async function calCancelAppt(id) {
    setLoading(true);
    try {
      await callAction({ action: "cancel", appointmentId: id });
      setCalAppointments((p) => p.map((a) => a.id === id ? { ...a, status: "cancelled" } : a));
      setMessages((p) => [...p, { role: "agent", text: "Appointment cancelled.", handledBy: "Cal" }]);
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  // ── Sara handlers ────────────────────────────────────────────────────────────

  // Load init data + sub-accounts when Sara is selected
  useEffect(() => {
    if (selectedAgent !== "workflow-tester") return;

    // Load webhook builder init data
    callAction({ action: "get-init-data" }).then((res) => {
      const d = res?.data || {};
      if (d.builtInMap)      setSaraBuiltInMap(d.builtInMap);
      if (d.customEvents)    setSaraCustomEvents(d.customEvents);
      if (d.templates)       setSaraTemplates(d.templates);
      if (d.defaultDateTime) setSaraDatetime(d.defaultDateTime);
    }).catch(() => {});

    // Load sub-accounts
    callAction({ action: "get-sub-accounts" }).then((res) => {
      const accounts = res?.data?.accounts || [];
      setSaraSubAccounts(accounts);
      if (accounts.length > 0 && !saraSelectedSubAccount) {
        const first = accounts[0];
        setSaraSelectedSubAccount(first);
        // Load webhooks for first sub-account
        callAction({ action: "get-sub-account-webhooks", subAccountId: first.id }).then((r) => {
          setSaraSubAccountWebhooks(r?.data?.webhooks || []);
        }).catch(() => {});
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent]);

  async function saraSearchContacts() {
    if (!saraContactQuery.trim()) return;
    setSaraLoading(true);
    try {
      const data = await callAction({
        action:     "search-contacts",
        query:      saraContactQuery,
        locationId: saraSelectedSubAccount?.location_id || undefined,
        pitToken:   saraSelectedSubAccount?.pit_token   || undefined,
      });
      setSaraContacts(data?.data?.contacts || []);
      if (!data?.data?.contacts?.length) {
        setMessages((p) => [...p, { role: "agent", text: `No contacts found for "${saraContactQuery}".`, handledBy: "Sara" }]);
      }
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Search failed: ${e.message}`, handledBy: "system" }]);
    } finally { setSaraLoading(false); }
  }

  function saraResolveWebhookUrl() {
    // 1. Custom URL always wins
    if (saraCustomUrl.trim()) return saraCustomUrl.trim();
    // 2. Sub-account webhooks table (new)
    const wh = saraSubAccountWebhooks.find(
      (w) => w.event_type === saraEventType && w.action === saraAction
    );
    if (wh?.webhook_url) return wh.webhook_url;
    // 3. Legacy env-based map fallback
    const map = saraBuiltInMap;
    if (saraEventType === "treatment") return map?.treatment?.[saraAction] || null;
    return map?.personal_consultation?.[saraAction] || null;
  }

  function saraBuildPayload(contact) {
    const c = contact || saraSelectedContact || {};
    return {
      event:                saraEventType,
      action:               saraAction,
      email:                c.email || "",
      contact_number:       c.phone || "",
      first_name:           c.firstName || c.name?.split(" ")[0] || "",
      last_name:            c.lastName  || c.name?.split(" ").slice(1).join(" ") || "",
      appointment_datetime: saraDatetime || new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      secret:               "abc123",
    };
  }

  async function saraFireWebhook() {
    const webhookUrl = saraResolveWebhookUrl();
    if (!webhookUrl) {
      setMessages((p) => [...p, { role: "agent", text: "❌ No webhook URL configured for this event. Add it to .env or enter a Custom URL.", handledBy: "Sara" }]);
      return;
    }
    if (!saraSelectedContact) {
      setMessages((p) => [...p, { role: "agent", text: "Select a contact first.", handledBy: "Sara" }]);
      return;
    }
    const confirmed = await showConfirm(`Fire webhook for ${saraSelectedContact.name}?\n\nURL: ${webhookUrl}\nEvent: ${saraEventType} / ${saraAction}`);
    if (!confirmed) return;

    setSaraLoading(true);
    try {
      const payload = saraBuildPayload();
      const data = await callAction({
        action: "fire-webhook",
        webhookUrl,
        payload,
        contactName:  saraSelectedContact.name,
        contactEmail: saraSelectedContact.email,
        contactPhone: saraSelectedContact.phone,
        eventType:    saraEventType,
        action:       saraAction,
      });
      const statusEmoji = data?.success ? "✅" : "❌";
      setMessages((p) => [...p, {
        role: "agent",
        text: `${statusEmoji} **${saraEventType} / ${saraAction}** → ${saraSelectedContact.name}\nStatus: ${data?.status_code || "?"} ${data?.status_text || ""}`,
        handledBy: "Sara",
      }]);
      // Refresh history
      saraLoadHistory();
    } finally { setSaraLoading(false); }
  }

  async function saraBulkFire() {
    const webhookUrl = saraResolveWebhookUrl();
    if (!webhookUrl) { setMessages((p) => [...p, { role: "agent", text: "❌ No webhook URL for this event.", handledBy: "Sara" }]); return; }
    if (!saraBulkSelected.length) { setMessages((p) => [...p, { role: "agent", text: "Select at least one contact for bulk fire.", handledBy: "Sara" }]); return; }
    const confirmed = await showConfirm(`Bulk fire for ${saraBulkSelected.length} contacts?`);
    if (!confirmed) return;
    setSaraLoading(true);
    try {
      const contacts = saraBulkSelected.map((id) => saraContacts.find((c) => c.id === id)).filter(Boolean);
      const data = await callAction({ action: "bulk-fire", contacts, eventType: saraEventType, action: saraAction, webhookUrl });
      setMessages((p) => [...p, { role: "agent", text: `Bulk fire: ${data?.data?.results?.filter((r) => r.success).length || 0}/${contacts.length} succeeded.`, handledBy: "Sara" }]);
      saraLoadHistory();
    } finally { setSaraLoading(false); }
  }

  async function saraLoadHistory() {
    const data = await callAction({ action: "get-history", limit: 30 });
    setSaraHistory(data?.data?.history || []);
  }

  async function saraHealthCheck() {
    setSaraLoading(true);
    try {
      const data = await callAction({ action: "health-check" });
      setSaraHealthResults(data?.data?.results || []);
    } finally { setSaraLoading(false); }
  }

  async function saraRetryWebhook(historyId) {
    setSaraLoading(true);
    try {
      const data = await callAction({ action: "retry-webhook", historyId });
      const r = data?.data || {};
      const emoji = r.success ? "✅" : "❌";
      setMessages((p) => [...p, { role: "agent", text: `${emoji} Retry: ${r.status_code} ${r.status_text}`, handledBy: "Sara" }]);
      saraLoadHistory();
    } finally { setSaraLoading(false); }
  }

  async function saraSaveCustomEvent() {
    if (!saraNewEvent.eventLabel || !saraNewEvent.eventType) return;
    try {
      await callAction({ action: "save-custom-event", event: saraNewEvent });
      const data = await callAction({ action: "get-custom-events" });
      setSaraCustomEvents(data?.data?.events || []);
      setSaraNewEvent({ eventLabel: "", eventType: "", action: "booked", webhookUrl: "" });
      setSaraShowCustomEventForm(false);
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Failed: ${e.message}`, handledBy: "system" }]);
    }
  }

  async function saraDeleteCustomEvent(id) {
    const confirmed = await showConfirm("Delete this custom event?");
    if (!confirmed) return;
    await callAction({ action: "delete-custom-event", id });
    setSaraCustomEvents((p) => p.filter((e) => e.id !== id));
  }

  async function saraSaveTemplate() {
    if (!saraTemplateName.trim()) return;
    const payload = saraBuildPayload();
    await callAction({ action: "save-template", template: { name: saraTemplateName, eventType: saraEventType, action: saraAction, payload } });
    const data = await callAction({ action: "get-templates" });
    setSaraTemplates(data?.data?.templates || []);
    setSaraTemplateName("");
    setSaraShowTemplateSave(false);
  }

  async function saraLoadTemplate(template) {
    if (template.event_type) setSaraEventType(template.event_type);
    if (template.action)     setSaraAction(template.action);
    if (template.payload?.appointment_datetime) setSaraDatetime(template.payload.appointment_datetime);
  }

  async function saraDeleteTemplate(id) {
    const confirmed = await showConfirm("Delete this template?");
    if (!confirmed) return;
    await callAction({ action: "delete-template", id });
    setSaraTemplates((p) => p.filter((t) => t.id !== id));
  }

  // Switch selected sub-account — load its webhooks
  async function saraSelectSubAccount(account) {
    setSaraSelectedSubAccount(account);
    setSaraSubAccountWebhooks([]);
    setSaraSetWebhookFor(null);
    setSaraSelectedContact(null);
    setSaraContacts([]);
    try {
      const r = await callAction({ action: "get-sub-account-webhooks", subAccountId: account.id });
      setSaraSubAccountWebhooks(r?.data?.webhooks || []);
    } catch (e) { /* silent */ }
  }

  // Add new sub-account
  async function saraAddSubAccount() {
    if (!saraNewSubAccount.name || !saraNewSubAccount.locationId || !saraNewSubAccount.pitToken) return;
    setSaraAddingSubAccount(true);
    try {
      const res = await callAction({ action: "add-sub-account", ...saraNewSubAccount });
      const account = res?.data?.account;
      if (account) {
        setSaraSubAccounts((p) => [...p, account]);
        await saraSelectSubAccount(account);
      }
      setSaraShowAddSubAccount(false);
      setSaraNewSubAccount({ name: "", locationId: "", pitToken: "" });
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `❌ Failed to add sub-account: ${e.message}`, handledBy: "Sara" }]);
    } finally { setSaraAddingSubAccount(false); }
  }

  // Set webhook URL for an event in the selected sub-account
  async function saraSaveWebhookUrl() {
    if (!saraSelectedSubAccount || !saraSetWebhookFor) return;
    try {
      await callAction({
        action:        "set-webhook-url",
        subAccountId:  saraSelectedSubAccount.id,
        eventType:     saraSetWebhookFor.event_type,
        action2:       saraSetWebhookFor.action,
        webhookUrl:    saraSetWebhookInput,
      });
      // Refresh webhooks list
      const r = await callAction({ action: "get-sub-account-webhooks", subAccountId: saraSelectedSubAccount.id });
      setSaraSubAccountWebhooks(r?.data?.webhooks || []);
      setSaraSetWebhookFor(null);
      setSaraSetWebhookInput("");
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `❌ Failed to save URL: ${e.message}`, handledBy: "Sara" }]);
    }
  }

  // All event options: built-in + custom (filtered by sub-account)
  const saraAllEvents = [
    ...saraBuiltInLabels,
    ...saraCustomEvents.map((e) => ({ label: e.event_label, eventType: e.event_type, action: e.action, webhookUrl: e.webhook_url, isCustom: true, id: e.id })),
  ];

  return (
    <section
      className={`chat${selectedAgent === "workflow-export" ? " chat-echo-mode" : ""}${selectedAgent === "dash" ? " chat-dash-mode" : ""}${selectedAgent === "rex" ? " chat-rex-mode" : ""}`}
      ref={chatSectionRef}
      style={selectedAgent === "workflow-export"
        ? { gridTemplateColumns: `${echoPanelWidth}% 16px 1fr` }
        : undefined}
    >
      <div className="chat-header">
        <h1>GHL Agent Hub</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="badge">Active: {selectedAgentName}</span>
          <button
            type="button"
            className="clear-chat-btn"
            onClick={clearChat}
            title={`Clear ${selectedAgentName} chat history`}
            disabled={messages.length === 0}
          >
            🗑 Clear Chat
          </button>
        </div>
      </div>

      {selectedAgent === "workflow-export" && (
        <div className="echo-panel">
          <div className="echo-grid">
            {echoAvailableSubAccounts.length > 0 ? (
              <select
                value={echoConfig.subAccountName}
                onChange={(e) =>
                  setEchoConfig((prev) => ({ ...prev, subAccountName: e.target.value }))
                }
                className="echo-sub-select"
              >
                <option value="">— select sub-account —</option>
                {echoAvailableSubAccounts.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ) : (
              <input
                placeholder="Sub-account name"
                value={echoConfig.subAccountName}
                onChange={(e) =>
                  setEchoConfig((prev) => ({ ...prev, subAccountName: e.target.value }))
                }
              />
            )}
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
          {(echoWorkflows.length > 0 || echoExportedFiles.length > 0) && (
            <div className="echo-tabs-container">
              {/* Tab headers */}
              <div className="echo-tabs">
                {echoWorkflows.length > 0 && (
                  <button
                    type="button"
                    className={`echo-tab${echoTab === "workflows" ? " active" : ""}`}
                    onClick={() => setEchoTab("workflows")}
                  >
                    GHL Workflows
                    <span className="echo-tab-badge">{echoWorkflows.length}</span>
                  </button>
                )}
                {echoExportedFiles.length > 0 && (
                  <button
                    type="button"
                    className={`echo-tab${echoTab === "exported" ? " active" : ""}`}
                    onClick={() => setEchoTab("exported")}
                  >
                    Exported JSONs
                    <span className="echo-tab-badge">{echoExportedFiles.length}</span>
                  </button>
                )}
              </div>

              {/* Tab: GHL Workflows */}
              {echoTab === "workflows" && echoWorkflows.length > 0 && (
                <div className="echo-workflows">
                  <div className="echo-workflow-controls">
                    <input
                      placeholder="Search workflows by name or ID"
                      value={echoSearch}
                      onChange={(e) => setEchoSearch(e.target.value)}
                    />
                    <div className="echo-workflow-buttons">
                      <button type="button" onClick={selectAllFiltered}>Select All</button>
                      <button type="button" onClick={clearAllFiltered}>Clear All</button>
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
                      <span>{wf.name} <small>({wf.id})</small></span>
                    </label>
                  ))}
                </div>
              )}

              {/* Tab: Exported JSONs */}
              {echoTab === "exported" && echoExportedFiles.length > 0 && (
                <div className="echo-workflows">
                  <div className="echo-workflow-count">
                    {echoExportedFiles.length} exported JSON file{echoExportedFiles.length !== 1 ? "s" : ""}
                  </div>
                  {echoExportedFiles.map((file) => (
                    <div key={file.fileName} className="echo-workflow-item echo-file-row">
                      <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={selectedExportedFiles.includes(file.fileName)}
                          onChange={() => toggleExportedFile(file.fileName)}
                        />
                        <span>{file.fileName.replace(/\.json$/, "")}</span>
                      </label>
                      <button
                        type="button"
                        className="echo-view-btn"
                        onClick={() => viewExportedFileJson(file)}
                        disabled={loading}
                        title="View JSON in chat"
                      >
                        View
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedAgent === "workflow-export" && (
        <div className="echo-resize-handle" onMouseDown={onResizeMouseDown} />
      )}

      {/* ── Dash Kanban Panel (above chat) ── */}
      {selectedAgent === "dash" && (() => {
        const STAGES = [
          { key: "new_lead",            label: "New Lead",            color: "#6366f1" },
          { key: "meeting_scheduled",   label: "Meeting Scheduled",   color: "#f59e0b" },
          { key: "showed_up",           label: "Showed Up",           color: "#3b82f6" },
          { key: "no_show",             label: "No Show",             color: "#ef4444" },
          { key: "interested",          label: "Interested",          color: "#10b981" },
          { key: "not_interested",      label: "Not Interested",      color: "#6b7280" },
          { key: "long_term_follow_up", label: "Long Term Follow Up", color: "#8b5cf6" },
          { key: "client_won",          label: "Client Won 🏆",       color: "#059669" },
        ];
        return (
          <div className="dash-panel">
            <div className="dash-header">
              <span className="dash-title">📊 Pipeline Board</span>
              <span className="dash-total">{dashBoard ? `${dashBoard.totalCount} leads` : ""}</span>
              <button className="dash-refresh-btn" onClick={dashLoadBoard} disabled={dashLoading}>
                {dashLoading ? "Loading..." : "↻ Refresh"}
              </button>
            </div>

            {dashMoveError && (
              <div className="dash-move-error">⚠️ {dashMoveError} <button onClick={() => setDashMoveError(null)}>✕</button></div>
            )}

            {dashLoading && !dashBoard ? (
              <div className="dash-loading">Loading pipeline...</div>
            ) : dashBoard ? (
              <div className="dash-kanban">
                {STAGES.map(stage => {
                  const leads = dashBoard.stages?.[stage.key] || [];
                  return (
                    <div
                      key={stage.key}
                      className={`dash-column${dashDragOver === stage.key ? " dash-col-drag-over" : ""}`}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDashDragOver(stage.key); }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDashDragOver(null); }}
                      onDrop={e => {
                        e.preventDefault();
                        setDashDragOver(null);
                        try {
                          const raw = e.dataTransfer.getData("application/json");
                          if (!raw) return;
                          const { leadId, fromStage } = JSON.parse(raw);
                          if (leadId && fromStage !== stage.key) {
                            dashMoveLeadStage(leadId, stage.key);
                          }
                        } catch (err) { console.error("drop parse error:", err); }
                      }}
                    >
                      <div className="dash-col-header" style={{ borderTopColor: stage.color }}>
                        <span className="dash-col-name">{stage.label}</span>
                        <span className="dash-col-count" style={{ background: stage.color }}>{leads.length}</span>
                      </div>
                      <div className="dash-col-cards">
                        {leads.map(lead => (
                          <div
                            key={lead.id}
                            className="dash-card"
                            draggable
                            onDragStart={e => {
                              e.dataTransfer.setData("application/json", JSON.stringify({ leadId: lead.id, fromStage: stage.key }));
                              e.dataTransfer.effectAllowed = "move";
                              e.currentTarget.style.opacity = "0.4";
                            }}
                            onDragEnd={e => { e.currentTarget.style.opacity = "1"; setDashDragOver(null); }}
                            onClick={() => dashOpenLead(lead)}
                          >
                            <div className="dash-card-name">{lead.name}</div>
                            {lead.clinic_name && <div className="dash-card-clinic">{lead.clinic_name}</div>}
                            <div className="dash-card-meta">
                              <span className="dash-card-city">{lead.city || "—"}</span>
                              <span className="dash-card-source">{lead.source}</span>
                            </div>
                          </div>
                        ))}
                        {leads.length === 0 && <div className="dash-col-empty">Empty</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="dash-loading">Click Refresh to load the board.</div>
            )}

            {/* Lead Detail Modal */}
            {dashSelectedLead && (
              <div className="dash-modal-overlay" onClick={() => setDashSelectedLead(null)}>
                <div className="dash-modal" onClick={e => e.stopPropagation()}>
                  <button className="dash-modal-close" onClick={() => setDashSelectedLead(null)}>✕</button>

                  <div className="dash-modal-name">{dashSelectedLead.name}</div>
                  {dashSelectedLead.clinic_name && <div className="dash-modal-clinic">{dashSelectedLead.clinic_name}</div>}

                  <div className="dash-modal-info-grid">
                    {dashSelectedLead.email && <span>📧 {dashSelectedLead.email}</span>}
                    {dashSelectedLead.phone && <span>📞 {dashSelectedLead.phone}</span>}
                    {dashSelectedLead.city  && <span>📍 {dashSelectedLead.city}</span>}
                    <span>📌 {dashSelectedLead.stage?.replace(/_/g," ")}</span>
                  </div>

                  {/* Move Stage — all stages available */}
                  <div className="dash-modal-section">
                    <div className="dash-modal-label">Move to Stage</div>
                    <div className="dash-move-btns">
                      {STAGES.filter(s => s.key !== dashSelectedLead.stage).map(s => (
                        <button
                          key={s.key}
                          className="dash-move-btn"
                          style={{ borderColor: s.color, color: s.color }}
                          onClick={() => dashMoveLeadStage(dashSelectedLead.id, s.key)}
                          disabled={dashMoveStage !== null}
                        >
                          {dashMoveStage === s.key ? "Moving..." : s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Add Note */}
                  <div className="dash-modal-section">
                    <div className="dash-modal-label">Add Note</div>
                    <div className="dash-note-row">
                      <input
                        className="dash-note-input"
                        placeholder="Write a note..."
                        value={dashNoteInput}
                        onChange={e => setDashNoteInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && dashAddNote(dashSelectedLead.id)}
                      />
                      <button className="dash-note-btn" onClick={() => dashAddNote(dashSelectedLead.id)} disabled={dashNoteSubmitting || !dashNoteInput.trim()}>
                        {dashNoteSubmitting ? "..." : "Add"}
                      </button>
                    </div>
                  </div>

                  {/* History */}
                  {dashDetailLoading ? (
                    <div className="dash-history-loading">Loading history...</div>
                  ) : dashLeadDetail?.history?.length > 0 ? (
                    <div className="dash-modal-section">
                      <div className="dash-modal-label">History</div>
                      <div className="dash-history">
                        {[...dashLeadDetail.history].reverse().map((h, i) => (
                          <div key={i} className="dash-history-row">
                            <span className="dash-history-time">{new Date(h.moved_at).toLocaleDateString()}</span>
                            {h.from_stage !== h.to_stage
                              ? <span className="dash-history-move">{h.from_stage?.replace(/_/g," ")} → {h.to_stage?.replace(/_/g," ")}</span>
                              : <span className="dash-history-note">📝 {h.note}</span>
                            }
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Rex Panel ── */}
      {selectedAgent === "rex" && (
        <div className="rex-panel">
          {/* Search Row */}
          <div className="rex-search-row">
            <input placeholder="Industry (e.g. dental clinic)" value={rexIndustry} onChange={(e) => setRexIndustry(e.target.value)} />
            <input placeholder="City (e.g. Houston, TX)" value={rexCity} onChange={(e) => setRexCity(e.target.value)} />
            <select value={rexMaxResults} onChange={(e) => setRexMaxResults(Number(e.target.value))} className="rex-select" title="Max results">
              <option value={5}>5 results</option>
              <option value={10}>10 results</option>
              <option value={20}>20 results</option>
              <option value={50}>50 results</option>
            </select>
          </div>
          {/* Action Buttons */}
          <div className="rex-actions">
            <button className="rex-btn" onClick={rexSearch} disabled={loading || historyLoading || !rexIndustry.trim()}>
              {loading ? "Searching..." : "Search Leads"}
            </button>
            <button className="rex-btn secondary" onClick={rexGetLeads} disabled={loading || historyLoading}>Load Saved</button>
            <button className="rex-btn secondary" onClick={rexExportCsv} disabled={!rexLeads.length}>Export CSV</button>
            <button className="rex-btn danger" onClick={rexClearLeads} disabled={loading || historyLoading}>Clear All</button>
            <button
              className="rex-btn pipeline-btn"
              onClick={rexAddToPipeline}
              disabled={loading || rexSelectedIds.length === 0}
              title={rexSelectedIds.length === 0 ? "Pehle leads select karo" : `${rexSelectedIds.length} leads pipeline mein add karo`}
            >
              + Add{rexSelectedIds.length > 0 ? ` ${rexSelectedIds.length}` : ""} to Pipeline
            </button>
            <button
              className="rex-btn send-max"
              onClick={rexAddToPipeline}
              disabled={loading || rexSelectedIds.length === 0}
              title={rexSelectedIds.length === 0 ? "Select leads first" : `Add ${rexSelectedIds.length} leads to pipeline for Max outreach`}
            >
              + Pipeline → Max
            </button>
          </div>
          {/* Filter Row */}
          {rexLeads.length > 0 && (
            <div className="rex-filter-row">
              <input
                className="rex-filter-input"
                placeholder="Filter by industry/category..."
                value={rexFilterIndustry}
                onChange={(e) => setRexFilterIndustry(e.target.value)}
              />
              <input
                className="rex-filter-input"
                placeholder="Filter by city..."
                value={rexFilterCity}
                onChange={(e) => setRexFilterCity(e.target.value)}
              />
              <select className="rex-select" value={rexFilterEmail} onChange={(e) => setRexFilterEmail(e.target.value)}>
                <option value="all">All leads</option>
                <option value="with-email">With email only</option>
                <option value="no-email">No email</option>
              </select>
              <select className="rex-select" value={rexSortBy} onChange={(e) => setRexSortBy(e.target.value)}>
                <option value="scraped">Sort: Newest</option>
                <option value="name">Sort: Name</option>
                <option value="rating">Sort: Rating</option>
                <option value="city">Sort: City</option>
              </select>
              <button className="rex-btn secondary" style={{ padding: "6px 10px", minWidth: 0 }} onClick={() => setRexSortDir((d) => d === "asc" ? "desc" : "asc")}>
                {rexSortDir === "asc" ? "↑ Asc" : "↓ Desc"}
              </button>
              {(rexFilterIndustry || rexFilterCity || rexFilterEmail !== "all") && (
                <button className="rex-btn danger" style={{ padding: "6px 10px", minWidth: 0 }} onClick={() => { setRexFilterIndustry(""); setRexFilterCity(""); setRexFilterEmail("all"); }}>
                  Clear Filters
                </button>
              )}
            </div>
          )}
          {/* Stats + Table */}
          {rexLeads.length > 0 && (() => {
            const displayed = getFilteredSortedLeads();
            return (
              <>
                <div className="rex-stats">
                  {rexLeads.length} total | {displayed.length} shown | {rexSelectedIds.length} selected
                </div>
                <div className="rex-table-wrap">
                  <table className="rex-table">
                    <thead>
                      <tr>
                        <th>
                          <input type="checkbox"
                            checked={rexSelectedIds.length === displayed.length && displayed.length > 0}
                            onChange={(e) => setRexSelectedIds(e.target.checked ? displayed.map((l) => l.id) : [])}
                          />
                        </th>
                        <th className="sortable" onClick={() => rexToggleSort("name")}>Name {rexSortBy === "name" ? (rexSortDir === "asc" ? "↑" : "↓") : ""}</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th className="sortable" onClick={() => rexToggleSort("city")}>City {rexSortBy === "city" ? (rexSortDir === "asc" ? "↑" : "↓") : ""}</th>
                        <th className="sortable" onClick={() => rexToggleSort("rating")}>Rating {rexSortBy === "rating" ? (rexSortDir === "asc" ? "↑" : "↓") : ""}</th>
                        <th>Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map((lead) => (
                        <tr key={lead.id} className={rexSelectedIds.includes(lead.id) ? "selected" : ""}>
                          <td><input type="checkbox" checked={rexSelectedIds.includes(lead.id)} onChange={() => rexToggleLead(lead.id)} /></td>
                          <td>{lead.name}</td>
                          <td>{lead.email ? <a href={`mailto:${lead.email}`} style={{ color: "#7da1ff" }}>{lead.email}</a> : <span style={{ opacity: 0.4 }}>—</span>}</td>
                          <td>{lead.phone || <span style={{ opacity: 0.4 }}>—</span>}</td>
                          <td>{lead.city}</td>
                          <td>{lead.rating ? `⭐ ${lead.rating}` : "—"}</td>
                          <td style={{ fontSize: 11, opacity: 0.8 }}>{lead.category}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </div>
      )}

      <div className="messages">
        {historyLoading ? (
          <div className="msg agent">
            <span className="msg-label">system</span>
            <p>Loading chat history...</p>
          </div>
        ) : messages.length === 0 ? null : (
          messages.map((msg, idx) => {
            // Render messages: split ```json ... ``` into <pre> blocks, rest as <p>
            const parts = (msg.text || "").split(/(```[\s\S]*?```)/g);
            const card = msg.cardData;
            return (
              <div className={`msg ${msg.role}`} key={`${msg.role}-${idx}`}>
                <span className="msg-label">{msg.role === "user" ? "you" : msg.handledBy}</span>
                {parts.map((part, i) => {
                  if (part.startsWith("```")) {
                    const code = part.replace(/^```[a-z]*\n?/, "").replace(/```$/, "");
                    return <pre key={i} className="msg-code">{code}</pre>;
                  }
                  return part.trim() ? <p key={i} style={{ whiteSpace: "pre-wrap" }}>{part}</p> : null;
                })}

                {/* ── Veronica interactive data cards ── */}
                {card?.type === "veronica_clarify" && (
                  <div className="v-card">
                    {card.options.map((opt) => (
                      <button
                        key={opt}
                        className="v-card-btn"
                        onClick={() => {
                          const isSpecific = opt.toLowerCase().includes("specific");
                          if (isSpecific) {
                            sendAgentMessage(opt, { veronica_mode: card.mode });
                          } else {
                            sendAgentMessage(opt, {});
                          }
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {card?.type === "veronica_sub_accounts" && card.subAccounts?.length > 0 && (
                  <div className="v-card">
                    <div className="v-card-label">Select a sub-account:</div>
                    {card.subAccounts.map((folder) => (
                      <button
                        key={folder}
                        className="v-card-btn folder"
                        onClick={() => sendAgentMessage(`Select folder: ${folder}`, {
                          action: "list-workflows-in-folder",
                          folderName: folder,
                          veronica_mode: card.mode,
                        })}
                      >
                        📁 {folder}
                      </button>
                    ))}
                  </div>
                )}

                {card?.type === "veronica_workflow_list" && card.workflows?.length > 0 && (
                  <div className="v-card">
                    <div className="v-card-label">Select a workflow from <strong>{card.folderName}</strong>:</div>
                    {card.workflows.map((wf) => (
                      <button
                        key={wf.fileName}
                        className="v-card-btn wf"
                        onClick={() => {
                          const action = card.mode === "debug" ? "debug-workflow" : "explain-workflow";
                          const label = card.mode === "debug" ? "Debug" : "Explain";
                          sendAgentMessage(`${label} workflow: ${wf.workflowName}`, {
                            action,
                            filePath: wf.fullPath,
                            fileName: wf.fileName,
                          });
                        }}
                      >
                        {wf.workflowName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
        {loading && (
          <div className="msg agent">
            <span className="msg-label">typing...</span>
            <p className="typing-indicator"><span /><span /><span /></p>
          </div>
        )}
      </div>

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

      {/* ── Nora Panel ── */}
      {selectedAgent === "nora" && (
        <div className="nora-panel">
          <div className="nora-tabs">
            {[["email", "Email Sequence"], ["proposal", "Proposal"], ["social", "Social Post"], ["ad", "Ad Copy"], ["library", "Library"]].map(([t, label]) => (
              <button key={t} className={`nora-tab${noraTab === t ? " active" : ""}`} onClick={() => setNoraTab(t)}>{label}</button>
            ))}
          </div>

          {noraTab !== "library" && (
            <div className="nora-form">
              <input placeholder="Industry (e.g. dental, real estate)" value={noraIndustry} onChange={(e) => setNoraIndustry(e.target.value)} />
              {noraTab === "email" && <input placeholder="Sender name (optional)" value={noraField.senderName} onChange={(e) => setNoraField((p) => ({ ...p, senderName: e.target.value }))} />}
              {noraTab === "proposal" && (<>
                <input placeholder="Lead first name" value={noraField.leadName} onChange={(e) => setNoraField((p) => ({ ...p, leadName: e.target.value }))} />
                <input placeholder="Business name" value={noraField.businessName} onChange={(e) => setNoraField((p) => ({ ...p, businessName: e.target.value }))} />
                <textarea placeholder="Pain point / context" value={noraField.painPoint} onChange={(e) => setNoraField((p) => ({ ...p, painPoint: e.target.value }))} />
              </>)}
              {noraTab === "social" && (<>
                <select value={noraField.platform} onChange={(e) => setNoraField((p) => ({ ...p, platform: e.target.value }))}><option value="linkedin">LinkedIn</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option></select>
                <input placeholder="Topic / message" value={noraField.topic} onChange={(e) => setNoraField((p) => ({ ...p, topic: e.target.value }))} />
              </>)}
              {noraTab === "ad" && (<>
                <select value={noraField.platform} onChange={(e) => setNoraField((p) => ({ ...p, platform: e.target.value }))}><option value="meta">Meta (Facebook/Instagram)</option><option value="google">Google Search</option></select>
                <input placeholder="Offer / service" value={noraField.offer} onChange={(e) => setNoraField((p) => ({ ...p, offer: e.target.value }))} />
                <input placeholder="Target audience (optional)" value={noraField.targetAudience} onChange={(e) => setNoraField((p) => ({ ...p, targetAudience: e.target.value }))} />
              </>)}
              <button className="nora-btn" onClick={noraGenerate} disabled={loading || !noraIndustry}>Generate</button>
            </div>
          )}

          {noraOutput && noraTab !== "library" && (
            <div className="nora-output">{noraOutput}</div>
          )}

          {noraTab === "library" && (
            <>
              <button className="nora-btn" onClick={noraLoadTemplates} disabled={loading}>Refresh Library</button>
              <div className="nora-template-list">
                {noraTemplates.length === 0 && <div style={{ opacity: 0.5, fontSize: 13 }}>No templates yet. Generate one from the other tabs.</div>}
                {noraTemplates.map((t) => (
                  <div key={t.id} className="nora-template-item">
                    <div>
                      <strong>{t.type}</strong> — {t.industry}
                      <div className="nora-template-meta">ID: {t.id} | {new Date(t.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="nora-btn" onClick={() => setMessages((p) => [...p, { role: "agent", text: `📧 Template copied to chat — paste into Max sequence prompt.`, handledBy: "Nora" }])} style={{ background: "#0ea5e9", fontSize: 11 }}>Copy to Chat</button>
                      <button className="nora-btn danger" onClick={() => noraDeleteTemplate(t.id)} disabled={loading} style={{ fontSize: 11 }}>Del</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Max Panel ── */}
      {selectedAgent === "max" && (
        <div className="max-panel">
          {/* Connection status */}
          <div className="max-status-row">
            <span className={`max-conn-pill ${maxStatus?.emailConnected ? "connected" : "disconnected"}`}>
              {maxStatus?.emailConnected ? "✅ Brevo" : "⚠️ Brevo (not configured)"}
            </span>
            <span className={`max-conn-pill ${maxStatus?.whatsappConnected ? "connected" : "disconnected"}`}>
              {maxStatus?.whatsappConnected ? "✅ WhatsApp" : "⚠️ WhatsApp (not configured)"}
            </span>
            <button className="max-btn secondary" onClick={() => { maxLoadStatus(); maxLoadLeads(); }} disabled={loading} style={{ marginLeft: "auto" }}>↻ Refresh</button>
          </div>

          {/* Tabs */}
          <div className="max-tabs">
            <button className={`max-tab${maxTab === "leads" ? " active" : ""}`} onClick={() => setMaxTab("leads")}>
              Leads {maxLeads.length > 0 ? `(${maxLeads.length})` : ""}
            </button>
            <button className={`max-tab${maxTab === "history" ? " active" : ""}`} onClick={() => setMaxTab("history")}>
              History
            </button>
          </div>

          {/* Leads tab */}
          {maxTab === "leads" && (
            <div className="max-leads-area">
              <div className="max-leads-toolbar">
                <select
                  className="max-select"
                  value={maxStageFilter}
                  onChange={(e) => setMaxStageFilter(e.target.value)}
                >
                  <option value="">All stages</option>
                  <option value="new_lead">new_lead</option>
                  <option value="interested">interested</option>
                  <option value="meeting_scheduled">meeting_scheduled</option>
                  <option value="no_show">no_show</option>
                  <option value="not_interested">not_interested</option>
                  <option value="long_term_nurture">long_term_nurture</option>
                  <option value="showed_up">showed_up</option>
                  <option value="client_won">client_won</option>
                </select>
                <button className="max-btn secondary" onClick={maxLoadLeads} disabled={loading}>Filter</button>
                <select
                  className="max-select"
                  value={maxSequence}
                  onChange={(e) => setMaxSequence(e.target.value)}
                  style={{ flex: 2 }}
                >
                  <option value="new_lead_sequence">new_lead_sequence</option>
                  <option value="interested_sequence">interested_sequence</option>
                  <option value="pre_meeting_reminder">pre_meeting_reminder</option>
                  <option value="no_show_reschedule">no_show_reschedule</option>
                  <option value="not_interested_reengagement">not_interested_reengagement</option>
                  <option value="long_term_nurture">long_term_nurture</option>
                  <option value="post_meeting_follow_up">post_meeting_follow_up</option>
                  <option value="onboarding_handoff">onboarding_handoff</option>
                </select>
              </div>

              <div className="max-leads-list">
                {maxLeads.length === 0 ? (
                  <div className="max-empty">No leads found. Click ↻ Refresh or change stage filter.</div>
                ) : maxLeads.map((lead) => (
                  <label key={lead.id} className={`max-lead-row${maxSelectedIds.includes(lead.id) ? " selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={maxSelectedIds.includes(lead.id)}
                      onChange={() => maxToggleSelect(lead.id)}
                      className="max-lead-checkbox"
                    />
                    <div className="max-lead-info">
                      <span className="max-lead-name">{lead.clinic_name || lead.name}</span>
                      <span className="max-lead-meta">{lead.email || "no email"} · {lead.city || "—"}</span>
                    </div>
                    <span className={`max-stage-pill stage-${lead.stage}`}>{lead.stage}</span>
                    <button
                      className="max-btn secondary small"
                      onClick={(e) => { e.preventDefault(); setMaxHistoryLeadId(lead.id); setMaxTab("history"); maxLoadHistory(); }}
                      title="View outreach history"
                    >
                      📋
                    </button>
                  </label>
                ))}
              </div>

              <div className="max-action-row">
                <span className="max-selected-count">
                  {maxSelectedIds.length > 0 ? `${maxSelectedIds.length} selected` : "Select leads above"}
                </span>
                <button
                  className="max-btn primary"
                  onClick={maxScheduleSequence}
                  disabled={loading || maxSelectedIds.length === 0}
                >
                  Schedule Sequence
                </button>
              </div>
            </div>
          )}

          {/* History tab */}
          {maxTab === "history" && (
            <div className="max-history-area">
              <div className="max-history-toolbar">
                <select
                  className="max-select"
                  value={maxHistoryLeadId}
                  onChange={(e) => setMaxHistoryLeadId(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">— Select a lead —</option>
                  {maxLeads.map((l) => (
                    <option key={l.id} value={l.id}>{l.clinic_name || l.name}</option>
                  ))}
                </select>
                <button className="max-btn secondary" onClick={maxLoadHistory} disabled={loading || !maxHistoryLeadId}>Load</button>
              </div>

              <div className="max-history-list">
                {maxHistory.length === 0 ? (
                  <div className="max-empty">Select a lead and click Load to view outreach history.</div>
                ) : maxHistory.map((row) => (
                  <div key={row.id} className={`max-history-row status-${row.status}`}>
                    <div className="max-history-main">
                      <span className="max-history-subject">{row.subject || "(WhatsApp)"}</span>
                      <span className="max-history-seq">{row.sequence_key} · step {row.step_index + 1}</span>
                    </div>
                    <div className="max-history-meta">
                      <span className={`max-status-badge ${row.status}`}>{row.status}</span>
                      <span className="max-history-date">{new Date(row.send_at).toLocaleDateString()}</span>
                    </div>
                    {row.error && <div className="max-history-error">{row.error}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Veronica Folder Browser Panel ── */}
      {selectedAgent === "veronica" && (
        <div className={`veronica-panel${veronicaPanelExpanded ? "" : " veronica-panel-collapsed"}`}>
          <div className="veronica-panel-header" onClick={() => setVeronicaPanelExpanded(v => !v)} style={{ cursor: "pointer" }}>
            <span className="veronica-panel-title">🧠 Workflow Browser</span>
            <div className="veronica-panel-header-actions" onClick={e => e.stopPropagation()}>
              <button
                className="veronica-btn secondary small"
                onClick={veronicaLoadSubAccounts}
                disabled={veronicaFolderLoading}
                title="Refresh"
              >
                ↻ Refresh
              </button>
              <button
                className="veronica-collapse-btn"
                onClick={e => { e.stopPropagation(); setVeronicaPanelExpanded(v => !v); }}
                title={veronicaPanelExpanded ? "Collapse panel" : "Expand panel"}
              >
                {veronicaPanelExpanded ? "▲" : "▼"}
              </button>
            </div>
          </div>

          <div className="veronica-browser">
            {/* Left: sub-account folders */}
            <div className="veronica-folders">
              <div className="veronica-col-heading">Sub-Accounts</div>
              {veronicaFolderLoading && !veronicaSubAccounts.length ? (
                <div className="veronica-loading">Loading…</div>
              ) : veronicaSubAccounts.length === 0 ? (
                <div className="veronica-empty">No folders found.<br/>Export workflows with Echo first.</div>
              ) : veronicaSubAccounts.map((folder) => (
                <button
                  key={folder}
                  className={`veronica-folder-item${veronicaSelectedFolder === folder ? " active" : ""}`}
                  onClick={() => veronicaSelectFolder(folder)}
                >
                  📁 {folder}
                </button>
              ))}
            </div>

            {/* Right: workflows in selected folder */}
            <div className="veronica-wf-list">
              <div className="veronica-col-heading">
                {veronicaSelectedFolder ? `Workflows in "${veronicaSelectedFolder}"` : "Select a sub-account →"}
              </div>
              {veronicaFolderLoading && veronicaSelectedFolder ? (
                <div className="veronica-loading">Loading…</div>
              ) : !veronicaSelectedFolder ? null
              : veronicaFolderWorkflows.length === 0 ? (
                <div className="veronica-empty">No exported JSONs in this folder.</div>
              ) : veronicaFolderWorkflows.map((wf) => (
                <button
                  key={wf.fileName}
                  className={`veronica-wf-item${veronicaSelectedWorkflow?.fileName === wf.fileName ? " active" : ""}`}
                  onClick={() => setVeronicaSelectedWorkflow(wf)}
                >
                  {wf.workflowName}
                </button>
              ))}
            </div>
          </div>

          {/* Action area — shown when a workflow is selected */}
          {veronicaSelectedWorkflow && (
            <div className="veronica-action-area">
              <div className="veronica-selected-label">
                Selected: <strong>{veronicaSelectedWorkflow.workflowName}</strong>
              </div>
              <div className="veronica-action-row">
                <button
                  className="veronica-btn primary"
                  onClick={veronicaRunExplain}
                  disabled={loading}
                >
                  💡 Explain
                </button>
                <button
                  className="veronica-btn danger"
                  onClick={veronicaRunDebug}
                  disabled={loading}
                >
                  🔍 Debug
                </button>
              </div>
              <input
                className="veronica-debug-input"
                placeholder="Describe the issue (optional, for Debug)"
                value={veronicaDebugIssue}
                onChange={(e) => setVeronicaDebugIssue(e.target.value)}
              />
            </div>
          )}
        </div>
      )}


      {/* ── Sara Panel ── */}
      {selectedAgent === "workflow-tester" && (
        <div className={`sara-panel${saraPanelExpanded ? "" : " sara-panel-collapsed"}`}>

          {/* Header */}
          <div className="sara-header" onClick={() => setSaraPanelExpanded((v) => !v)} style={{ cursor: "pointer" }}>
            <span className="sara-title">🎯 Sara — Webhook Tester</span>
            <div className="sara-header-actions" onClick={(e) => e.stopPropagation()}>
              <button className="sara-btn ghost" onClick={() => { setSaraHistoryTab(false); }} title="Builder">⚡ Builder</button>
              <button className="sara-btn ghost" onClick={() => { setSaraHistoryTab(true); saraLoadHistory(); }} title="History">📋 History</button>
              <button className="sara-btn ghost" onClick={saraHealthCheck} disabled={saraLoading} title="Health Check">💊 Health</button>
              <button
                type="button"
                className="sara-collapse-btn"
                onClick={(e) => { e.stopPropagation(); setSaraPanelExpanded((v) => !v); }}
                title={saraPanelExpanded ? "Collapse panel" : "Expand panel"}
              >
                {saraPanelExpanded ? "▼" : "▲"}
              </button>
            </div>
          </div>

          {/* Health Results */}
          {saraHealthResults.length > 0 && (
            <div className="sara-health-results">
              {saraHealthResults.map((r, i) => (
                <div key={i} className={`sara-health-row sara-health-${r.status}`}>
                  <span className="sara-health-icon">{r.status === "live" ? "✅" : r.status === "pending" ? "⚠️" : "❌"}</span>
                  <span className="sara-health-label">{r.label}</span>
                  <span className="sara-health-msg">{r.message}</span>
                </div>
              ))}
            </div>
          )}

          {!saraHistoryTab ? (
            /* ── BUILDER VIEW ── */
            <div className="sara-builder">

              {/* Section 0: Sub-account Selector */}
              <div className="sara-section sara-subaccount-section">
                <div className="sara-section-title">0 · Sub-Account</div>
                <div className="sara-subaccount-row">
                  <select
                    className="sara-select"
                    value={saraSelectedSubAccount?.id || ""}
                    onChange={(e) => {
                      const acct = saraSubAccounts.find((a) => a.id === e.target.value);
                      if (acct) saraSelectSubAccount(acct);
                    }}
                  >
                    {saraSubAccounts.length === 0 && <option value="">— No sub-accounts —</option>}
                    {saraSubAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <button
                    className="sara-btn ghost small"
                    onClick={() => setSaraShowAddSubAccount((v) => !v)}
                    title="Add new sub-account"
                  >
                    {saraShowAddSubAccount ? "✕ Cancel" : "+ Add"}
                  </button>
                </div>

                {/* Add sub-account form */}
                {saraShowAddSubAccount && (
                  <div className="sara-add-subaccount-form">
                    <input
                      className="sara-input"
                      placeholder="Name (e.g. Dental Client)"
                      value={saraNewSubAccount.name}
                      onChange={(e) => setSaraNewSubAccount((p) => ({ ...p, name: e.target.value }))}
                    />
                    <input
                      className="sara-input"
                      placeholder="Location ID"
                      value={saraNewSubAccount.locationId}
                      onChange={(e) => setSaraNewSubAccount((p) => ({ ...p, locationId: e.target.value }))}
                    />
                    <input
                      className="sara-input"
                      placeholder="PIT Token (pit-xxxxx)"
                      value={saraNewSubAccount.pitToken}
                      onChange={(e) => setSaraNewSubAccount((p) => ({ ...p, pitToken: e.target.value }))}
                    />
                    <button
                      className="sara-btn primary"
                      onClick={saraAddSubAccount}
                      disabled={saraAddingSubAccount || !saraNewSubAccount.name || !saraNewSubAccount.locationId || !saraNewSubAccount.pitToken}
                    >
                      {saraAddingSubAccount ? "Saving…" : "Save Sub-Account"}
                    </button>
                  </div>
                )}

                {/* Per-event webhook URLs for selected sub-account */}
                {saraSelectedSubAccount && saraSubAccountWebhooks.length > 0 && (
                  <div className="sara-webhook-map">
                    {saraSubAccountWebhooks.map((wh) => (
                      <div key={wh.id} className="sara-webhook-map-row">
                        <span className="sara-wh-label">{wh.event_label}</span>
                        <span className={`sara-wh-status ${wh.webhook_url ? "set" : "missing"}`}>
                          {wh.webhook_url ? "✅" : "⚠️"}
                        </span>
                        {saraSetWebhookFor?.id === wh.id ? (
                          <span className="sara-wh-edit">
                            <input
                              className="sara-input"
                              placeholder="https://..."
                              value={saraSetWebhookInput}
                              onChange={(e) => setSaraSetWebhookInput(e.target.value)}
                              autoFocus
                            />
                            <button className="sara-btn primary small" onClick={saraSaveWebhookUrl}>Save</button>
                            <button className="sara-btn ghost small" onClick={() => { setSaraSetWebhookFor(null); setSaraSetWebhookInput(""); }}>✕</button>
                          </span>
                        ) : (
                          <button
                            className="sara-btn ghost small"
                            onClick={() => { setSaraSetWebhookFor(wh); setSaraSetWebhookInput(wh.webhook_url || ""); }}
                          >
                            {wh.webhook_url ? "Edit" : "Set URL"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 1: Contact Search */}
              <div className="sara-section">
                <div className="sara-section-title">1 · Contact Search
                  {saraSelectedSubAccount && (
                    <span className="sara-subaccount-badge">📍 {saraSelectedSubAccount.name}</span>
                  )}
                </div>
                <div className="sara-search-row">
                  <input
                    className="sara-input"
                    placeholder="Search contact by name..."
                    value={saraContactQuery}
                    onChange={(e) => setSaraContactQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saraSearchContacts()}
                  />
                  <button className="sara-btn primary" onClick={saraSearchContacts} disabled={saraLoading}>Search</button>
                </div>

                {/* Contact Results */}
                {saraContacts.length > 0 && (
                  <div className="sara-contact-list">
                    {saraContacts.map((c) => (
                      <div
                        key={c.id}
                        className={`sara-contact-card${saraSelectedContact?.id === c.id ? " selected" : ""}${saraBulkMode && saraBulkSelected.includes(c.id) ? " bulk-selected" : ""}`}
                        onClick={() => {
                          if (saraBulkMode) {
                            setSaraBulkSelected((p) => p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]);
                          } else {
                            setSaraSelectedContact(c);
                          }
                        }}
                      >
                        <div className="sara-contact-name">{c.name}</div>
                        <div className="sara-contact-meta">{c.email || "No email"} · {c.phone || "No phone"}</div>
                      </div>
                    ))}
                    <div className="sara-bulk-toggle">
                      <label>
                        <input type="checkbox" checked={saraBulkMode} onChange={(e) => { setSaraBulkMode(e.target.checked); setSaraBulkSelected([]); }} />
                        {" "}Bulk mode
                      </label>
                      {saraBulkMode && saraBulkSelected.length > 0 && (
                        <span className="sara-bulk-count">{saraBulkSelected.length} selected</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Event Builder */}
              <div className="sara-section">
                <div className="sara-section-title">2 · Event Builder</div>
                <div className="sara-event-row">
                  <select
                    className="sara-select"
                    value={`${saraEventType}::${saraAction}`}
                    onChange={(e) => {
                      const ev = saraAllEvents.find((x) => `${x.eventType}::${x.action}` === e.target.value);
                      if (ev) {
                        setSaraEventType(ev.eventType);
                        setSaraAction(ev.action);
                        if (ev.webhookUrl) setSaraCustomUrl(ev.webhookUrl);
                      }
                    }}
                  >
                    {saraAllEvents.map((ev, i) => (
                      <option key={i} value={`${ev.eventType}::${ev.action}`}>{ev.label}{ev.isCustom ? " ✦" : ""}</option>
                    ))}
                  </select>
                  <input
                    className="sara-input"
                    type="datetime-local"
                    value={saraDatetime}
                    onChange={(e) => setSaraDatetime(e.target.value)}
                  />
                </div>

                {/* Custom URL override */}
                <input
                  className="sara-input"
                  placeholder="Custom webhook URL (overrides .env)"
                  value={saraCustomUrl}
                  onChange={(e) => setSaraCustomUrl(e.target.value)}
                />

                {/* Resolved URL preview */}
                <div className="sara-url-preview">
                  {saraResolveWebhookUrl()
                    ? <span className="sara-url-ok">🔗 {saraResolveWebhookUrl()}</span>
                    : <span className="sara-url-missing">⚠️ No webhook URL — add to .env or enter Custom URL</span>
                  }
                </div>

                {/* Payload Preview */}
                {saraSelectedContact && (
                  <pre className="sara-payload-preview">{JSON.stringify(saraBuildPayload(), null, 2)}</pre>
                )}

                {/* Templates row */}
                {saraTemplates.length > 0 && (
                  <div className="sara-template-row">
                    <span className="sara-template-label">Templates:</span>
                    {saraTemplates.map((t) => (
                      <span key={t.id} className="sara-template-chip">
                        <button className="sara-chip-btn" onClick={() => saraLoadTemplate(t)}>{t.name}</button>
                        <button className="sara-chip-del" onClick={() => saraDeleteTemplate(t.id)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <button className="sara-btn ghost small" onClick={() => setSaraShowTemplateSave((v) => !v)}>💾 Save as Template</button>
                {saraShowTemplateSave && (
                  <div className="sara-template-save-row">
                    <input className="sara-input small" placeholder="Template name..." value={saraTemplateName} onChange={(e) => setSaraTemplateName(e.target.value)} />
                    <button className="sara-btn primary small" onClick={saraSaveTemplate}>Save</button>
                  </div>
                )}
              </div>

              {/* Section 3: Fire */}
              <div className="sara-section sara-fire-section">
                {saraBulkMode ? (
                  <button className="sara-btn fire" onClick={saraBulkFire} disabled={saraLoading || !saraBulkSelected.length}>
                    🚀 Bulk Fire ({saraBulkSelected.length} contacts)
                  </button>
                ) : (
                  <button className="sara-btn fire" onClick={saraFireWebhook} disabled={saraLoading || !saraSelectedContact}>
                    🚀 Fire Webhook{saraSelectedContact ? ` → ${saraSelectedContact.name}` : ""}
                  </button>
                )}
              </div>

              {/* Custom Events */}
              <div className="sara-section">
                <div className="sara-section-title-row">
                  <span className="sara-section-title">Custom Events</span>
                  <button className="sara-btn ghost small" onClick={() => setSaraShowCustomEventForm((v) => !v)}>+ Add</button>
                </div>
                {saraShowCustomEventForm && (
                  <div className="sara-custom-event-form">
                    <input className="sara-input small" placeholder="Label (e.g. Whitening Booked)" value={saraNewEvent.eventLabel} onChange={(e) => setSaraNewEvent((p) => ({ ...p, eventLabel: e.target.value }))} />
                    <input className="sara-input small" placeholder="Type value (e.g. Whitening)" value={saraNewEvent.eventType} onChange={(e) => setSaraNewEvent((p) => ({ ...p, eventType: e.target.value }))} />
                    <select className="sara-select small" value={saraNewEvent.action} onChange={(e) => setSaraNewEvent((p) => ({ ...p, action: e.target.value }))}>
                      <option value="booked">Booked</option>
                      <option value="rescheduled">Rescheduled</option>
                    </select>
                    <input className="sara-input small" placeholder="Webhook URL (optional)" value={saraNewEvent.webhookUrl} onChange={(e) => setSaraNewEvent((p) => ({ ...p, webhookUrl: e.target.value }))} />
                    <div className="sara-form-actions">
                      <button className="sara-btn primary small" onClick={saraSaveCustomEvent}>Save Event</button>
                      <button className="sara-btn ghost small" onClick={() => setSaraShowCustomEventForm(false)}>Cancel</button>
                    </div>
                  </div>
                )}
                {saraCustomEvents.length > 0 && (
                  <div className="sara-custom-event-list">
                    {saraCustomEvents.map((e) => (
                      <div key={e.id} className="sara-custom-event-row">
                        <span>{e.event_label} <span className="sara-event-tag">{e.action}</span></span>
                        <button className="sara-chip-del" onClick={() => saraDeleteCustomEvent(e.id)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── HISTORY VIEW ── */
            <div className="sara-history-view">
              <div className="sara-history-toolbar">
                <button className="sara-btn ghost small" onClick={saraLoadHistory} disabled={saraLoading}>↻ Refresh</button>
                <button className="sara-btn ghost small" onClick={async () => {
                  const data = await callAction({ action: "get-history", limit: 30, onlyFailed: true });
                  setSaraHistory(data?.data?.history || []);
                }}>Show Failed Only</button>
              </div>
              {saraHistory.length === 0 ? (
                <div className="sara-empty">No history yet. Fire a webhook to see it here.</div>
              ) : (
                <div className="sara-history-list">
                  {saraHistory.map((row) => (
                    <div key={row.id} className={`sara-history-row ${row.success ? "success" : "fail"}`}>
                      <div className="sara-history-row-top">
                        <span className="sara-history-status">{row.success ? "✅" : "❌"} {row.status_code}</span>
                        <span className="sara-history-name">{row.contact_name || "—"}</span>
                        <span className="sara-history-event">{row.event_type}/{row.action}</span>
                        <span className="sara-history-time">{row.fired_at ? new Date(row.fired_at).toLocaleTimeString() : ""}</span>
                        <button className="sara-btn ghost small" onClick={() => saraRetryWebhook(row.id)}>↺ Retry</button>
                      </div>
                      {row.response_body && (
                        <div className="sara-history-response">{row.response_body.slice(0, 120)}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Cal Panel ── */}
      {selectedAgent === "cal" && (
        <div className="cal-panel">
          <div className="cal-actions">
            <button className="cal-btn" onClick={calGetSlots} disabled={loading}>Get Available Slots</button>
            <button className="cal-btn secondary" onClick={calLoadAppointments} disabled={loading}>
              My Appointments
              {calAppointments.filter((a) => a.status === "booked").length > 0 && (
                <span className="cal-notification-badge">{calAppointments.filter((a) => a.status === "booked").length}</span>
              )}
            </button>
            <button className="cal-btn secondary" onClick={calGetBookingLink} disabled={loading}>Generate Booking Link</button>
          </div>

          {calBookingLink && (
            <div style={{ fontSize: 12, background: "#0a1430", padding: "8px 12px", borderRadius: 8, wordBreak: "break-all" }}>
              <strong>Booking Link:</strong>{" "}
              <a href={calBookingLink} target="_blank" rel="noreferrer" style={{ color: "#7da1ff" }}>{calBookingLink}</a>
            </div>
          )}

          {calSlots.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "#94b4ff" }}>Select a slot to book:</div>
              <div className="cal-slots-grid">
                {calSlots.map((slot, i) => (
                  <button key={i} className={`cal-slot-btn${calSelectedSlot?.start === slot.start ? " selected" : ""}`} onClick={() => setCalSelectedSlot(slot)}>
                    {slot.label}
                  </button>
                ))}
              </div>
              {calSelectedSlot && (
                <div className="cal-form">
                  <input placeholder="Meeting title (e.g. Discovery Call)" value={calBookingForm.summary} onChange={(e) => setCalBookingForm((p) => ({ ...p, summary: e.target.value }))} />
                  <input placeholder="Attendee email" value={calBookingForm.attendeeEmail} onChange={(e) => setCalBookingForm((p) => ({ ...p, attendeeEmail: e.target.value }))} />
                  <input placeholder="Attendee name" value={calBookingForm.attendeeName} onChange={(e) => setCalBookingForm((p) => ({ ...p, attendeeName: e.target.value }))} />
                  <button className="cal-btn" onClick={calBook} disabled={loading}>Confirm Booking</button>
                </div>
              )}
            </>
          )}

          {calAppointments.length > 0 && (
            <div className="cal-appt-list">
              {calAppointments.map((a) => (
                <div key={a.id} className="cal-appt-item">
                  <div className="cal-appt-header">
                    <strong>{a.summary}</strong>
                    <span className={`cal-appt-status ${a.status}`}>{a.status}</span>
                  </div>
                  <div className="cal-appt-meta">
                    {new Date(a.start).toLocaleString()} · {a.attendeeName || a.attendeeEmail}
                    {a.previousStart && <span> (was: {new Date(a.previousStart).toLocaleString()})</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    {a.htmlLink && <a href={a.htmlLink} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#7da1ff" }}>Open in Calendar</a>}
                    {a.status !== "cancelled" && (
                      <button className="cal-btn danger" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => calCancelAppt(a.id)} disabled={loading}>Cancel</button>
                    )}
                  </div>
                </div>
              ))}
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

      {/* ── Iris Panel ── */}
      {selectedAgent === "iris" && (
        <div className="iris-panel">
          {/* Tabs */}
          <div className="iris-tabs">
            <button className={`iris-tab${irisTab === "form" ? " active" : ""}`} onClick={() => setIrisTab("form")}>
              🌸 Add Lead
            </button>
            <button className={`iris-tab${irisTab === "pipeline" ? " active" : ""}`} onClick={() => { setIrisTab("pipeline"); irisLoadPipeline(); }}>
              📊 Pipeline
              {irisPipelineCounts && (
                <span className="iris-tab-badge">{Object.values(irisPipelineCounts).reduce((a,b)=>a+b,0)}</span>
              )}
            </button>
          </div>

          {/* Form Tab */}
          {irisTab === "form" && (
            <div className="iris-form">
              <div className="iris-form-row">
                <div className="iris-field">
                  <label>Name <span className="iris-required">*</span></label>
                  <input placeholder="Dr. Ali Hassan" value={irisForm.name} onChange={e => setIrisForm(p => ({...p, name: e.target.value}))} />
                </div>
                <div className="iris-field">
                  <label>Clinic Name</label>
                  <input placeholder="Ali Dental Care" value={irisForm.clinic_name} onChange={e => setIrisForm(p => ({...p, clinic_name: e.target.value}))} />
                </div>
              </div>
              <div className="iris-form-row">
                <div className="iris-field">
                  <label>Email</label>
                  <input type="email" placeholder="ali@dental.com" value={irisForm.email} onChange={e => setIrisForm(p => ({...p, email: e.target.value}))} />
                </div>
                <div className="iris-field">
                  <label>Phone</label>
                  <input placeholder="+92 300 1234567" value={irisForm.phone} onChange={e => setIrisForm(p => ({...p, phone: e.target.value}))} />
                </div>
              </div>
              <div className="iris-form-row">
                <div className="iris-field">
                  <label>City</label>
                  <input placeholder="Lahore" value={irisForm.city} onChange={e => setIrisForm(p => ({...p, city: e.target.value}))} />
                </div>
                <div className="iris-field">
                  <label>Source</label>
                  <select value={irisForm.source} onChange={e => setIrisForm(p => ({...p, source: e.target.value}))}>
                    <option value="survey">Survey Form</option>
                    <option value="calendar_booking">Calendar Booking</option>
                    <option value="manual">Manual Entry</option>
                  </select>
                </div>
              </div>
              <div className="iris-form-row">
                <div className="iris-field iris-field-full">
                  <label>Website URL</label>
                  <input placeholder="https://alidental.com" value={irisForm.website_url} onChange={e => setIrisForm(p => ({...p, website_url: e.target.value}))} />
                </div>
              </div>
              <div className="iris-form-row">
                <div className="iris-field iris-field-full">
                  <label>Notes</label>
                  <textarea placeholder="Additional info about this lead..." value={irisForm.message} onChange={e => setIrisForm(p => ({...p, message: e.target.value}))} rows={2} />
                </div>
              </div>
              {irisSubmitResult && (
                <div className={`iris-result ${irisSubmitResult.success ? "success" : "error"}`}>
                  {irisSubmitResult.message}
                </div>
              )}
              <button className="iris-submit-btn" onClick={irisSubmitLead} disabled={irisSubmitting}>
                {irisSubmitting ? "Saving..." : "➕ Add Lead to Pipeline"}
              </button>
            </div>
          )}

          {/* Pipeline Tab */}
          {irisTab === "pipeline" && (
            <div className="iris-pipeline">
              {irisCountsLoading ? (
                <div className="iris-loading">Loading pipeline...</div>
              ) : irisPipelineCounts ? (
                <>
                  <div className="iris-stage-counts">
                    {[
                      { key: "new_lead",              label: "New Lead",           emoji: "🆕" },
                      { key: "meeting_scheduled",     label: "Meeting Scheduled",  emoji: "📅" },
                      { key: "showed_up",             label: "Showed Up",          emoji: "✅" },
                      { key: "no_show",               label: "No Show",            emoji: "❌" },
                      { key: "interested",            label: "Interested",         emoji: "🔥" },
                      { key: "not_interested",        label: "Not Interested",     emoji: "👎" },
                      { key: "long_term_follow_up",   label: "Long Term",          emoji: "⏳" },
                      { key: "client_won",            label: "Client Won",         emoji: "🏆" },
                    ].map(s => (
                      <div key={s.key} className={`iris-stage-card ${s.key === "client_won" ? "won" : ""}`}>
                        <span className="iris-stage-emoji">{s.emoji}</span>
                        <span className="iris-stage-count">{irisPipelineCounts[s.key] || 0}</span>
                        <span className="iris-stage-label">{s.label}</span>
                      </div>
                    ))}
                  </div>

                  {irisRecentLeads.length > 0 && (
                    <div className="iris-recent-leads">
                      <div className="iris-recent-title">Recent Leads</div>
                      {irisRecentLeads.slice(0, 8).map(lead => (
                        <div key={lead.id} className="iris-lead-row">
                          <span className="iris-lead-name">{lead.name}</span>
                          <span className="iris-lead-clinic">{lead.organization_name || lead.city || "—"}</span>
                          <span className={`iris-lead-stage stage-${lead.stage?.replace(/_/g, "-")}`}>{lead.stage}</span>
                          <button
                            className="iris-lead-delete"
                            title="Delete lead"
                            onClick={() => {
                              showConfirm(`Delete "${lead.name}"? This cannot be undone.`).then(async (ok) => {
                                if (!ok) return;
                                await callAction({ action: "delete-lead", leadId: lead.id });
                                setIrisRecentLeads(prev => prev.filter(l => l.id !== lead.id));
                              });
                            }}
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="iris-empty">
                  <p>No pipeline data yet.</p>
                  <button className="iris-submit-btn" onClick={irisLoadPipeline}>Load Pipeline</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Custom themed confirm dialog */}
      {confirmDialog && (
        <div className="confirm-overlay" onClick={() => confirmDialog.onConfirm(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-msg">{confirmDialog.message}</p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => confirmDialog.onConfirm(false)}>
                Cancel
              </button>
              <button className="confirm-ok" onClick={() => confirmDialog.onConfirm(true)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
