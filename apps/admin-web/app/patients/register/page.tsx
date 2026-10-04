"use client";

import { createWalkInPatient } from "@odyssey/supabase-client";
import type { WalkInCredentials } from "@odyssey/types";
import { CheckCircle2, Copy, KeyRound, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { AdminSignIn } from "../../../components/admin-sign-in";
import { useAdminData } from "../../../components/admin-data-context";
import { PageHeader } from "../../../components/page-header";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

function CredentialValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="walk-in-credential">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <Button
        aria-label={`Copy ${label.toLowerCase()}`}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => void copyValue()}
      >
        <Copy aria-hidden="true" size={14} />
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export default function WalkInRegistrationPage() {
  const { client, email, error: accessError, organization } = useAdminData();
  const [credentials, setCredentials] = useState<WalkInCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!email && accessError) return <AdminSignIn />;

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!organization) {
      setError("Select a clinic organization before registering a walk-in patient.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (name.length < 2) {
      setError("Enter the patient's full name.");
      return;
    }

    setSaving(true);
    setError(null);
    setCredentials(null);
    const result = await createWalkInPatient(client, {
      organizationId: organization.id,
      name,
      birthDate: String(form.get("birthDate") || "") || null,
      gender: String(form.get("gender") || "") || null,
      telecom: String(form.get("phone") || "") || null,
    });
    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setCredentials(result.data);
    formElement.reset();
  }

  return (
    <>
      <PageHeader
        eyebrow="Front desk intake"
        title="Register walk-in patient"
        description="Create a clinic-scoped walk-in record and issue the patient credentials needed to access their records later."
      />

      <div className="form-preview-grid walk-in-layout">
        <section className="form-section" aria-labelledby="walk-in-form-title">
          <div className="section-title">
            <p className="section-eyebrow">New patient intake</p>
            <h2 id="walk-in-form-title">Patient details</h2>
            <p>Only the information needed to identify the patient is required at registration.</p>
          </div>
          <form className="form-grid" onSubmit={register}>
            <label className="field-label field-span">
              Full name
              <Input autoComplete="name" name="name" placeholder="e.g. Maria Santos" required />
            </label>
            <label className="field-label">
              Date of birth <span className="field-optional">Optional</span>
              <Input name="birthDate" type="date" />
            </label>
            <label className="field-label">
              Sex / gender <span className="field-optional">Optional</span>
              <select className="ui-input" defaultValue="" name="gender">
                <option value="">Not recorded</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label className="field-label field-span">
              Mobile number <span className="field-optional">Optional</span>
              <Input autoComplete="tel" name="phone" placeholder="09XX XXX XXXX" type="tel" />
            </label>
            {error ? <p className="form-error field-span" role="alert">{error}</p> : null}
            <div className="dialog-actions field-span">
              <Button disabled={saving || !organization} type="submit">
                <UserPlus aria-hidden="true" size={16} />
                {saving ? "Registering…" : "Register walk-in"}
              </Button>
            </div>
          </form>
        </section>

        <aside className="preview-panel walk-in-guidance" aria-labelledby="walk-in-guidance-title">
          <div className="section-title">
            <p className="section-eyebrow">Front desk handoff</p>
            <h2 id="walk-in-guidance-title">What happens next</h2>
          </div>
          <ol>
            <li>Give the patient the walk-in ID and one-time PIN shown after registration.</li>
            <li>Use Booking / Appointments to attach this patient to an available service slot.</li>
            <li>After payment or an approved exception, check the appointment in from the schedule.</li>
          </ol>
          <p className="walk-in-security-note"><KeyRound aria-hidden="true" size={16} />The PIN is returned once and is never displayed from the patient record later.</p>
        </aside>
      </div>

      {credentials ? (
        <section className="identity-result walk-in-result" aria-live="polite" aria-labelledby="walk-in-result-title">
          <div className="identity-result__heading">
            <CheckCircle2 aria-hidden="true" size={22} />
            <div>
              <h2 id="walk-in-result-title">Walk-in registered</h2>
              <p>Write these credentials down or hand them to the patient now.</p>
            </div>
          </div>
          <div className="walk-in-credentials">
            <CredentialValue label="Walk-in ID" value={credentials.walkInId} />
            <CredentialValue label="One-time PIN" value={credentials.pin} />
          </div>
          <p className="form-status">The patient record was created in {organization?.name ?? "the selected clinic"}. Continue to Booking / Appointments when you are ready to schedule the visit.</p>
        </section>
      ) : null}
    </>
  );
}
