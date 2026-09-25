"use client";

import type { AppointmentDeliveryMode, AppointmentSlotSummary, ClinicServiceSummary, OrganizationBranding } from "@odyssey/types";
import { Button } from "@odyssey/ui";
import { useMemo, useState } from "react";
import { BookingConfirmationModal } from "./BookingConfirmationModal";

interface AvailableSlotsCalendarProps {
  busySlotId: string | null;
  onBook: (slotId: string, mode: AppointmentDeliveryMode) => void;
  services: ClinicServiceSummary[];
  slots: AppointmentSlotSummary[];
  clinicName?: string;
  branding?: OrganizationBranding | null;
}

function dateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function AvailableSlotsCalendar({
  busySlotId,
  onBook,
  services,
  slots,
  clinicName,
  branding,
}: AvailableSlotsCalendarProps) {
  const firstSlotDate = slots[0]?.start_at ? new Date(slots[0].start_at) : new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(firstSlotDate.getFullYear(), firstSlotDate.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarExpanded, setCalendarExpanded] = useState(true);
  const [showAllTimes, setShowAllTimes] = useState(false);
  const [pendingBooking, setPendingBooking] = useState<{
    slot: AppointmentSlotSummary;
    mode: AppointmentDeliveryMode;
    service?: ClinicServiceSummary;
  } | null>(null);

  const slotsByDate = useMemo(() => {
    const grouped = new Map<string, AppointmentSlotSummary[]>();
    [...slots].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()).forEach((slot) => {
      const key = dateKey(slot.start_at);
      grouped.set(key, [...(grouped.get(key) ?? []), slot]);
    });
    return grouped;
  }, [slots]);

  if (!slots.length) return <p className="slots-empty">No appointment slots are available right now. Please check again soon.</p>;

  const selectedSlots = selectedDate ? (slotsByDate.get(selectedDate) ?? []) : [];
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingDays = new Date(year, month, 1).getDay();
  const cells = [...Array.from({ length: leadingDays }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const selectedLabel = selectedDate ? new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date(`${selectedDate}T12:00:00`)) : null;
  const visibleSlots = showAllTimes ? selectedSlots : selectedSlots.slice(0, 4);

  function chooseDate(key: string) {
    setSelectedDate(key);
    setCalendarExpanded(false);
    setShowAllTimes(false);
  }

  function handleOpenConfirmation(slot: AppointmentSlotSummary, mode: AppointmentDeliveryMode, service?: ClinicServiceSummary) {
    setPendingBooking({ slot, mode, service });
  }

  function handleConfirmBooking() {
    if (!pendingBooking) return;
    onBook(pendingBooking.slot.id, pendingBooking.mode);
    setPendingBooking(null);
  }

  return (
    <div className="slots-calendar-layout">
      {selectedDate && !calendarExpanded ? (
        <button className="selected-date-summary" onClick={() => setCalendarExpanded(true)} type="button">
          <span><small>Selected date</small><strong>{selectedLabel}</strong></span>
          <span>Change</span>
        </button>
      ) : <div className="slots-calendar" aria-label="Choose an appointment date">
        <div className="slots-calendar__header">
          <button aria-label="Previous month" onClick={() => setVisibleMonth(new Date(year, month - 1, 1))} type="button">‹</button>
          <h3 aria-live="polite">{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(visibleMonth)}</h3>
          <button aria-label="Next month" onClick={() => setVisibleMonth(new Date(year, month + 1, 1))} type="button">›</button>
        </div>
        <div className="slots-calendar__weekdays" aria-hidden="true">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="slots-calendar__grid">
          {cells.map((day, index) => {
            if (!day) return <span aria-hidden="true" key={`empty-${index}`} />;
            const date = new Date(year, month, day);
            const key = dateKey(date);
            const count = slotsByDate.get(key)?.length ?? 0;
            const label = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(date);
            return <button aria-label={`${label}${count ? `, ${count} times available` : ", no times available"}`} aria-pressed={selectedDate === key} className={selectedDate === key ? "is-selected" : ""} disabled={!count} key={key} onClick={() => chooseDate(key)} type="button"><span>{day}</span>{count ? <i aria-hidden="true" /> : null}</button>;
          })}
        </div>
        <p className="slots-calendar__legend"><span /> Dates with available appointments</p>
      </div>}

      <div className="slots-for-day" aria-live="polite">
        {!selectedDate ? <div className="slots-for-day__prompt"><span aria-hidden="true">⌁</span><h3>Choose a date</h3><p>Available appointment times will appear here.</p></div> : <>
          <div className="slots-for-day__heading"><div><p>Available times</p><h3>{selectedLabel}</h3></div><span>{selectedSlots.length} {selectedSlots.length === 1 ? "opening" : "openings"}</span></div>
          <div className="slots-for-day__list">
            {visibleSlots.map((slot) => {
              const service = services.find((s) => s.id === slot.clinic_service_id);
              const modes = service?.delivery_modes ?? ["in_person"];
              return <article className="time-slot-card" key={slot.id}>
                <div><strong>{formatTime(slot.start_at)}</strong><span>{slot.service_type ?? "General consultation"}</span></div>
                <div className="time-slot-card__actions">
                  {modes.includes("in_person") ? (
                    <Button
                      disabled={busySlotId !== null}
                      onClick={() => handleOpenConfirmation(slot, "in_person", service)}
                    >
                      {busySlotId === slot.id ? "Booking…" : "Book for a Clinic Visit"}
                    </Button>
                  ) : null}
                  {modes.includes("virtual") ? (
                    <Button
                      disabled={busySlotId !== null}
                      onClick={() => handleOpenConfirmation(slot, "virtual", service)}
                      variant="outline"
                    >
                      {busySlotId === slot.id ? "Booking…" : "Book for a Tele-Consultation"}
                    </Button>
                  ) : null}
                </div>
              </article>;
            })}
          </div>
          {selectedSlots.length > 4 ? <Button className="show-more-times" onClick={() => setShowAllTimes((current) => !current)} variant="ghost">{showAllTimes ? "Show fewer times" : `Show ${selectedSlots.length - 4} more times`}</Button> : null}
        </>}
      </div>

      {/* Confirmation Message Modal */}
      <BookingConfirmationModal
        busy={busySlotId !== null}
        isOpen={pendingBooking !== null}
        slot={pendingBooking?.slot ?? null}
        mode={pendingBooking?.mode ?? null}
        service={pendingBooking?.service}
        clinicName={clinicName}
        branding={branding}
        onCancel={() => setPendingBooking(null)}
        onConfirm={handleConfirmBooking}
      />
    </div>
  );
}
