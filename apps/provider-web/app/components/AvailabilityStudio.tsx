"use client";

import type { AppointmentSlotSummary } from "@odyssey/types";
import { Button, DataTable } from "@odyssey/ui";
import { useEffect, useMemo, useRef, useState } from "react";

const CLINIC_TIME_ZONE = "Asia/Manila";

function clinicDateKey(value: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof value === "string" ? new Date(value) : value);
  const get = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function startOfWeek(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return addDays(dateKey, -weekday);
}

function dateKeyToClinicNoon(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00+08:00`);
}

function formatTime(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: CLINIC_TIME_ZONE,
  }).format(new Date(value));
}

function formatDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? dateKeyToClinicNoon(value)
    : new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: CLINIC_TIME_ZONE,
  }).format(date);
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface AvailabilityStudioProps {
  slots: AppointmentSlotSummary[];
  availabilityBusy: boolean;
  onToggleSlot: (slot: AppointmentSlotSummary, unavailable: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function AvailabilityStudio({
  slots,
  availabilityBusy,
  onToggleSlot,
  onRefresh,
}: AvailabilityStudioProps) {
  const [viewMode, setViewMode] = useState<"matrix" | "agenda" | "table">("matrix");
  const [statusFilter, setStatusFilter] = useState<"all" | "free" | "booked" | "blocked">("all");
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [togglingSlotId, setTogglingSlotId] = useState<string | null>(null);
  const autoFocusedWeek = useRef(false);

  // Compute reference week dates
  const weekDates = useMemo(() => {
    const currentWeekStart = startOfWeek(clinicDateKey(new Date()));
    const visibleWeekStart = addDays(currentWeekStart, weekOffset * 7);
    return WEEKDAYS.map((_, dayOfWeek) =>
      addDays(visibleWeekStart, dayOfWeek),
    );
  }, [weekOffset]);

  // Metrics
  const totalSlots = slots.length;
  const freeSlots = slots.filter((s) => s.status === "free").length;
  const bookedSlots = slots.filter(
    (s) => s.appointment_id || s.status === "busy"
  ).length;
  const blockedSlots = slots.filter(
    (s) => s.status === "busy_unavailable"
  ).length;
  const occupancyPercent =
    totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;

  // Filter slots
  const filteredSlots = useMemo(() => {
    if (statusFilter === "free") return slots.filter((s) => s.status === "free");
    if (statusFilter === "booked")
      return slots.filter((s) => s.appointment_id || s.status === "busy");
    if (statusFilter === "blocked")
      return slots.filter((s) => s.status === "busy_unavailable");
    return slots;
  }, [slots, statusFilter]);

  // Group slots by date string YYYY-MM-DD
  const slotsByDate = useMemo(() => {
    const map = new Map<string, AppointmentSlotSummary[]>();
    for (const slot of filteredSlots) {
      if (!slot.start_at) continue;
      const key = clinicDateKey(slot.start_at);
      const list = map.get(key) ?? [];
      list.push(slot);
      map.set(key, list);
    }
    // Sort each day's slots by start_at
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    }
    return map;
  }, [filteredSlots]);

  useEffect(() => {
    if (autoFocusedWeek.current || !slots.length) return;
    autoFocusedWeek.current = true;
    const currentWeekStart = startOfWeek(clinicDateKey(new Date()));
    const currentWeekEnd = addDays(currentWeekStart, 6);
    const slotDateKeys = slots
      .filter((slot) => Boolean(slot.start_at))
      .map((slot) => clinicDateKey(slot.start_at))
      .sort();
    const hasCurrentWeekSlots = slotDateKeys.some(
      (dateKey) => dateKey >= currentWeekStart && dateKey <= currentWeekEnd,
    );
    if (hasCurrentWeekSlots || !slotDateKeys.length) return;

    const earliestWeek = startOfWeek(slotDateKeys[0]);
    const daysUntilEarliestWeek = Math.round(
      (dateKeyToClinicNoon(earliestWeek).getTime() -
        dateKeyToClinicNoon(currentWeekStart).getTime()) /
        86_400_000,
    );
    setWeekOffset(Math.max(0, Math.floor(daysUntilEarliestWeek / 7)));
  }, [slots]);

  async function handleSlotClick(slot: AppointmentSlotSummary) {
    if (slot.appointment_id || slot.status === "busy" || availabilityBusy) return;
    setTogglingSlotId(slot.id);
    try {
      await onToggleSlot(slot, slot.status === "free");
    } finally {
      setTogglingSlotId(null);
    }
  }

  return (
    <div className="availability-studio-container">
      {/* Capacity & Metrics Ribbon */}
      <div className="capacity-ribbon">
        <div className="capacity-card">
          <span className="capacity-card__label">Total Slots</span>
          <span className="capacity-card__value" style={{ color: "var(--odyssey-foreground)" }}>
            {totalSlots}
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--odyssey-muted-foreground)" }}>
            Across scheduled horizon
          </span>
        </div>

        <div className="capacity-card">
          <span className="capacity-card__label">Available</span>
          <span className="capacity-card__value" style={{ color: "var(--odyssey-emerald)" }}>
            {freeSlots}
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--odyssey-emerald-text)" }}>
            Available for patients
          </span>
        </div>

        <div className="capacity-card">
          <span className="capacity-card__label">Booked</span>
          <span className="capacity-card__value" style={{ color: "var(--odyssey-blue-booked)" }}>
            {bookedSlots}
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--odyssey-blue-booked-text)" }}>
            Assigned appointments
          </span>
        </div>

        <div className="capacity-card">
          <span className="capacity-card__label">Unavailable</span>
          <span className="capacity-card__value" style={{ color: "var(--odyssey-slate-blocked)" }}>
            {blockedSlots}
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--odyssey-slate-blocked-text)" }}>
            Unavailable / paused
          </span>
        </div>

        <div className="capacity-card" style={{ gridColumn: "span 1" }}>
          <span className="capacity-card__label">Schedule Occupancy</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
            <span className="capacity-card__value" style={{ color: "var(--odyssey-foreground)" }}>
              {occupancyPercent}%
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--odyssey-muted-foreground)" }}>
              booked
            </span>
          </div>
          <div className="capacity-meter-container">
            <div className="capacity-track">
              <div
                className="capacity-fill-booked"
                style={{ width: `${totalSlots ? (bookedSlots / totalSlots) * 100 : 0}%` }}
                title={`Booked: ${bookedSlots}`}
              />
              <div
                className="capacity-fill-free"
                style={{ width: `${totalSlots ? (freeSlots / totalSlots) * 100 : 0}%` }}
                title={`Free: ${freeSlots}`}
              />
              <div
                className="capacity-fill-blocked"
                style={{ width: `${totalSlots ? (blockedSlots / totalSlots) * 100 : 0}%` }}
                title={`Blocked: ${blockedSlots}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Studio Toolbar */}
      <div className="studio-toolbar">
        {/* Left: View Switcher */}
        <div className="toolbar-group">
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--odyssey-foreground)" }}>
            View:
          </span>
          <div className="view-btn-group" role="group" aria-label="Schedule layout view">
            <Button
              type="button"
              className={`view-btn ${viewMode === "matrix" ? "active" : ""}`}
              onClick={() => setViewMode("matrix")}
            >
              Weekly schedule
            </Button>
            <Button
              type="button"
              className={`view-btn ${viewMode === "agenda" ? "active" : ""}`}
              onClick={() => setViewMode("agenda")}
            >
              Day agenda
            </Button>
            <Button
              type="button"
              className={`view-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
            >
              Table
            </Button>
          </div>

          <div style={{ width: "1px", height: "1.5rem", background: "var(--odyssey-border)", margin: "0 0.25rem" }} />

          {/* Status Filter */}
          <div className="toolbar-group">
            <Button
              type="button"
              className={`filter-pill ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              All ({totalSlots})
            </Button>
            <Button
              type="button"
              className={`filter-pill ${statusFilter === "free" ? "active" : ""}`}
              onClick={() => setStatusFilter("free")}
            >
              Available ({freeSlots})
            </Button>
            <Button
              type="button"
              className={`filter-pill ${statusFilter === "booked" ? "active" : ""}`}
              onClick={() => setStatusFilter("booked")}
            >
              Booked ({bookedSlots})
            </Button>
            <Button
              type="button"
              className={`filter-pill ${statusFilter === "blocked" ? "active" : ""}`}
              onClick={() => setStatusFilter("blocked")}
            >
              Unavailable ({blockedSlots})
            </Button>
          </div>
        </div>

        {/* Right: Week Navigator */}
        <div className="toolbar-group">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWeekOffset((o) => o - 1)}
            aria-label="Previous week"
          >
            ← Prev Week
          </Button>
          <Button
            size="sm"
            variant={weekOffset === 0 ? "default" : "outline"}
            onClick={() => setWeekOffset(0)}
          >
            This Week
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWeekOffset((o) => o + 1)}
            aria-label="Next week"
          >
            Next Week →
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void onRefresh()}
            title="Refresh availability"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Content Areas */}
      {viewMode === "matrix" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--odyssey-foreground)" }}>
              Week of {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--odyssey-muted-foreground)" }}>
              <strong>Tip:</strong> Click any slot card to toggle between <strong>Bookable</strong> and <strong>Blocked</strong>.
            </span>
          </div>

          <div className="weekly-matrix-grid">
            {weekDates.map((dateKey, dayIdx) => {
              const daySlots = slotsByDate.get(dateKey) ?? [];
              const isToday = dateKey === clinicDateKey(new Date());
              const dayFree = daySlots.filter((s) => s.status === "free").length;
              const dayBooked = daySlots.filter((s) => s.appointment_id || s.status === "busy").length;

              return (
                <div
                  key={dateKey}
                  className="matrix-day-column"
                  style={{
                    borderColor: isToday ? "var(--odyssey-primary)" : "var(--odyssey-border)",
                    background: isToday ? "var(--odyssey-muted)" : "var(--odyssey-background)",
                  }}
                >
                  <div
                    className="matrix-day-header"
                    style={{
                      background: isToday ? "var(--odyssey-muted)" : "var(--odyssey-card)",
                      borderBottom: isToday ? "2px solid var(--odyssey-primary)" : "1px solid var(--odyssey-border)",
                    }}
                  >
                    <div className="matrix-day-name" style={{ color: isToday ? "var(--odyssey-primary)" : "inherit" }}>
                      {WEEKDAYS[dayIdx]} {isToday && "(Today)"}
                    </div>
                    <div className="matrix-day-date">{formatDate(dateKey)}</div>
                    <div className="matrix-day-badge">
                      {daySlots.length === 0
                        ? "No slots"
                        : `${daySlots.length} slots · ${dayFree} free`}
                    </div>
                  </div>

                  <div className="matrix-day-slots">
                    {daySlots.length === 0 ? (
                      <div
                        style={{
                          padding: "1.5rem 0.5rem",
                          textAlign: "center",
                          color: "var(--odyssey-muted-foreground)",
                          fontSize: "0.8rem",
                          fontStyle: "italic",
                        }}
                      >
                        No slots on this date
                      </div>
                    ) : (
                      daySlots.map((slot) => {
                        const isFree = slot.status === "free";
                        const isBooked = Boolean(slot.appointment_id || slot.status === "busy");
                        const isBlocked = slot.status === "busy_unavailable";
                        const isToggling = togglingSlotId === slot.id;

                        let modifierClass = "slot-tile--free";
                        let statusText = "Available";
                        let actionPrompt = "Click to block";
                        if (isBooked) {
                          modifierClass = "slot-tile--booked";
                          statusText = "Booked";
                          actionPrompt = "Patient assigned";
                        } else if (isBlocked) {
                          modifierClass = "slot-tile--blocked";
                          statusText = "Unavailable";
                          actionPrompt = "Click to reopen";
                        }

                        return (
            <Button
                            key={slot.id}
                            type="button"
                            className={`slot-tile ${modifierClass}`}
                            disabled={isBooked || availabilityBusy || isToggling}
                            onClick={() => void handleSlotClick(slot)}
                            aria-label={`${formatTime(slot.start_at)} slot: ${statusText}. ${!isBooked ? actionPrompt : ""}`}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
                              <span className="slot-tile__time">{formatTime(slot.start_at)}</span>
                              <span className="slot-tile__status-tag">
                                {isToggling ? "Updating…" : statusText}
                              </span>
                            </div>
                            <div className="slot-tile__meta">
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {slot.service_type ?? "Consultation"}
                              </span>
                              {!isBooked && (
                                <span className="slot-tile__action-hint">
                                  {actionPrompt} →
                                </span>
                              )}
                            </div>
            </Button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === "agenda" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {Array.from(slotsByDate.entries()).length === 0 ? (
            <p className="hint">No appointment slots match the current filter.</p>
          ) : (
            Array.from(slotsByDate.entries()).map(([dateStr, daySlots]) => {
              return (
                <div
                  key={dateStr}
                  style={{
                    background: "var(--odyssey-card)",
                    border: "1px solid var(--odyssey-border)",
                    borderRadius: "0.75rem",
                    padding: "1rem 1.25rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: "1px solid var(--odyssey-border)",
                      paddingBottom: "0.5rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: "1.05rem" }}>
                      {formatDate(dateStr)}
                    </h4>
                    <span style={{ fontSize: "0.85rem", color: "var(--odyssey-muted-foreground)" }}>
                      {daySlots.length} slots
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                      gap: "0.75rem",
                    }}
                  >
                    {daySlots.map((slot) => {
                      const isFree = slot.status === "free";
                      const isBooked = Boolean(slot.appointment_id || slot.status === "busy");
                      const isBlocked = slot.status === "busy_unavailable";
                      const isToggling = togglingSlotId === slot.id;

                      let modifierClass = "slot-tile--free";
                      let statusText = "Available";
                      let actionPrompt = "Click to block";
                      if (isBooked) {
                        modifierClass = "slot-tile--booked";
                        statusText = "Booked";
                        actionPrompt = "Patient assigned";
                      } else if (isBlocked) {
                        modifierClass = "slot-tile--blocked";
                        statusText = "Unavailable";
                        actionPrompt = "Click to reopen";
                      }

                      return (
            <Button
                          key={slot.id}
                          type="button"
                          className={`slot-tile ${modifierClass}`}
                          disabled={isBooked || availabilityBusy || isToggling}
                          onClick={() => void handleSlotClick(slot)}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
                            <span className="slot-tile__time">{formatTime(slot.start_at)}</span>
                            <span className="slot-tile__status-tag">
                              {isToggling ? "Updating…" : statusText}
                            </span>
                          </div>
                          <div className="slot-tile__meta">
                            <span>{slot.service_type ?? "Consultation"}</span>
                            {!isBooked && (
                              <span className="slot-tile__action-hint">{actionPrompt}</span>
                            )}
                          </div>
            </Button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {viewMode === "table" && (
        <DataTable
          caption="Upcoming appointment slots assigned to you."
          data={filteredSlots}
          emptyMessage="No upcoming availability."
          getRowId={(slot) => slot.id}
          columns={[
            {
              id: "date",
              header: "Date",
              cell: (slot) => (slot.start_at ? formatDate(slot.start_at) : "N/A"),
            },
            {
              id: "time",
              header: "Time",
              cell: (slot) => formatTime(slot.start_at),
            },
            {
              id: "service",
              header: "Service",
              cell: (slot) => slot.service_type ?? "Consultation",
            },
            {
              id: "availability",
              header: "Availability",
              cell: (slot) => {
                if (slot.status === "free") {
                  return (
                    <span
                      style={{
                        padding: "0.2rem 0.5rem",
                        borderRadius: "9999px",
                        background: "var(--odyssey-emerald-bg)",
                        color: "var(--odyssey-emerald-text)",
                        fontWeight: 600,
                        fontSize: "0.8rem",
                      }}
                    >
                      Available
                    </span>
                  );
                }
                if (slot.status === "busy_unavailable") {
                  return (
                    <span
                      style={{
                        padding: "0.2rem 0.5rem",
                        borderRadius: "9999px",
                        background: "var(--odyssey-slate-blocked-bg)",
                        color: "var(--odyssey-slate-blocked-text)",
                        fontWeight: 600,
                        fontSize: "0.8rem",
                      }}
                    >
                      Unavailable
                    </span>
                  );
                }
                return (
                  <span
                    style={{
                      padding: "0.2rem 0.5rem",
                      borderRadius: "9999px",
                      background: "var(--odyssey-blue-booked-bg)",
                      color: "var(--odyssey-blue-booked-text)",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                    }}
                  >
                    Booked
                  </span>
                );
              },
            },
            {
              id: "action",
              header: "",
              cell: (slot) =>
                slot.appointment_id || slot.status === "busy" ? null : (
                  <Button
                    size="sm"
                    variant={slot.status === "free" ? "outline" : "default"}
                    disabled={availabilityBusy || togglingSlotId === slot.id}
                    onClick={() =>
                      void handleSlotClick(slot)
                    }
                  >
                    {togglingSlotId === slot.id
                      ? "Updating…"
                      : slot.status === "free"
                        ? "Withdraw"
                        : "Reopen"}
                  </Button>
                ),
            },
          ]}
        />
      )}
    </div>
  );
}
