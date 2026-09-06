"use client";

import {
  closeTeleconsultRoom,
  createBrowserSupabaseClient,
  getPortalAccess,
  getTeleconsultAppointments,
  startAppointmentEncounter,
  signOut,
} from "@odyssey/supabase-client";
import type { TeleconsultAppointment } from "@odyssey/types";
import { Badge, Button, Card, TeleconsultWebRtcRoom } from "@odyssey/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ProviderTeleconsultRoomPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<TeleconsultAppointment | null>(null);
  const [status, setStatus] = useState("Authorizing the assigned room…");
  const [busy, setBusy] = useState(false);

  async function loadRoom() {
    const client = createBrowserSupabaseClient();
    const access = await getPortalAccess(client, "provider");
    const clinicId = access.data?.organizationIds[0];
    if (access.error || !access.data?.allowed || !clinicId) {
      await signOut(client);
      setStatus("Sign in through the provider workspace to access this room.");
      return;
    }
    setOrganizationId(clinicId);
    const result = await getTeleconsultAppointments(client, clinicId);
    const room = result.data?.find((item) => item.appointment_id === appointmentId);
    if (result.error || !room) return setStatus("This room is not assigned to your provider account.");
    setAppointment(room);
    setStatus(room.can_join ? "Room access granted." : "The room is outside its join window.");
  }

  useEffect(() => { void loadRoom(); }, [appointmentId]);

  async function startVisit() {
    setBusy(true);
    const result = await startAppointmentEncounter(createBrowserSupabaseClient(), appointmentId);
    if (result.error) {
      setStatus(`Unable to start encounter: ${result.error.message}`);
    } else {
      await loadRoom();
      setStatus("Encounter started. Clinical documentation remains available in the provider workspace.");
    }
    setBusy(false);
  }

  async function closeRoom() {
    if (!organizationId) return;
    setBusy(true);
    const result = await closeTeleconsultRoom(createBrowserSupabaseClient(), appointmentId);
    if (result.error) {
      setStatus(`Unable to close room: ${result.error.message}`);
    } else {
      await loadRoom();
      setStatus("Teleconsult room closed.");
    }
    setBusy(false);
  }

  return (
    <main>
      <p className="eyebrow">Provider workspace · Remote care</p>
      <h1>Teleconsult room</h1>
      <p><Link href="/teleconsult">← Meeting rooms</Link></p>
      <p role="status">{status}</p>
      {appointment && (
        <>
          <Card>
            <Badge variant={appointment.room_status === "open" ? "success" : "default"}>{appointment.room_status}</Badge>
            <h2>{appointment.patient_name}</h2>
            <p>{appointment.service_type ?? "Virtual consultation"} · {new Date(appointment.start_at).toLocaleString()}</p>
            <div className="session-actions">
              {!appointment.encounter_id && <Button disabled={busy} onClick={() => void startVisit()}>Start encounter</Button>}
              {appointment.room_status !== "closed" && appointment.room_status !== "cancelled" && <Button disabled={busy} variant="destructive" onClick={() => void closeRoom()}>Close room</Button>}
              <Link href="/"><Button variant="outline">Open clinical workspace</Button></Link>
            </div>
          </Card>
          {appointment.can_join && appointment.room_name ? (
            <TeleconsultWebRtcRoom client={createBrowserSupabaseClient()} displayLabel="Clinician" roomName={appointment.room_name} />
          ) : (
            <Card><h2>Video unavailable</h2><p>The secure room name is issued only during the appointment join window.</p></Card>
          )}
        </>
      )}
    </main>
  );
}
