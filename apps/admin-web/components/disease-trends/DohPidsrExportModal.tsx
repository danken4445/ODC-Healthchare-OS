"use client";

import { Download, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useAdminData } from "../admin-data-context";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

const EXPORT_PERMISSION = "can_export_epidemiology_records";

export function DohPidsrExportModal({ epiYear, epiWeek }: { epiYear: number; epiWeek: number }) {
  const { client, organization, permissions } = useAdminData();
  const canExport = permissions.includes(EXPORT_PERMISSION as typeof permissions[number]);
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  if (!canExport || !organization) return null;
  const release = async () => {
    setError(null);
    if (purpose.trim().length < 10) { setError("State the statutory reporting purpose (at least 10 characters)."); return; }
    setSubmitting(true);
    try {
      const { data: session } = await client.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Your session has expired. Sign in again before releasing a report.");
      const response = await fetch("/api/disease-surveillance/doh-pidsr-export", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ organizationId: organization.id, purpose: purpose.trim(), epiYear, epiWeek }) });
      if (!response.ok) { const result = await response.json().catch(() => null) as { error?: string } | null; throw new Error(result?.error ?? "DOH export could not be created."); }
      const file = await response.blob();
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `doh-pidsr-${epiYear}-w${String(epiWeek).padStart(2, "0")}.enc`; anchor.click(); URL.revokeObjectURL(url);
      setOpen(false); setPurpose("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "DOH export could not be created."); } finally { setSubmitting(false); }
  };
  return <><Button variant="outline" onClick={() => setOpen(true)}><LockKeyhole aria-hidden="true" size={16} />DOH PIDSR export</Button><Dialog open={open} onOpenChange={setOpen} title="Release encrypted DOH PIDSR report" description="This statutory release is limited to Category I and II notifiable diseases. An immutable audit event is written before download."><div style={{ display: "grid", gap: "0.9rem" }}><p className="page-description">The encrypted file contains DOH Case Investigation Form records for epidemiological week {epiWeek}, {epiYear}. HIV/AIDS, mental health, substance use, and reproductive-health records are excluded.</p><div><label htmlFor="doh-export-purpose" style={labelStyle}>Statutory reporting purpose</label><textarea id="doh-export-purpose" className="ui-input" rows={4} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="e.g. RA 11332 mandatory weekly Category II notification to DOH Epidemiology Bureau" /></div>{error ? <p role="alert" style={{ color: "var(--status-danger, #b42318)", margin: 0 }}>{error}</p> : null}<div style={{ display: "flex", justifyContent: "end", gap: "0.6rem" }}><Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button><Button onClick={release} disabled={submitting}>{submitting ? "Encrypting…" : <><Download aria-hidden="true" size={16} />Audit and download</>}</Button></div></div></Dialog></>;
}

const labelStyle = { display: "block", marginBottom: "0.3rem", color: "var(--muted-foreground)", fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" } as const;
