"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const TREATMENTS = [
  "General Dentistry",
  "Teeth Whitening",
  "Dental Implants",
  "Orthodontics / Braces / Invisalign",
  "Veneers & Cosmetic Dentistry",
  "Root Canal Treatment",
  "Dental Crowns & Bridges",
  "Emergency Dental Care",
  "Pediatric Dentistry",
  "Gum Disease Treatment",
  "Wisdom Teeth Removal",
  "Other",
];

const CONTACT_TIMES = [
  "Morning (9am – 12pm)",
  "Afternoon (12pm – 3pm)",
  "Evening (3pm – 6pm)",
  "Anytime",
];

export default function IntakePage() {
  const { token } = useParams();
  const [lead, setLead] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | form | submitting | done | error | invalid
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState({
    name: "",
    clinic_name: "",
    treatments: [],
    contact_time: "",
    questions: "",
  });

  // Load lead by token
  useEffect(() => {
    if (!token) return;
    fetch(`/api/intake/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error || !data.lead) {
          setStatus("invalid");
          return;
        }
        // If already submitted, show done
        if (data.lead.intake_submitted_at) {
          setStatus("done");
          return;
        }
        setLead(data.lead);
        setForm((prev) => ({
          ...prev,
          name:        data.lead.name || "",
          clinic_name: data.lead.clinic_name || "",
        }));
        setStatus("form");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  function toggleTreatment(t) {
    setForm((prev) => ({
      ...prev,
      treatments: prev.treatments.includes(t)
        ? prev.treatments.filter((x) => x !== t)
        : [...prev.treatments, t],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.clinic_name.trim()) {
      setErrorMsg("Please fill in your name and clinic name.");
      return;
    }
    setErrorMsg("");
    setStatus("submitting");

    const res = await fetch(`/api/intake/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setStatus("done");
    } else {
      const body = await res.json().catch(() => ({}));
      setStatus("form");
      setErrorMsg(body.error || "Something went wrong. Please try again.");
    }
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <Logo />
          <p style={styles.loadingText}>Loading…</p>
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <Logo />
          <h2 style={styles.heading}>Link not found</h2>
          <p style={styles.sub}>This link may have expired or is no longer valid. Please contact us directly.</p>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <Logo />
          <div style={styles.successIcon}>✅</div>
          <h2 style={styles.heading}>Thank you!</h2>
          <p style={styles.sub}>
            We've received your details and will be in touch shortly to schedule a free strategy call.
          </p>
          <p style={styles.sub} style={{ marginTop: 8, color: "#94a3b8", fontSize: 13 }}>
            — Donia, NovaFlow AI
          </p>
        </div>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <Logo />
        <h1 style={styles.heading}>Tell us about your practice</h1>
        <p style={styles.sub}>
          Takes 2 minutes. We'll use this to put together a custom growth plan for your clinic.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Name */}
          <label style={styles.label}>
            Your name <span style={styles.required}>*</span>
          </label>
          <input
            style={styles.input}
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Dr. Sarah Khan"
            required
          />

          {/* Clinic name */}
          <label style={styles.label}>
            Clinic name <span style={styles.required}>*</span>
          </label>
          <input
            style={styles.input}
            type="text"
            value={form.clinic_name}
            onChange={(e) => setForm({ ...form, clinic_name: e.target.value })}
            placeholder="e.g. Bright Smiles Dental"
            required
          />

          {/* Treatments */}
          <label style={styles.label}>
            Which treatments do you offer? <span style={styles.optional}>(optional)</span>
          </label>
          <div style={styles.checkboxGrid}>
            {TREATMENTS.map((t) => (
              <label key={t} style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.treatments.includes(t)}
                  onChange={() => toggleTreatment(t)}
                  style={styles.checkbox}
                />
                {t}
              </label>
            ))}
          </div>

          {/* Contact time */}
          <label style={styles.label}>
            Best time to contact you <span style={styles.optional}>(optional)</span>
          </label>
          <div style={styles.radioGroup}>
            {CONTACT_TIMES.map((ct) => (
              <label key={ct} style={styles.radioLabel}>
                <input
                  type="radio"
                  name="contact_time"
                  value={ct}
                  checked={form.contact_time === ct}
                  onChange={() => setForm({ ...form, contact_time: ct })}
                  style={styles.checkbox}
                />
                {ct}
              </label>
            ))}
          </div>

          {/* Questions */}
          <label style={styles.label}>
            Any questions or specific goals? <span style={styles.optional}>(optional)</span>
          </label>
          <textarea
            style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
            value={form.questions}
            onChange={(e) => setForm({ ...form, questions: e.target.value })}
            placeholder="e.g. We want to attract more implant patients…"
          />

          {errorMsg && <p style={styles.errorMsg}>{errorMsg}</p>}

          <button
            type="submit"
            style={styles.button}
            disabled={status === "submitting"}
          >
            {status === "submitting" ? "Submitting…" : "Submit →"}
          </button>
        </form>

        <p style={styles.footer}>
          NovaFlow AI · Dental Marketing Specialists
        </p>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div style={styles.logoWrap}>
      <div style={styles.logoIcon}>N</div>
      <span style={styles.logoText}>NovaFlow AI</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "48px 16px 80px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: "40px 36px",
    maxWidth: 560,
    width: "100%",
    boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
  },
  logoWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 28,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 800,
    fontSize: 18,
  },
  logoText: {
    color: "#f1f5f9",
    fontWeight: 700,
    fontSize: 18,
    letterSpacing: "-0.3px",
  },
  heading: {
    color: "#f1f5f9",
    fontSize: 22,
    fontWeight: 700,
    margin: "0 0 8px",
    letterSpacing: "-0.3px",
  },
  sub: {
    color: "#94a3b8",
    fontSize: 14,
    margin: "0 0 28px",
    lineHeight: 1.5,
  },
  loadingText: {
    color: "#64748b",
    fontSize: 14,
    margin: 0,
  },
  successIcon: {
    fontSize: 40,
    marginBottom: 16,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  label: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: 600,
    marginTop: 16,
    marginBottom: 6,
    display: "block",
  },
  required: {
    color: "#ef4444",
    marginLeft: 2,
  },
  optional: {
    color: "#475569",
    fontWeight: 400,
    marginLeft: 4,
  },
  input: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 8,
    color: "#f1f5f9",
    fontSize: 14,
    padding: "10px 14px",
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  checkboxGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px 12px",
    marginTop: 4,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "#cbd5e1",
    fontSize: 13,
    cursor: "pointer",
  },
  checkbox: {
    accentColor: "#2563eb",
    width: 15,
    height: 15,
    cursor: "pointer",
  },
  radioGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 4,
  },
  radioLabel: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "#cbd5e1",
    fontSize: 13,
    cursor: "pointer",
  },
  errorMsg: {
    color: "#f87171",
    fontSize: 13,
    marginTop: 8,
    padding: "8px 12px",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: 6,
  },
  button: {
    marginTop: 24,
    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px 24px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.2s",
    width: "100%",
  },
  footer: {
    color: "#475569",
    fontSize: 12,
    textAlign: "center",
    marginTop: 28,
    marginBottom: 0,
  },
};
