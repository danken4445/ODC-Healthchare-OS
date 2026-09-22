import type { AppointmentQueueItem } from "@odyssey/types";
import { Card, DepartmentTag, EmptyState } from "@odyssey/ui";
import type { ReactNode } from "react";

interface QueueBoardProps {
  appointments: AppointmentQueueItem[];
  renderAction: (appointment: AppointmentQueueItem) => ReactNode;
}

function formatTime(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function queueStage(appointment: AppointmentQueueItem): "waiting" | "consult" | "done" {
  if (appointment.status === "fulfilled") return "done";
  if (appointment.encounterStatus === "in_progress") return "consult";
  return "waiting";
}

const columns = [
  { id: "waiting" as const, title: "Waiting" },
  { id: "consult" as const, title: "In consult" },
  { id: "done" as const, title: "Done" },
];

export function QueueBoard({ appointments, renderAction }: QueueBoardProps) {
  return (
    <div className="queue-board">
      {columns.map((column) => {
        const items = appointments.filter((appointment) => queueStage(appointment) === column.id);
        return (
          <section className="queue-column" key={column.id} aria-labelledby={`queue-${column.id}`}>
            <header className="queue-column__header">
              <h2 id={`queue-${column.id}`}>{column.title}</h2>
              <span aria-label={`${items.length} patients`}>{items.length}</span>
            </header>
            <div className="queue-column__items">
              {items.length ? items.map((appointment) => (
                <Card variant="queue-card" key={appointment.id}>
                  <div className="queue-patient__heading">
                    <strong>{appointment.patientName}</strong>
                    <time>{formatTime(appointment.start_at)}</time>
                  </div>
                  <p>{appointment.description || appointment.service_type || "Consultation"}</p>
                  <DepartmentTag>{appointment.service_type || "General medicine"}</DepartmentTag>
                  <div className="queue-patient__action">{renderAction(appointment)}</div>
                </Card>
              )) : <EmptyState title={`No patients ${column.id === "consult" ? "in consultation" : column.id}.`} />}
            </div>
          </section>
        );
      })}
    </div>
  );
}
