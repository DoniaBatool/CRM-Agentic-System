import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _client = null;

export function getSupabase() {
  if (!url || !key) return null;
  if (!_client) {
    _client = createClient(url, key);
  }
  return _client;
}

// ─── Chat history helpers ──────────────────────────────────────────────────────

export async function loadChatHistory(agentId) {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("chat_messages")
    .select("role, text, handled_by, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    console.error("Supabase loadChatHistory error:", error.message);
    return [];
  }
  return (data || []).map((row) => ({
    role: row.role,
    text: row.text,
    handledBy: row.handled_by,
  }));
}

export async function saveChatMessages(agentId, messages) {
  const sb = getSupabase();
  if (!sb) return;
  const rows = messages.map((m) => ({
    agent_id: agentId,
    role: m.role,
    text: m.text,
    handled_by: m.handledBy || null,
  }));
  const { error } = await sb.from("chat_messages").insert(rows);
  if (error) {
    console.error("Supabase saveChatMessages error:", error.message);
  }
}

export async function clearChatHistory(agentId) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("chat_messages").delete().eq("agent_id", agentId);
}

// ─── Rex leads helpers ────────────────────────────────────────────────────────

export async function loadLeadsFromSupabase() {
  const sb = getSupabase();
  if (!sb) return null; // null = fallback to JSON file
  const { data, error } = await sb
    .from("rex_leads")
    .select("*")
    .order("scraped_at", { ascending: false });
  if (error) {
    console.error("Supabase loadLeads error:", error.message);
    return null;
  }
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    website: row.website,
    rating: row.rating,
    category: row.category,
    source: row.source,
    industry: row.industry,
    scrapedAt: row.scraped_at,
  }));
}

export async function saveLeadsToSupabase(leads) {
  const sb = getSupabase();
  if (!sb) return false;
  const rows = leads.map((l) => ({
    id: l.id,
    name: l.name || null,
    email: l.email || null,
    phone: l.phone || null,
    address: l.address || null,
    city: l.city || null,
    website: l.website || null,
    rating: l.rating || null,
    category: l.category || null,
    source: l.source || null,
    industry: l.industry || l.category || null,
    scraped_at: l.scrapedAt || new Date().toISOString(),
  }));
  const { error } = await sb.from("rex_leads").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("Supabase saveLeads error:", error.message);
    return false;
  }
  return true;
}

export async function clearLeadsFromSupabase() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("rex_leads").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}
