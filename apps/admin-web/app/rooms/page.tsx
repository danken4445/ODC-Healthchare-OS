"use client";

import { DoorOpen, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getRoomAssignmentGrid,
  saveRoomAssignment,
  type RoomAssignmentGrid,
} from "@odyssey/supabase-client";
import type { RoomAssignmentRow } from "@odyssey/types";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PageHeader } from "../../components/page-header";
import { useAdminData } from "../../components/admin-data-context";

type Draft = Pick<RoomAssignmentRow, "room_id" | "shift_start" | "shift_end">;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function RoomsPage() {
  const { client, organization } = useAdminData();
  const [date, setDate] = useState(todayIso);
  const [grid, setGrid] = useState<RoomAssignmentGrid | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [roomLabel, setRoomLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    setError(null);
    const result = await getRoomAssignmentGrid(client, organization.id, date);
    if (result.error) {
      setError(result.error.message);
      setGrid(null);
    } else {
      setGrid(result.data);
      setDrafts(
        Object.fromEntries(
          result.data.doctors.map((doctor) => {
            const assignment = result.data.assignments.find(
              (item) => item.practitioner_role_id === doctor.practitionerRoleId,
            );
            return [
              doctor.practitionerRoleId,
              {
                room_id: assignment?.room_id ?? "",
                shift_start: assignment?.shift_start?.slice(0, 5) ?? "08:00",
                shift_end: assignment?.shift_end?.slice(0, 5) ?? "17:00",
              },
            ];
          }),
        ),
      );
    }
    setLoading(false);
  }, [client, date, organization]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRooms = useMemo(
    () => (grid?.rooms ?? []).filter((room) => room.is_active),
    [grid],
  );

  const updateDraft = (roleId: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [roleId]: { ...current[roleId], ...patch },
    }));
  };

  const addRoom = async () => {
    if (!organization || !roomLabel.trim()) return;
    setError(null);
    const { error: insertError } = await client.from("clinic_rooms").insert({
      organization_id: organization.id,
      label: roomLabel.trim(),
    });
    if (insertError) setError(insertError.message);
    else {
      setRoomLabel("");
      setMessage("Room added.");
      await load();
    }
  };

  const save = async (roleId: string) => {
    if (!organization) return;
    const draft = drafts[roleId];
    if (!draft?.room_id) {
      setError("Choose a room before saving an assignment.");
      return;
    }
    setSaving(roleId);
    setError(null);
    setMessage(null);
    const result = await saveRoomAssignment(client, {
      organizationId: organization.id,
      practitionerRoleId: roleId,
      roomId: draft.room_id,
      date,
      shiftStart: draft.shift_start,
      shiftEnd: draft.shift_end,
    });
    if (result.error) setError(result.error.message);
    else {
      setMessage("Room assignment saved.");
      await load();
    }
    setSaving(null);
  };

  const clear = async (roleId: string) => {
    if (!organization) return;
    setSaving(roleId);
    setError(null);
    const { error: deleteError } = await client
      .from("room_assignments")
      .delete()
      .eq("organization_id", organization.id)
      .eq("practitioner_role_id", roleId)
      .eq("date", date);
    if (deleteError) setError(deleteError.message);
    else {
      setMessage("Room assignment cleared.");
      await load();
    }
    setSaving(null);
  };

  return (
    <div className="vesper-page-container">
      <PageHeader
        eyebrow="Day-of-visit operations"
        title="Clinic rooms"
        description="Assign one physical room and shift per doctor for the selected day. Overlapping room assignments are rejected by the database."
        actions={
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw aria-hidden="true" size={15} /> Refresh
          </Button>
        }
      />

      <section className="vesper-card" aria-labelledby="room-date-heading">
        <div className="vesper-card__header">
          <div>
            <h2 id="room-date-heading" className="vesper-card__title">
              Assignment date
            </h2>
            <p className="vesper-card__subtitle">
              Choose a day to review or reassign rooms.
            </p>
          </div>
          <label className="ui-field">
            <span className="ui-field__label">Date</span>
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="vesper-card" aria-labelledby="room-list-heading">
        <div className="vesper-card__header">
          <div>
            <h2 id="room-list-heading" className="vesper-card__title">
              Active rooms
            </h2>
            <p className="vesper-card__subtitle">
              Rooms are clinic-scoped and never expose patient information.
            </p>
          </div>
          <div className="room-add-form">
            <label className="sr-only" htmlFor="new-room-label">
              New room label
            </label>
            <Input
              id="new-room-label"
              value={roomLabel}
              onChange={(event) => setRoomLabel(event.target.value)}
              placeholder="Room label"
            />
            <Button
              size="sm"
              onClick={() => void addRoom()}
              disabled={!roomLabel.trim()}
            >
              <Plus aria-hidden="true" size={15} /> Add room
            </Button>
          </div>
        </div>
        {activeRooms.length ? (
          <div className="room-chip-list" aria-label="Active clinic rooms">
            {activeRooms.map((room) => (
              <span className="room-chip" key={room.id}>
                <DoorOpen aria-hidden="true" size={14} />
                {room.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="table-empty">
            No rooms configured. Add a room to enable physical-room assignments.
          </p>
        )}
      </section>

      {error ? (
        <p className="data-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="data-success" role="status">
          {message}
        </p>
      ) : null}

      <section className="vesper-card" aria-labelledby="doctor-grid-heading">
        <div className="vesper-card__header">
          <div>
            <h2 id="doctor-grid-heading" className="vesper-card__title">
              Daily doctor assignments
            </h2>
            <p className="vesper-card__subtitle">
              {date} · {grid?.doctors.length ?? 0} active doctors
            </p>
          </div>
        </div>
        <div className="vesper-table-container">
          <table className="vesper-table">
            <caption className="sr-only">Room assignments for {date}</caption>
            <thead>
              <tr>
                <th>Doctor</th>
                <th>Room</th>
                <th>Shift start</th>
                <th>Shift end</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Loading room assignments…
                  </td>
                </tr>
              ) : grid?.doctors.length ? (
                grid.doctors.map((doctor) => {
                  const draft = drafts[doctor.practitionerRoleId];
                  const busy = saving === doctor.practitionerRoleId;
                  return (
                    <tr key={doctor.practitionerRoleId}>
                      <th scope="row">{doctor.displayName}</th>
                      <td>
                        <label
                          className="sr-only"
                          htmlFor={`room-${doctor.practitionerRoleId}`}
                        >
                          Room for {doctor.displayName}
                        </label>
                        <select
                          id={`room-${doctor.practitionerRoleId}`}
                          className="ui-input"
                          value={draft?.room_id ?? ""}
                          onChange={(event) =>
                            updateDraft(doctor.practitionerRoleId, {
                              room_id: event.target.value,
                            })
                          }
                        >
                          <option value="">No room</option>
                          {activeRooms.map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <label
                          className="sr-only"
                          htmlFor={`start-${doctor.practitionerRoleId}`}
                        >
                          Shift start for {doctor.displayName}
                        </label>
                        <Input
                          id={`start-${doctor.practitionerRoleId}`}
                          type="time"
                          value={draft?.shift_start ?? "08:00"}
                          onChange={(event) =>
                            updateDraft(doctor.practitionerRoleId, {
                              shift_start: event.target.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <label
                          className="sr-only"
                          htmlFor={`end-${doctor.practitionerRoleId}`}
                        >
                          Shift end for {doctor.displayName}
                        </label>
                        <Input
                          id={`end-${doctor.practitionerRoleId}`}
                          type="time"
                          value={draft?.shift_end ?? "17:00"}
                          onChange={(event) =>
                            updateDraft(doctor.practitionerRoleId, {
                              shift_end: event.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="room-actions">
                        <Button
                          size="sm"
                          onClick={() => void save(doctor.practitionerRoleId)}
                          disabled={busy || !activeRooms.length}
                        >
                          <Save aria-hidden="true" size={14} /> Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void clear(doctor.practitionerRoleId)}
                          disabled={busy}
                        >
                          <Trash2 aria-hidden="true" size={14} /> Clear
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="table-empty">
                    {activeRooms.length
                      ? "No active doctors found for this clinic."
                      : "Configure a room first; default clinics continue without room assignments."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
