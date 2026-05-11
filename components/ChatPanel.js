"use client";

import { useState, useEffect } from "react";
import { AGENT_BY_ID } from "../lib/agents.js";
import { loadChatHistory, saveChatMessages, loadLeadsFromSupabase, saveLeadsToSupabase, clearLeadsFromSupabase } from "../lib/supabase.js";

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
  const [selectedExportedFiles, setSelectedExportedFiles] = useState([]);
  const [surveyConfig, setSurveyConfig] = useState({ targets: [], users: [], settings: null });
  const [selectedTargetIds, setSelectedTargetIds] = useState([]);
  const [userByTarget, setUserByTarget] = useState({});
  const [answersByTarget, setAnswersByTarget] = useState({});

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
  const [maxCampaigns, setMaxCampaigns] = useState([]);
  const [maxAudience, setMaxAudience] = useState(null);
  const [maxTemplateId, setMaxTemplateId] = useState("");
  const [maxFromName, setMaxFromName] = useState("");
  const [maxReplyTo, setMaxReplyTo] = useState("");
  const [maxBookingLink, setMaxBookingLink] = useState("");

  // Cal state
  const [calSlots, setCalSlots] = useState([]);
  const [calSelectedSlot, setCalSelectedSlot] = useState(null);
  const [calAppointments, setCalAppointments] = useState([]);
  const [calBookingForm, setCalBookingForm] = useState({ summary: "", attendeeEmail: "", attendeeName: "" });
  const [calBookingLink, setCalBookingLink] = useState("");

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

  // Sends message AND adds response to chat + saves to Supabase
  async function sendAgentMessage(message, extraContext = {}) {
    const userMsg = { role: "user", text: message, handledBy: selectedAgentName };
    setMessages((prev) => [...prev, userMsg]);

    const data = await callAgentAPI(message, extraContext);

    const newMessages = [];
    if (data.routingMessage) {
      newMessages.push({ role: "system", text: data.routingMessage, handledBy: "luna" });
    }
    const handledByName = AGENT_BY_ID[data.handledBy]?.name || data.handledBy;
    const agentMsg = { role: "agent", text: data.response, handledBy: handledByName };
    newMessages.push(agentMsg);

    setMessages((prev) => [...prev, ...newMessages]);
    setSentByAgent((prev) => ({ ...prev, [selectedAgent]: true }));

    // Save to Supabase in background
    saveChatMessages(selectedAgent, [userMsg, ...newMessages]).catch(console.error);

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
        setMaxTemplateId(t.id);
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
  async function maxLoadCampaigns() {
    setLoading(true);
    try {
      const data = await callAction({ action: "list-campaigns" });
      setMaxCampaigns(data?.data?.campaigns || []);
      setMaxAudience(data?.data?.audience || null);
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  async function maxAddSelectedLeads() {
    const selected = rexLeads.filter((l) => rexSelectedIds.includes(l.id));
    if (!selected.length) {
      setMessages((p) => [...p, { role: "agent", text: "Select leads from Rex table first.", handledBy: "system" }]);
      return;
    }
    const withEmail = selected.filter((l) => l.email);
    if (!withEmail.length) {
      setMessages((p) => [...p, { role: "agent", text: `⚠️ None of the ${selected.length} selected leads have an email address. Mailchimp requires email to add contacts. Try selecting leads that have emails (shown in the Email column).`, handledBy: "Max" }]);
      return;
    }
    setLoading(true);
    try {
      const data = await callAction({ action: "add-leads", leads: withEmail });
      const added = data?.data?.added ?? 0;
      const errorDetails = data?.data?.errorDetails || [];
      const skipped = selected.length - withEmail.length;
      let msg = `✅ ${added} lead${added !== 1 ? "s" : ""} added to Max / Mailchimp audience.`;
      if (errorDetails.length > 0) {
        msg += `\n\n⚠️ ${errorDetails.length} failed:\n` + errorDetails.map((e) => `• ${e.email}: ${e.error}`).join("\n");
      }
      if (skipped > 0) msg += `\n• ${skipped} skipped (no email)`;
      setMessages((p) => [...p, { role: "agent", text: msg, handledBy: "Max" }]);
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
  }

  async function maxCreateDrip() {
    setLoading(true);
    try {
      const data = await callAction({
        action: "create-drip",
        templateId: maxTemplateId,
        fromName: maxFromName,
        replyTo: maxReplyTo,
        bookingLink: maxBookingLink,
      });
      const msg = data?.data?.campaigns ? `✅ Drip sequence created (${data.data.campaigns.length} emails scheduled).` : "Drip sequence created.";
      setMessages((p) => [...p, { role: "agent", text: msg, handledBy: "Max" }]);
      await maxLoadCampaigns();
    } catch (e) {
      setMessages((p) => [...p, { role: "agent", text: `Error: ${e.message}`, handledBy: "system" }]);
    } finally { setLoading(false); }
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

  return (
    <section className="chat">
      <div className="chat-header">
        <h1>GHL Agent Hub</h1>
        <span className="badge">Active: {selectedAgentName}</span>
      </div>

      <div className="messages">
        {historyLoading ? (
          <div className="msg agent">
            <span className="msg-label">system</span>
            <p>Loading chat history...</p>
          </div>
        ) : messages.length === 0 ? (
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
        {loading && (
          <div className="msg agent">
            <span className="msg-label">typing...</span>
            <p className="typing-indicator"><span /><span /><span /></p>
          </div>
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
            {rexSelectedIds.length > 0 && (
              <button className="rex-btn send-max" onClick={maxAddSelectedLeads} disabled={loading}>
                Send {rexSelectedIds.length} to Max
              </button>
            )}
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
                      <button className="nora-btn" onClick={() => setMaxTemplateId(t.id)} style={{ background: "#0ea5e9", fontSize: 11 }}>Use in Max</button>
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
          {maxAudience && (
            <div className="max-stats-row">
              <div className="max-stat-card"><div className="stat-value">{maxAudience.memberCount}</div><div className="stat-label">Contacts</div></div>
              <div className="max-stat-card"><div className="stat-value">{maxAudience.openRate}</div><div className="stat-label">Open Rate</div></div>
              <div className="max-stat-card"><div className="stat-value">{maxAudience.clickRate}</div><div className="stat-label">Click Rate</div></div>
              <div className="max-stat-card"><div className="stat-value">{maxCampaigns.length}</div><div className="stat-label">Campaigns</div></div>
            </div>
          )}
          <div className="max-form">
            <input placeholder="Nora Template ID (paste from Nora Library)" value={maxTemplateId} onChange={(e) => setMaxTemplateId(e.target.value)} />
            <input placeholder="From name (e.g. John at Bucktooth)" value={maxFromName} onChange={(e) => setMaxFromName(e.target.value)} />
            <input placeholder="Reply-to email" value={maxReplyTo} onChange={(e) => setMaxReplyTo(e.target.value)} />
            <input placeholder="Booking link (from Cal)" value={maxBookingLink} onChange={(e) => setMaxBookingLink(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="max-btn" onClick={maxAddSelectedLeads} disabled={loading}>Add Rex Leads to Mailchimp</button>
            <button className="max-btn" onClick={maxCreateDrip} disabled={loading || !maxTemplateId}>Create Drip Sequence</button>
            <button className="max-btn" style={{ background: "#1e3a5f" }} onClick={maxLoadCampaigns} disabled={loading}>Refresh Campaigns</button>
          </div>
          {maxCampaigns.length > 0 && (
            <div className="max-campaign-list">
              {maxCampaigns.map((c) => (
                <div key={c.id} className="max-campaign-item">
                  <div>
                    <strong style={{ fontSize: 13 }}>{c.subject}</strong>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Opens: {c.openRate} · Clicks: {c.clickRate} · Sent: {c.emailsSent}</div>
                  </div>
                  <span className={`max-campaign-status ${c.status}`}>{c.status}</span>
                </div>
              ))}
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
    </section>
  );
}
