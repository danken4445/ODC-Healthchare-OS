"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getDoctorManagement, type DoctorManagementRow } from "@odyssey/supabase-client";
import { useAdminData } from "../../components/admin-data-context";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/page-header";

function today() { return new Date().toISOString().slice(0, 10); }

export default function DoctorManagementPage() {
  const { client, organization } = useAdminData();
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<DoctorManagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true); setError(null);
    const result = await getDoctorManagement(client, organization.id, date);
    if (result.error) setError(result.error.message); else setRows(result.data ?? []);
    setLoading(false);
  }, [client, date, organization]);
  useEffect(() => { void load(); }, [load]);
  return <div className="vesper-page-container">
    <PageHeader eyebrow="Clinical staffing" title="Doctor management" description="Read-only organization view of service assignments, today's room, queue prefix, and private-clinic fee declaration status." actions={<Button variant="outline" onClick={() => void load()} disabled={loading}>Refresh</Button>} />
    <section className="vesper-card"><div className="vesper-card__header"><div><h2 className="vesper-card__title">Doctor overview</h2><p className="vesper-card__subtitle">Review the existing service, room, queue, and fee editors from this view.</p></div><label className="ui-field"><span className="ui-field__label">Assignment date</span><input className="ui-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
      {error ? <p className="data-error" role="alert">{error}</p> : null}
      <div className="vesper-table-container"><table className="vesper-table"><caption className="sr-only">Doctor management overview</caption><thead><tr><th>Doctor</th><th>Assigned services</th><th>Today's room</th><th>Queue prefix</th><th>Declared fees</th><th>Editors</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="table-empty">Loading doctors…</td></tr> : rows.length ? rows.map((row) => <tr key={row.practitioner_role_id}><th scope="row">{row.doctor_name}</th><td>{row.assigned_services?.length ? row.assigned_services.join(", ") : "None"}</td><td>{row.room_label ?? "Not assigned"}</td><td>{row.queue_prefix ?? "Automatic"}</td><td>{row.declared_fee_summary ?? "Not applicable"}</td><td><span className="room-chip-list"><Link href="/settings/services">Services</Link><Link href="/rooms">Rooms</Link><Link href="/fees">Fees</Link></span></td></tr>) : <tr><td colSpan={6} className="table-empty">No active doctors are configured.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
