"use client";

import { getOrganizationBranding, saveOrganizationBranding } from "@odyssey/supabase-client";
import { Building2, Calendar, Clock, MapPin, MessageSquareText, Palette, Save, ShieldAlert, Video } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { AdminSignIn } from "../../../components/admin-sign-in";
import { useAdminData } from "../../../components/admin-data-context";
import { PageHeader } from "../../../components/page-header";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

const defaultColor = "#087f7a";

export default function BrandingPage() {
  const { client, email, error: accessError, organization } = useAdminData();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [color, setColor] = useState(defaultColor);
  const [accent, setAccent] = useState(defaultColor);
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [clinicVisitMessage, setClinicVisitMessage] = useState("");
  const [teleconsultMessage, setTeleconsultMessage] = useState("");
  const [bookingConfirmationMessage, setBookingConfirmationMessage] = useState("");
  const [previewTab, setPreviewTab] = useState<"document" | "modal_clinic" | "modal_teleconsult">("modal_clinic");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!organization) return;
    let current = true;
    void getOrganizationBranding(client, organization.id).then((result) => {
      if (!current) return;
      if (result.error) { setStatus(result.error.message); return; }
      setName(result.data.displayName);
      setTagline(result.data.tagline ?? "");
      setLogoUrl(result.data.logoUrl ?? "");
      setColor(result.data.primaryColor);
      setAccent(result.data.accentColor);
      setSupportEmail(result.data.supportEmail ?? "");
      setSupportPhone(result.data.supportPhone ?? "");
      setClinicVisitMessage(result.data.clinicVisitMessage ?? "");
      setTeleconsultMessage(result.data.teleconsultMessage ?? "");
      setBookingConfirmationMessage(result.data.bookingConfirmationMessage ?? "");
    });
    return () => { current = false; };
  }, [client, organization]);

  if (!email && accessError) return <AdminSignIn />;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setSaving(true);
    setStatus("");
    const result = await saveOrganizationBranding(client, organization.id, {
      displayName: name,
      tagline,
      logoUrl,
      primaryColor: color,
      accentColor: accent,
      supportEmail,
      supportPhone,
      clinicVisitMessage,
      teleconsultMessage,
      bookingConfirmationMessage,
    });
    setStatus(result.error?.message ?? "Brand & CMS configuration saved successfully.");
    setSaving(false);
  }

  return (
    <form onSubmit={save}>
      <PageHeader
        eyebrow="Company configuration"
        title="Company & Clinic Settings (CMS)"
        description="Manage company identity, brand styles, and patient booking confirmation messages."
        actions={<Button disabled={saving || !organization} type="submit"><Save aria-hidden="true" size={16} />{saving ? "Saving..." : "Save and publish"}</Button>}
      />
      <div className="form-preview-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Identity Section */}
          <section className="form-section">
            <div className="section-title">
              <h2>Company Identity & Branding</h2>
              <p>Values are loaded from the company's branding record and applied across patient touchpoints.</p>
            </div>
            <div className="form-grid">
              <label className="field-label field-span">Clinic display name<Input value={name} onChange={(event) => setName(event.target.value)} required /></label>
              <label className="field-label field-span">Tagline<Input value={tagline} onChange={(event) => setTagline(event.target.value)} /></label>
              <label className="field-label field-span">Logo URL<Input type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} /></label>
              <label className="field-label">Primary brand color<span className="color-input"><input aria-label="Primary brand color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /><Input pattern="#[0-9a-fA-F]{6}" value={color.toUpperCase()} onChange={(event) => setColor(event.target.value)} /></span></label>
              <label className="field-label">Accent color<span className="color-input"><input aria-label="Accent color" type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /><Input pattern="#[0-9a-fA-F]{6}" value={accent.toUpperCase()} onChange={(event) => setAccent(event.target.value)} /></span></label>
              <label className="field-label">Support email<Input type="email" value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} /></label>
              <label className="field-label">Support phone<Input value={supportPhone} onChange={(event) => setSupportPhone(event.target.value)} /></label>
            </div>
          </section>

          {/* Booking Confirmation CMS Section */}
          <section className="form-section">
            <div className="section-title">
              <h2>Booking Confirmation Message Modal (CMS)</h2>
              <p>Configure custom guidance and advisories presented to patients inside the confirmation modal before they complete their booking.</p>
            </div>
            <div className="form-grid">
              <label className="field-label field-span">
                Clinic Visit Confirmation Message (CMS)
                <span className="field-hint" style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", display: "block", marginBottom: "0.35rem" }}>
                  Shown in the confirmation modal when a patient books an in-person clinic visit.
                </span>
                <textarea
                  className="ui-input"
                  style={{ minHeight: "5.5rem", resize: "vertical", padding: "0.6rem", width: "100%", borderRadius: "0.5rem", border: "1px solid var(--border)" }}
                  placeholder="e.g. Please arrive at the clinic at least 15 minutes before your appointment with a valid ID and relevant previous medical records."
                  value={clinicVisitMessage}
                  onChange={(event) => setClinicVisitMessage(event.target.value)}
                />
              </label>

              <label className="field-label field-span">
                Tele-Consultation Confirmation Message (CMS)
                <span className="field-hint" style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", display: "block", marginBottom: "0.35rem" }}>
                  Shown in the confirmation modal when a patient books a virtual tele-consultation.
                </span>
                <textarea
                  className="ui-input"
                  style={{ minHeight: "5.5rem", resize: "vertical", padding: "0.6rem", width: "100%", borderRadius: "0.5rem", border: "1px solid var(--border)" }}
                  placeholder="e.g. Please ensure a stable internet connection and quiet environment. The encrypted video room link will open 30 minutes before your scheduled appointment."
                  value={teleconsultMessage}
                  onChange={(event) => setTeleconsultMessage(event.target.value)}
                />
              </label>

              <label className="field-label field-span">
                General Booking Notice / Policy (CMS)
                <span className="field-hint" style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", display: "block", marginBottom: "0.35rem" }}>
                  Optional general policy or notice displayed at the bottom of the confirmation modal.
                </span>
                <textarea
                  className="ui-input"
                  style={{ minHeight: "4rem", resize: "vertical", padding: "0.6rem", width: "100%", borderRadius: "0.5rem", border: "1px solid var(--border)" }}
                  placeholder="e.g. Cancellations or rescheduling requests must be submitted at least 2 hours prior to the appointment."
                  value={bookingConfirmationMessage}
                  onChange={(event) => setBookingConfirmationMessage(event.target.value)}
                />
              </label>

              {status ? <p className="field-span form-status" role="status">{status}</p> : null}
            </div>
          </section>
        </div>

        {/* Live Preview Panel */}
        <aside className="preview-panel">
          <div className="section-title">
            <h2>Live CMS preview</h2>
            <p>Real-time rendering of patient-facing modal and document headers.</p>
          </div>

          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem" }}>
            <button
              type="button"
              className={`ui-button ${previewTab === "modal_clinic" ? "ui-button--primary" : "ui-button--outline"}`}
              style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
              onClick={() => setPreviewTab("modal_clinic")}
            >
              Clinic Modal
            </button>
            <button
              type="button"
              className={`ui-button ${previewTab === "modal_teleconsult" ? "ui-button--primary" : "ui-button--outline"}`}
              style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
              onClick={() => setPreviewTab("modal_teleconsult")}
            >
              Teleconsult Modal
            </button>
            <button
              type="button"
              className={`ui-button ${previewTab === "document" ? "ui-button--primary" : "ui-button--outline"}`}
              style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
              onClick={() => setPreviewTab("document")}
            >
              Doc Header
            </button>
          </div>

          {previewTab === "document" ? (
            <div className="brand-document">
              <div className="brand-document__header" style={{ borderColor: color }}>
                {logoUrl ? <div aria-label="Clinic logo preview" className="preview-logo-image" role="img" style={{ backgroundImage: `url(${logoUrl})` }} /> : <div className="preview-logo" style={{ background: color }}>{(name || organization?.name || "C").slice(0, 1).toUpperCase()}</div>}
                <div><strong>{name || organization?.name || "Clinic name not configured"}</strong><span>{supportEmail || "Support contact not configured"}</span></div>
              </div>
              <h3>Clinical visit summary</h3>
              <div className="preview-lines"><span /><span /><span /><span /></div>
              <div className="preview-footer" style={{ color: accent }}>{tagline || "No clinic tagline configured"}</div>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "1rem",
                padding: "1.25rem",
                background: "var(--card)",
                boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.2rem 0.6rem",
                    borderRadius: "2rem",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    background: previewTab === "modal_clinic" ? "#e8f5f0" : "#eff2ff",
                    color: previewTab === "modal_clinic" ? "#087f75" : "#4e5ba6",
                  }}
                >
                  {previewTab === "modal_clinic" ? <Building2 size={13} /> : <Video size={13} />}
                  {previewTab === "modal_clinic" ? "In-Person Clinic Visit" : "Virtual Tele-Consultation"}
                </span>
                <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Preview</span>
              </div>

              <h4 style={{ margin: 0, fontSize: "1.05rem" }}>
                Confirm your {previewTab === "modal_clinic" ? "Clinic Visit" : "Tele-Consultation"}
              </h4>

              <div
                style={{
                  background: "var(--muted)",
                  padding: "0.75rem",
                  borderRadius: "0.6rem",
                  fontSize: "0.82rem",
                  display: "grid",
                  gap: "0.4rem",
                }}
              >
                <div><strong>Location:</strong> {name || organization?.name || "Clinic Name"}</div>
                <div><strong>Service:</strong> General Consultation</div>
                <div><strong>Date & Time:</strong> Saturday, Sep 26, 2026 • 10:30 AM</div>
              </div>

              {/* CMS Message Preview */}
              <div
                style={{
                  border: "1px solid #fed7aa",
                  background: "#fffaf0",
                  padding: "0.75rem",
                  borderRadius: "0.6rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#9a3412", fontWeight: 700, fontSize: "0.8rem", marginBottom: "0.3rem" }}>
                  <ShieldAlert size={14} />
                  Clinic Instructions & Notice
                </div>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#7c2d12", lineHeight: 1.45 }}>
                  {previewTab === "modal_clinic"
                    ? clinicVisitMessage.trim() || "Please arrive at the clinic at least 15 minutes before your scheduled appointment time. Bring a valid government-issued photo ID and any relevant prior medical records."
                    : teleconsultMessage.trim() || "Please ensure you are in a quiet, well-lit environment with a stable internet connection. Your encrypted consultation video room link will automatically open 30 minutes prior."}
                </p>
                {bookingConfirmationMessage.trim() ? (
                  <p style={{ marginTop: "0.5rem", marginBottom: 0, fontSize: "0.72rem", color: "#9a3412" }}>
                    {bookingConfirmationMessage.trim()}
                  </p>
                ) : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "0.5rem", marginTop: "0.3rem" }}>
                <button type="button" className="ui-button ui-button--outline" style={{ fontSize: "0.78rem" }}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--primary"
                  style={{ background: color, borderColor: color, fontSize: "0.78rem" }}
                >
                  {previewTab === "modal_clinic" ? "Confirm Clinic Visit" : "Confirm Tele-Consultation"}
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </form>
  );
}
