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

  useEffect(() => { void loadRooms(); }, []);

  return (
    <main>
      <p className="eyebrow">Provider workspace · Remote care</p>
      <h1>Teleconsult meeting rooms</h1>
      <nav className="session-actions"><Link href="/">← Queue</Link><Link href="/payouts">My payouts</Link></nav>
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
