"use client";

import {
  getOrganizationQueueSettings,
  listPractitionerQueuePrefixes,
  setOrganizationQueueMode,
  setPractitionerQueuePrefix,
  type PractitionerQueuePrefix,
  type QueueMode,
  type QueueSettings,
} from "@odyssey/supabase-client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAdminData } from "./admin-data-context";
import { PageHeader } from "./page-header";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function QueueManagement() {
  const { client, isSuperadmin, organization } = useAdminData();
  const [settings, setSettings] = useState<QueueSettings | null>(null);
  const [prefixes, setPrefixes] = useState<PractitionerQueuePrefix[]>([]);
  const [mode, setMode] = useState<QueueMode>("clinic_wide");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    setError(null);
    const [settingsResult, prefixesResult] = await Promise.all([
      getOrganizationQueueSettings(client, organization.id),
      listPractitionerQueuePrefixes(client, organization.id),
    ]);
    if (settingsResult.error || prefixesResult.error) {
      setError(settingsResult.error?.message ?? prefixesResult.error?.message ?? "Queue settings could not be loaded.");
      setLoading(false);
      return;
    }
    setSettings(settingsResult.data);
    setMode(settingsResult.data.queue_mode);
    setPrefixes(prefixesResult.data);
    setLoading(false);
  }, [client, organization]);

  useEffect(() => { void load(); }, [load]);

  async function saveMode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization || !settings || mode === settings.queue_mode) return;
    setSaving(true);
    setStatus(null);
    const result = await setOrganizationQueueMode(client, organization.id, mode);
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setSettings({ ...settings, queue_mode: result.data });
    setStatus("Queue mode saved. Existing labels remain unchanged.");
  }

  async function savePrefix(event: FormEvent<HTMLFormElement>, role: PractitionerQueuePrefix) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("prefix") ?? "").trim();
    const result = await setPractitionerQueuePrefix(client, role.practitioner_role_id, value || null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setPrefixes((current) => current.map((item) => item.practitioner_role_id === role.practitioner_role_id
      ? { ...item, queue_prefix: result.data }
      : item));
    setStatus(`Queue prefix saved for ${role.display_name}.`);
  }

  return (
    <>
      <PageHeader
        eyebrow="Day-of-visit configuration"
        title="Queue settings"
        description="Choose clinic-wide or per-practitioner labels. Queue labels are assigned by the database and existing labels are never reformatted."
      />
      {error ? <section className="data-error" role="alert"><strong>Queue settings could not be loaded.</strong><p>{error}</p><Button variant="outline" onClick={() => void load()}>Retry</Button></section> : null}
      {loading ? <section className="data-loading" aria-live="polite" aria-busy="true">Loading queue settings…</section> : null}
      {!loading && settings ? <>
        <section className="panel-section" aria-labelledby="queue-mode-heading">
          <h2 id="queue-mode-heading">Queue mode</h2>
          <form onSubmit={saveMode} className="stack">
            <label className="field-label" htmlFor="queue-mode">Numbering scope
              <select id="queue-mode" value={mode} onChange={(event) => setMode(event.target.value as QueueMode)} disabled={!settings.can_manage_queue_mode && !isSuperadmin}>
                <option value="clinic_wide">Clinic-wide (A-001, A-002…)</option>
                <option value="per_practitioner">Per practitioner (A-001, B-001…)</option>
              </select>
            </label>
            <Button type="submit" disabled={saving || (mode === settings.queue_mode) || (!settings.can_manage_queue_mode && !isSuperadmin)}>{saving ? "Saving…" : "Save queue mode"}</Button>
          </form>
          {status ? <p className="form-status" role="status">{status}</p> : null}
        </section>
        <section className="panel-section" aria-labelledby="queue-prefix-heading">
          <h2 id="queue-prefix-heading">Doctor prefixes</h2>
          <p>Leave a prefix blank to let the queue allocator assign the next unused letter when that doctor first receives a per-practitioner queue number.</p>
          {prefixes.length ? <div className="fee-overview-table"><table><caption className="sr-only">Per-practitioner queue prefixes</caption><thead><tr><th>Doctor</th><th>Prefix</th><th>Action</th></tr></thead><tbody>{prefixes.map((role) => <tr key={role.practitioner_role_id}><td>{role.display_name}</td><td><form onSubmit={(event) => void savePrefix(event, role)} className="inline-form"><Input name="prefix" aria-label={`Queue prefix for ${role.display_name}`} maxLength={1} pattern="[A-Za-z]" defaultValue={role.queue_prefix ?? ""} disabled={!settings.can_manage_queue_mode && !isSuperadmin} /><Button type="submit" variant="outline" disabled={!settings.can_manage_queue_mode && !isSuperadmin}>Save</Button></form></td><td>{role.role_code}</td></tr>)}</tbody></table></div> : <p className="table-empty">No active doctors are available.</p>}
        </section>
      </> : null}
    </>
  );
}
