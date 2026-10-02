"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getClinicCalendar, type ClinicCalendarRow } from "@odyssey/supabase-client";
import { useAdminData } from "../../components/admin-data-context";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/page-header";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - day);
  return isoDate(date);
}

export default function ClinicCalendarPage() {
  const { client, organization } = useAdminData();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(isoDate(new Date())));
  const [doctor, setDoctor] = useState("");
  const [service, setService] = useState("");
  const [rows, setRows] = useState<ClinicCalendarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    setError(null);
    const result = await getClinicCalendar(client, {
      organizationId: organization.id,
      weekStart,
      doctorRoleId: doctor || null,
      clinicServiceId: service || null,
    });
    if (result.error) setError(result.error.message);
    else setRows(result.data ?? []);
    setLoading(false);
  }, [client, doctor, organization, service, weekStart]);

  useEffect(() => { void load(); }, [load]);

  const doctors = useMemo(() => Array.from(new Map(rows.map((row) => [row.doctor_role_id, row.doctor_name])).entries()), [rows]);
  const services = useMemo(() => Array.from(new Set(rows.map((row) => row.service_name))).sort(), [rows]);
  const weekLabel = `${weekStart} through ${isoDate(new Date(`${weekStart}T00:00:00Z`))}`;

  return <div className="vesper-page-container">
    <PageHeader eyebrow="Clinic operations" title="Clinic calendar" description="Read-only week view of bookable slots and appointments by doctor. Patient identity is intentionally excluded." actions={<Button variant="outline" onClick={() => void load()} disabled={loading}>Refresh</Button>} />
    <section className="vesper-card" aria-label="Calendar filters">
      <div className="vesper-card__header"><div><h2 className="vesper-card__title">Week and filters</h2><p className="vesper-card__subtitle">{weekLabel}</p></div></div>
      <div className="room-add-form">
        <label className="ui-field"><span className="ui-field__label">Week starting</span><input className="ui-input" type="date" value={weekStart} onChange={(event) => setWeekStart(startOfWeek(event.target.value))} /></label>
        <label className="ui-field"><span className="ui-field__label">Doctor</span><select className="ui-input" value={doctor} onChange={(event) => setDoctor(event.target.value)}><option value="">All doctors</option>{doctors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="ui-field"><span className="ui-field__label">Service</span><select className="ui-input" value={service} onChange={(event) => setService(event.target.value)}><option value="">All services</option>{services.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      </div>
    </section>
    {error ? <p className="data-error" role="alert">{error}</p> : null}
    <section className="vesper-card" aria-labelledby="calendar-table-heading"><div className="vesper-card__header"><div><h2 id="calendar-table-heading" className="vesper-card__title">Doctor schedules</h2><p className="vesper-card__subtitle">{rows.length} slot{rows.length === 1 ? "" : "s"}</p></div></div>
      <div className="vesper-table-container"><table className="vesper-table"><caption className="sr-only">Clinic week calendar</caption><thead><tr><th>Doctor</th><th>Service</th><th>Time</th><th>Status</th><th>Queue label</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="table-empty">Loading calendar…</td></tr> : rows.length ? rows.map((row, index) => <tr key={`${row.doctor_role_id}-${row.start_at}-${index}`}><th scope="row">{row.doctor_name}</th><td>{row.service_name}</td><td>{new Date(row.start_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}–{new Date(row.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td><td>{row.status}</td><td>{row.queue_label ?? "—"}</td></tr>) : <tr><td colSpan={5} className="table-empty">No slots or appointments match these filters.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
