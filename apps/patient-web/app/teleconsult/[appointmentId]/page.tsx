"use client";

import {
  createBrowserSupabaseClient,
  getPortalAccess,
  getTeleconsultAppointments,
  setPatientClinicContext,
  signOut,
} from "@odyssey/supabase-client";
import type { TeleconsultAppointment } from "@odyssey/types";
import { Badge, Button, Card, TeleconsultWebRtcRoom } from "@odyssey/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function PatientTeleconsultRoomPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [appointment, setAppointment] = useState<TeleconsultAppointment | null>(null);
  const [status, setStatus] = useState("Authorizing your teleconsultation room…");

  useEffect(() => {
    async function loadRoom() {
      const client = createBrowserSupabaseClient();
      const access = await getPortalAccess(client, "patient");
      if (access.error || !access.data.allowed) {
        await signOut(client);
        setStatus("Sign in through the patient portal to access this room.");
        return;
      }
      const storedClinic = window.localStorage.getItem("odyssey.patient.clinic");
      if (!storedClinic) {
        setStatus("Select the appointment's clinic in the patient portal first.");
        return;
      }
      const context = await setPatientClinicContext(client, storedClinic);
      if (context.error) {
        setStatus("This clinic is not available to your patient account.");
        return;
      }
      const result = await getTeleconsultAppointments(client, storedClinic);
      const room = result.data?.find((item) => item.appointment_id === appointmentId);
      if (result.error || !room) {
        setStatus("This teleconsultation room is not assigned to your account.");
        return;
      }
      setAppointment(room);
      setStatus(room.can_join ? "Room access granted." : "The room is outside its join window.");
    }
    void loadRoom();
  }, [appointmentId]);

  return (
    <main>
      <p className="eyebrow">Patient portal · Remote care</p>
      <h1>Teleconsultation</h1>
      <p role="status">{status}</p>
      <p><Link href="/">← Back to appointments</Link></p>
      {appointment && (
        <div className="two-column">
          <Card>
            <Badge variant={appointment.can_join ? "success" : "warning"}>
              {appointment.room_status}
            </Badge>
            <h2>{appointment.service_type ?? "Virtual consultation"}</h2>
            <p>{formatTime(appointment.start_at)}</p>
            <p>Clinician: {appointment.practitioner_name}</p>
            <p className="hint">
              Room access opens 30 minutes before the appointment and closes two hours after it ends.
            </p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Check room again
            </Button>
          </Card>
          {appointment.can_join && appointment.room_name ? (
            <TeleconsultWebRtcRoom
              client={createBrowserSupabaseClient()}
              displayLabel="Patient"
              roomName={appointment.room_name}
            />
          ) : (
            <Card>
              <h2>Room not open yet</h2>
              <p>Return near the scheduled time. No meeting identifier is exposed before the join window.</p>
            </Card>
          )}
        </div>
      )}
    </main>
  );
}
