"use client";

import type { AppointmentSlotSummary } from "@odyssey/types";
import { Button, DataTable } from "@odyssey/ui";
import { useState, useMemo } from "react";

function formatTime(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
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

  // Compute reference week dates
  const weekDates = useMemo(() => {
    const now = new Date();
    // Offset week
    const target = new Date(now);
    target.setDate(now.getDate() + weekOffset * 7);

    // Get Sunday of that week
    const dayOfWeek = target.getDay();
    const sunday = new Date(target);
    sunday.setDate(target.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      days.push(d);
    }
    return days;
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
      const d = new Date(slot.start_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
          <span className="capacity-card__label">🟢 Bookable (Free)</span>
          <span className="capacity-card__value" style={{ color: "var(--odyssey-emerald)" }}>
            {freeSlots}
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--odyssey-emerald-text)" }}>
            Available for patients
          </span>
        </div>

        <div className="capacity-card">
          <span className="capacity-card__label">🔵 Confirmed Bookings</span>
          <span className="capacity-card__value" style={{ color: "var(--odyssey-blue-booked)" }}>
            {bookedSlots}
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--odyssey-blue-booked-text)" }}>
            Assigned appointments
          </span>
        </div>

        <div className="capacity-card">
          <span className="capacity-card__label">⚪ Blocked by Doctor</span>
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
            <button
              type="button"
              className={`view-btn ${viewMode === "matrix" ? "active" : ""}`}
              onClick={() => setViewMode("matrix")}
            >
              📊 Weekly Matrix
            </button>
            <button
              type="button"
              className={`view-btn ${viewMode === "agenda" ? "active" : ""}`}
              onClick={() => setViewMode("agenda")}
            >
              📅 Day Agenda
            </button>
            <button
              type="button"
              className={`view-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
            >
              📋 Classic Table
            </button>
          </div>

          <div style={{ width: "1px", height: "1.5rem", background: "var(--odyssey-border)", margin: "0 0.25rem" }} />

          {/* Status Filter */}
          <div className="toolbar-group">
            <button
              type="button"
              className={`filter-pill ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              All ({totalSlots})
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === "free" ? "active" : ""}`}
              onClick={() => setStatusFilter("free")}
            >
              🟢 Bookable ({freeSlots})
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === "booked" ? "active" : ""}`}
              onClick={() => setStatusFilter("booked")}
            >
              🔵 Booked ({bookedSlots})
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === "blocked" ? "active" : ""}`}
              onClick={() => setStatusFilter("blocked")}
            >
              ⚪ Blocked ({blockedSlots})
            </button>
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
            🔄
          </Button>
        </div>
      </div>

      {/* Main Content Areas */}
      {viewMode === "matrix" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--odyssey-foreground)" }}>
              Week of {formatDate(weekDates[0].toISOString())} – {formatDate(weekDates[6].toISOString())}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--odyssey-muted-foreground)" }}>
              💡 <strong>Tip:</strong> Click any slot card to toggle between <strong>Bookable</strong> and <strong>Blocked</strong>.
            </span>
          </div>

          <div className="weekly-matrix-grid">
            {weekDates.map((dayDate, dayIdx) => {
              const dateKey = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(dayDate.getDate()).padStart(2, "0")}`;
              const daySlots = slotsByDate.get(dateKey) ?? [];
              const isToday = isSameDay(dayDate, new Date());
              const dayFree = daySlots.filter((s) => s.status === "free").length;
              const dayBooked = daySlots.filter((s) => s.appointment_id || s.status === "busy").length;

              return (
                <div
                  key={dateKey}
                  className="matrix-day-column"
                  style={{
                    borderColor: isToday ? "var(--odyssey-primary)" : "var(--odyssey-border)",
                    background: isToday ? "#f0f9ff" : "#f8fafc",
                  }}
                >
                  <div
                    className="matrix-day-header"
                    style={{
                      background: isToday ? "#e0f2fe" : "#ffffff",
                      borderBottom: isToday ? "2px solid var(--odyssey-primary)" : "1px solid var(--odyssey-border)",
                    }}
                  >
                    <div className="matrix-day-name" style={{ color: isToday ? "var(--odyssey-primary)" : "inherit" }}>
                      {WEEKDAYS[dayIdx]} {isToday && "(Today)"}
                    </div>
                    <div className="matrix-day-date">{formatDate(dayDate.toISOString())}</div>
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
                        let statusText = "🟢 Bookable";
                        let actionPrompt = "Click to block";
                        if (isBooked) {
                          modifierClass = "slot-tile--booked";
                          statusText = "🔵 Booked";
                          actionPrompt = "Patient assigned";
                        } else if (isBlocked) {
                          modifierClass = "slot-tile--blocked";
                          statusText = "⚪ Blocked";
                          actionPrompt = "Click to reopen";
                        }

                        return (
                          <button
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
                          </button>
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
              const dateObj = new Date(dateStr + "T00:00:00");
              return (
                <div
                  key={dateStr}
                  style={{
                    background: "#ffffff",
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
                      {formatDate(dateObj.toISOString())}
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
                      let statusText = "🟢 Bookable";
                      let actionPrompt = "Click to block";
                      if (isBooked) {
                        modifierClass = "slot-tile--booked";
                        statusText = "🔵 Booked";
                        actionPrompt = "Patient assigned";
                      } else if (isBlocked) {
                        modifierClass = "slot-tile--blocked";
                        statusText = "⚪ Blocked";
                        actionPrompt = "Click to reopen";
                      }

                      return (
                        <button
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
                        </button>
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
                      🟢 Bookable
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
                      ⚪ Unavailable
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
                    🔵 Booked
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
