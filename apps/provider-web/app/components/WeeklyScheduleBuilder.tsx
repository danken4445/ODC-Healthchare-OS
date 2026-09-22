"use client";

import type { ClinicServiceSummary } from "@odyssey/types";
import { Button, Field, Input } from "@odyssey/ui";
import { useState, useRef, type FormEvent } from "react";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface WeeklyScheduleBuilderProps {
  services: ClinicServiceSummary[];
  scheduleServiceId: string;
  onServiceChange: (serviceId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  availabilityBusy: boolean;
}

export function WeeklyScheduleBuilder({
  services,
  scheduleServiceId,
  onServiceChange,
  onSubmit,
  availabilityBusy,
}: WeeklyScheduleBuilderProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [dayConfigs, setDayConfigs] = useState(
    WEEKDAYS.map(() => ({
      enabled: false,
      start: "10:00",
      end: "17:00",
    }))
  );

  const activeService = services.find((s) => s.id === scheduleServiceId);

  function applyPreset(preset: "weekdays" | "morning" | "afternoon" | "weekend" | "clear") {
    setDayConfigs((prev) =>
      prev.map((cfg, idx) => {
        if (preset === "clear") {
          return { ...cfg, enabled: false };
        }
        if (preset === "weekdays") {
          // Mon-Fri (1 to 5)
          const isWeekday = idx >= 1 && idx <= 5;
          return {
            ...cfg,
            enabled: isWeekday,
            start: isWeekday ? "09:00" : cfg.start,
            end: isWeekday ? "17:00" : cfg.end,
          };
        }
        if (preset === "morning") {
          // Mon-Sat (1 to 6)
          const isMonSat = idx >= 1 && idx <= 6;
          return {
            ...cfg,
            enabled: isMonSat,
            start: isMonSat ? "08:00" : cfg.start,
            end: isMonSat ? "12:00" : cfg.end,
          };
        }
        if (preset === "afternoon") {
          // Mon-Fri (1 to 5)
          const isWeekday = idx >= 1 && idx <= 5;
          return {
            ...cfg,
            enabled: isWeekday,
            start: isWeekday ? "13:00" : cfg.start,
            end: isWeekday ? "17:00" : cfg.end,
          };
        }
        if (preset === "weekend") {
          // Sat & Sun (0 and 6)
          const isWeekend = idx === 0 || idx === 6;
          return {
            ...cfg,
            enabled: isWeekend,
            start: isWeekend ? "10:00" : cfg.start,
            end: isWeekend ? "14:00" : cfg.end,
          };
        }
        return cfg;
      })
    );
  }

  function handleDayToggle(index: number, checked: boolean) {
    setDayConfigs((prev) =>
      prev.map((cfg, idx) => (idx === index ? { ...cfg, enabled: checked } : cfg))
    );
  }

  function handleTimeChange(index: number, field: "start" | "end", value: string) {
    setDayConfigs((prev) =>
      prev.map((cfg, idx) => (idx === index ? { ...cfg, [field]: value } : cfg))
    );
  }

  return (
    <div style={{ background: "#ffffff", padding: "1.25rem", borderRadius: "0.75rem", border: "1px solid var(--odyssey-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
        <div>
          <h3 className="schedule-heading" style={{ margin: 0, fontSize: "1.25rem" }}>
            Weekly Recurring Availability Builder
          </h3>
          <p className="hint" style={{ marginTop: "0.25rem" }}>
            Select your clinical service, configure working shifts, and Odyssey will generate bookable slots automatically.
          </p>
        </div>
      </div>

      {/* Preset Quick Chips */}
      <div style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.8rem", fontWeight: 700, color: "var(--odyssey-muted-foreground)", textTransform: "uppercase" }}>
          ⚡ Fast Shift Templates
        </p>
        <div className="preset-chips-group">
          <button
            type="button"
            className="preset-chip"
            onClick={() => applyPreset("weekdays")}
          >
            🏢 Standard Weekdays (Mon–Fri 9am–5pm)
          </button>
          <button
            type="button"
            className="preset-chip"
            onClick={() => applyPreset("morning")}
          >
            🌅 Morning Rounds (Mon–Sat 8am–12pm)
          </button>
          <button
            type="button"
            className="preset-chip"
            onClick={() => applyPreset("afternoon")}
          >
            🌇 Afternoon Clinic (Mon–Fri 1pm–5pm)
          </button>
          <button
            type="button"
            className="preset-chip"
            onClick={() => applyPreset("weekend")}
          >
            🏥 Weekend On-Call (Sat–Sun 10am–2pm)
          </button>
          <button
            type="button"
            className="preset-chip"
            style={{ color: "var(--odyssey-destructive)" }}
            onClick={() => applyPreset("clear")}
          >
            ✕ Reset All
          </button>
        </div>
      </div>

      <form
        ref={formRef}
        className="weekly-schedule"
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
      >
        <div style={{ maxWidth: "32rem" }}>
          <Field label="Service">
            <select
              className="odyssey-input"
              name="scheduleServiceId"
              value={scheduleServiceId}
              onChange={(event) => onServiceChange(event.target.value)}
              required
            >
              <option value="" disabled>
                Select a service
              </option>
              {services
                .filter((service) => service.booking_enabled)
                .map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} ({service.duration_minutes} min
                    {service.base_price ? ` · PHP ${Number(service.base_price).toFixed(2)}` : ""})
                  </option>
                ))}
            </select>
          </Field>
          {activeService && (
            <p className="hint" style={{ marginTop: "0.35rem", fontSize: "0.85rem" }}>
              Slot intervals will be partitioned into <strong>{activeService.duration_minutes}-minute</strong> consultation appointments.
            </p>
          )}
        </div>

        <div className="weekly-days" style={{ display: "grid", gap: "0.6rem" }}>
          {WEEKDAYS.map((day, index) => {
            const isEnabled = dayConfigs[index].enabled;
            return (
              <div
                key={day}
                className="weekly-day"
                style={{
                  padding: "0.6rem 0.85rem",
                  borderRadius: "0.5rem",
                  background: isEnabled ? "var(--odyssey-emerald-bg)" : "#f8fafc",
                  border: isEnabled ? "1px solid var(--odyssey-emerald-border)" : "1px solid var(--odyssey-border)",
                  transition: "all 0.15s ease",
                }}
              >
                <label className="day-enabled" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <input
                    name={`day-${index}-enabled`}
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => handleDayToggle(index, e.target.checked)}
                    style={{ width: "1.1rem", height: "1.1rem", accentColor: "var(--odyssey-primary)" }}
                  />
                  <strong style={{ color: isEnabled ? "var(--odyssey-emerald-text)" : "inherit" }}>
                    {day}
                  </strong>
                </label>
                <Input
                  aria-label={`${day} start time`}
                  name={`day-${index}-start`}
                  type="time"
                  value={dayConfigs[index].start}
                  onChange={(e) => handleTimeChange(index, "start", e.target.value)}
                  disabled={!isEnabled}
                />
                <span style={{ textAlign: "center", color: "var(--odyssey-muted-foreground)", fontWeight: 600 }}>
                  to
                </span>
                <Input
                  aria-label={`${day} end time`}
                  name={`day-${index}-end`}
                  type="time"
                  value={dayConfigs[index].end}
                  onChange={(e) => handleTimeChange(index, "end", e.target.value)}
                  disabled={!isEnabled}
                />
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Button type="submit" disabled={availabilityBusy}>
            {availabilityBusy ? "Saving…" : "Add availability"}
          </Button>
          {dayConfigs.filter((d) => d.enabled).length > 0 && (
            <span style={{ fontSize: "0.85rem", color: "var(--odyssey-muted-foreground)" }}>
              {dayConfigs.filter((d) => d.enabled).length} day(s) configured for generation
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
