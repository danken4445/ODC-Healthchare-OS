"use client";

import {
  createBrowserSupabaseClient,
  getPortalAccess,
  getTeleconsultAppointments,
  signOut,
} from "@odyssey/supabase-client";
import type { TeleconsultAppointment } from "@odyssey/types";
import { AppointmentStatusBadge, Badge, Button, DataTable } from "@odyssey/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ProviderTeleconsultPage() {
  const [rooms, setRooms] = useState<TeleconsultAppointment[]>([]);
  const [status, setStatus] = useState("Loading assigned meeting rooms…");

  async function loadRooms() {
    const client = createBrowserSupabaseClient();
    const access = await getPortalAccess(client, "provider");
    if (access.error || !access.data.allowed || !access.data.organizationIds[0]) {
      await signOut(client);
      setStatus("Sign in through the provider workspace to view meeting rooms.");
      return;
    }
    const result = await getTeleconsultAppointments(client, access.data.organizationIds[0]);
    if (result.error) return setStatus(`Unable to load rooms: ${result.error.message}`);
    setRooms(result.data);
    setStatus(`${result.data.length} assigned virtual appointment${result.data.length === 1 ? "" : "s"}.`);
  }

  async function handleSignOut() {
    await signOut(createBrowserSupabaseClient());
    window.location.href = "/";
  }

  useEffect(() => { void loadRooms(); }, []);

  return (
    <main>
      <p className="eyebrow">Provider workspace · Remote care</p>
      <h1>Teleconsult meeting rooms</h1>
      <nav className="session-actions">
        <Link href="/">← Queue</Link>
        <Link href="/payouts">My payouts</Link>
        <Button size="sm" variant="ghost" onClick={() => void handleSignOut()} aria-label="Log out" title="Log out">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: "middle" }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log out
        </Button>
      </nav>
      <p role="status">{status}</p>
      <DataTable
        caption="Virtual appointments assigned to this practitioner at their clinic."
        data={rooms}
        emptyMessage="No teleconsult appointments are assigned."
        getRowId={(room) => room.appointment_id}
        columns={[
          { id: "time", header: "Time", cell: (room) => formatTime(room.start_at) },
          { id: "patient", header: "Patient", cell: (room) => room.patient_name },
          { id: "service", header: "Service", cell: (room) => room.service_type ?? "Consultation" },
          { id: "appointment", header: "Appointment", cell: (room) => <AppointmentStatusBadge status={room.appointment_status} /> },
          { id: "room", header: "Room", cell: (room) => <Badge variant={room.can_join ? "success" : "muted"}>{room.room_status}</Badge> },
          { id: "action", header: "", cell: (room) => <Link href={`/teleconsult/${room.appointment_id}`}><Button size="sm">{room.can_join ? "Join room" : "View room"}</Button></Link> },
        ]}
      />
    </main>
  );
}
