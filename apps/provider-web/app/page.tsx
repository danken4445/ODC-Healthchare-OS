"use client";

import {
  createBrowserSupabaseClient,
  getCurrentUserEmail,
  getDailyAppointmentQueue,
  signInWithPassword,
  signOut,
  startAppointmentEncounter,
  subscribeToAppointmentQueue,
} from "@odyssey/supabase-client";
import type { AppointmentQueueItem } from "@odyssey/types";
import {
  AppointmentStatusBadge,
  Button,
  DataTable,
  Field,
  Input,
} from "@odyssey/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

const organizationId = "10000000-0000-0000-0000-000000000001";

function formatTime(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function Home() {
  const [email, setEmail] = useState("doctor@synthetic.odyssey.test");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [queue, setQueue] = useState<AppointmentQueueItem[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState("Offline");
  const [status, setStatus] = useState(
    "Sign in as the assigned doctor to see today's queue.",
  );

  const loadQueue = useCallback(async () => {
    const result = await getDailyAppointmentQueue(
      createBrowserSupabaseClient(),
      organizationId,
    );
    if (result.error) {
      setStatus(`Queue query failed: ${result.error.message}`);
      return;
    }
    setQueue(result.data);
  }, []);

  useEffect(() => {
    void getCurrentUserEmail(createBrowserSupabaseClient()).then((result) => {
      if (!result.error && result.data) setSignedInAs(result.data);
    });
  }, []);

  useEffect(() => {
    if (!signedInAs) return;
    void loadQueue();
    const unsubscribe = subscribeToAppointmentQueue(
      createBrowserSupabaseClient(),
      organizationId,
      () => void loadQueue(),
      (connectionStatus) => {
        setLiveStatus(
          connectionStatus === "SUBSCRIBED" ? "Live" : connectionStatus,
        );
      },
    );
    return unsubscribe;
  }, [loadQueue, signedInAs]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await signInWithPassword(
      createBrowserSupabaseClient(),
      email,
      password,
    );
    if (result.error)
      return setStatus(`Sign-in failed: ${result.error.message}`);
    setSignedInAs(result.data);
    setStatus(
      "Signed in. The queue will update when a new appointment is booked.",
    );
  }

  async function handleStart(appointmentId: string) {
    setStartingId(appointmentId);
    const result = await startAppointmentEncounter(
      createBrowserSupabaseClient(),
      appointmentId,
    );
    setStartingId(null);
    if (result.error)
      return setStatus(`Unable to start encounter: ${result.error.message}`);
    setStatus(`Encounter ${result.data} is in progress.`);
    await loadQueue();
  }

  async function handleSignOut() {
    const result = await signOut(createBrowserSupabaseClient());
    if (result.error)
      return setStatus(`Sign-out failed: ${result.error.message}`);
    setSignedInAs(null);
    setQueue([]);
    setLiveStatus("Offline");
    setStatus("Signed out.");
  }

  return (
    <main>
      <p className="eyebrow">Provider workspace</p>
      <h1>My queue today</h1>
      {!signedInAs ? (
        <form onSubmit={handleSignIn} className="stack narrow-form">
          <Field label="Email">
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
            />
          </Field>
          <Field label="Password">
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
            />
          </Field>
          <Button type="submit">Sign in</Button>
          <p className="hint">Local reset password: LocalOnly-2026!</p>
        </form>
      ) : (
        <>
          <div className="session">
            <span>Signed in as {signedInAs}</span>
            <span className="session-actions">
              <span
                className="live-indicator"
                data-live={liveStatus === "Live"}
              >
                {liveStatus} queue
              </span>
              <Button variant="secondary" onClick={handleSignOut}>
                Sign out
              </Button>
            </span>
          </div>
          <DataTable
            caption="Appointments assigned to this doctor today."
            data={queue}
            emptyMessage="Your queue is empty."
            getRowId={(appointment) => appointment.id}
            columns={[
              {
                id: "time",
                header: "Time",
                cell: (appointment) => formatTime(appointment.start_at),
              },
              {
                id: "patient",
                header: "Patient",
                cell: (appointment) => appointment.patientName,
              },
              {
                id: "status",
                header: "Status",
                cell: (appointment) =>
                  appointment.encounterStatus === "in_progress" ? (
                    <span className="encounter-status">In progress</span>
                  ) : (
                    <AppointmentStatusBadge status={appointment.status} />
                  ),
              },
              {
                id: "action",
                header: "",
                cell: (appointment) =>
                  appointment.encounterStatus === "in_progress" ? null : (
                    <Button
                      size="sm"
                      disabled={startingId !== null}
                      onClick={() => void handleStart(appointment.id)}
                      aria-label={`Start appointment for ${appointment.patientName}`}
                    >
                      {startingId === appointment.id
                        ? "Starting…"
                        : "Mark in progress"}
                    </Button>
                  ),
              },
            ]}
          />
        </>
      )}
      <p role="status">{status}</p>
    </main>
  );
}
