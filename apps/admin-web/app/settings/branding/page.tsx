"use client";

import { getOrganizationBranding, saveOrganizationBranding } from "@odyssey/supabase-client";
import { Save } from "lucide-react";
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
    });
    return () => { current = false; };
  }, [client, organization]);

  if (!email && accessError) return <AdminSignIn />;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setSaving(true);
    setStatus("");
    const result = await saveOrganizationBranding(client, organization.id, { displayName: name, tagline, logoUrl, primaryColor: color, accentColor: accent, supportEmail, supportPhone });
    setStatus(result.error?.message ?? "Brand configuration saved to the database.");
    setSaving(false);
  }

  return (
    <form onSubmit={save}>
      <PageHeader eyebrow="Clinic configuration" title="Clinic branding" description="Manage clinic-facing identity for approved patient documents and digital touchpoints." actions={<Button disabled={saving || !organization} type="submit"><Save aria-hidden="true" size={16} />{saving ? "Saving..." : "Save and publish"}</Button>} />
      <div className="form-preview-grid">
        <section className="form-section">
          <div className="section-title"><h2>Identity</h2><p>Values are loaded from the selected organization's branding record.</p></div>
          <div className="form-grid">
            <label className="field-label field-span">Clinic display name<Input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label className="field-label field-span">Tagline<Input value={tagline} onChange={(event) => setTagline(event.target.value)} /></label>
            <label className="field-label field-span">Logo URL<Input type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} /></label>
            <label className="field-label">Primary brand color<span className="color-input"><input aria-label="Primary brand color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /><Input pattern="#[0-9a-fA-F]{6}" value={color.toUpperCase()} onChange={(event) => setColor(event.target.value)} /></span></label>
            <label className="field-label">Accent color<span className="color-input"><input aria-label="Accent color" type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /><Input pattern="#[0-9a-fA-F]{6}" value={accent.toUpperCase()} onChange={(event) => setAccent(event.target.value)} /></span></label>
            <label className="field-label">Support email<Input type="email" value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} /></label>
            <label className="field-label">Support phone<Input value={supportPhone} onChange={(event) => setSupportPhone(event.target.value)} /></label>
            {status ? <p className="field-span form-status" role="status">{status}</p> : null}
          </div>
        </section>
        <aside className="preview-panel">
          <div className="section-title"><h2>Live preview</h2><p>Patient document header</p></div>
          <div className="brand-document">
            <div className="brand-document__header" style={{ borderColor: color }}>
              {logoUrl ? <div aria-label="Clinic logo preview" className="preview-logo-image" role="img" style={{ backgroundImage: `url(${logoUrl})` }} /> : <div className="preview-logo" style={{ background: color }}>{(name || organization?.name || "C").slice(0, 1).toUpperCase()}</div>}
              <div><strong>{name || organization?.name || "Clinic name not configured"}</strong><span>{supportEmail || "Support contact not configured"}</span></div>
            </div>
            <h3>Clinical visit summary</h3><div className="preview-lines"><span /><span /><span /><span /></div><div className="preview-footer" style={{ color: accent }}>{tagline || "No clinic tagline configured"}</div>
          </div>
        </aside>
      </div>
    </form>
  );
}
