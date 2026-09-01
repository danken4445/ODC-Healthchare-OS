"use client";

import {
  createBrowserSupabaseClient,
  createPublicSupabaseClient,
  getPublicClinics,
  getWaitingRoomQueue,
  subscribeToWaitingRoomQueue,
} from "@odyssey/supabase-client";
import type { PublicClinicSummary, WaitingRoomQueueItem } from "@odyssey/types";
import { useCallback, useEffect, useState } from "react";

function queueLabel(queueNumber: number): string {
  return `A-${String(queueNumber).padStart(3, "0")}`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function WaitingRoomPage() {
  const [queue, setQueue] = useState<WaitingRoomQueueItem[]>([]);
  const [clinics, setClinics] = useState<PublicClinicSummary[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [connection, setConnection] = useState("Connecting");
  const [message, setMessage] = useState("Loading today's queue…");

  const loadQueue = useCallback(
    async (clinicId = organizationId) => {
      if (!clinicId) return;
      const result = await getWaitingRoomQueue(
        createBrowserSupabaseClient(),
        clinicId,
      );
      if (result.error) {
        setMessage("The queue is temporarily unavailable.");
        return;
      }
      setQueue(result.data);
      setMessage("Queue numbers update automatically.");
    },
    [organizationId],
  );

  useEffect(() => {
    void getPublicClinics(createPublicSupabaseClient()).then((result) => {
      if (result.error) {
        setMessage("The clinic directory is temporarily unavailable.");
        return;
      }
      setClinics(result.data);
      const requested = new URLSearchParams(window.location.search).get(
        "clinic",
      );
      setOrganizationId(
        result.data.some((clinic) => clinic.id === requested)
          ? requested
          : (result.data[0]?.id ?? null),
      );
    });
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    void loadQueue(organizationId);
    return subscribeToWaitingRoomQueue(
      createBrowserSupabaseClient(),
      organizationId,
      () => void loadQueue(organizationId),
      (status) => setConnection(status === "SUBSCRIBED" ? "Live" : status),
    );
  }, [loadQueue, organizationId]);

  const nowServing = queue.filter((item) => item.stage === "in_progress");
  const waiting = queue.filter((item) => item.stage === "waiting");
  const clinicName = clinics.find(
    (clinic) => clinic.id === organizationId,
  )?.name;

  return (
    <main className="waiting-room" aria-live="polite">
      <header className="waiting-room__header">
        <div>
          <p className="eyebrow">Clinic waiting room</p>
          <h1>{clinicName ?? "Clinic"} queue</h1>
        </div>
        <span className="live-indicator" data-live={connection === "Live"}>
          {connection}
        </span>
      </header>

      <section aria-labelledby="now-serving-heading">
        <h2 id="now-serving-heading">Now serving</h2>
        <div className="queue-cards queue-cards--active">
          {nowServing.map((item) => (
            <article
              className="queue-card queue-card--active"
              key={item.appointment_id}
            >
              <strong>{queueLabel(item.queue_number)}</strong>
              <span>{item.service_name}</span>
            </article>
          ))}
          {!nowServing.length && <p>No queue number is being served.</p>}
        </div>
      </section>

      <section aria-labelledby="waiting-heading">
        <h2 id="waiting-heading">Waiting</h2>
        <div className="queue-cards">
          {waiting.map((item) => (
            <article className="queue-card" key={item.appointment_id}>
              <strong>{queueLabel(item.queue_number)}</strong>
              <span>{formatTime(item.scheduled_at)}</span>
              <span>{item.service_name}</span>
            </article>
          ))}
          {!waiting.length && <p>No patients are checked in.</p>}
        </div>
      </section>
      <p className="hint">{message} Patient names are never shown.</p>
    </main>
  );
}
