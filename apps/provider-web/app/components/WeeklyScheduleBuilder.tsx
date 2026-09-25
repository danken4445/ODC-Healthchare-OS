"use client";

import type {
  ClinicServiceSummary,
  ProviderWeeklyAvailabilityRow,
  WeeklyAvailabilityWindow,
} from "@odyssey/types";
import { Button, Field, Input } from "@odyssey/ui";
import { useEffect, useMemo, useState, type FormEvent } from "react";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

interface DayConfig {
  enabled: boolean;
  start: string;
  end: string;
}

const DEFAULT_DAY_CONFIG: DayConfig = {
  enabled: false,
  start: "10:00",
  end: "17:00",
};

interface WeeklyScheduleBuilderProps {
  services: ClinicServiceSummary[];
  scheduleServiceId: string;
  savedAvailability: ProviderWeeklyAvailabilityRow[];
  onServiceChange: (serviceId: string) => void;
  onSubmit: (
    serviceId: string,
    windows: WeeklyAvailabilityWindow[],
  ) => Promise<void>;
  availabilityBusy: boolean;
}

function minutesSinceMidnight(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function configsFromSavedRows(
  rows: ProviderWeeklyAvailabilityRow[],
): DayConfig[] {
  return WEEKDAYS.map((_, dayOfWeek) => {
    const saved = rows.find((row) => row.day_of_week === dayOfWeek);
    return saved
      ? {
          enabled: true,
          start: saved.start_time.slice(0, 5),
          end: saved.end_time.slice(0, 5),
        }
      : { ...DEFAULT_DAY_CONFIG };
  });
}

export function WeeklyScheduleBuilder({
  services,
  scheduleServiceId,
  savedAvailability,
  onServiceChange,
  onSubmit,
  availabilityBusy,
}: WeeklyScheduleBuilderProps) {
  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>(() =>
    configsFromSavedRows(savedAvailability),
  );
  const [validationError, setValidationError] = useState("");

  const activeService = services.find(
    (service) => service.id === scheduleServiceId,
  );
  const activeDays = useMemo(
    () =>
      dayConfigs
        .map((config, dayOfWeek) => ({ config, dayOfWeek }))
        .filter(({ config }) => config.enabled),
    [dayConfigs],
  );

  useEffect(() => {
    setDayConfigs(configsFromSavedRows(savedAvailability));
    setValidationError("");
  }, [scheduleServiceId, savedAvailability]);

  function applyPreset(
    preset: "weekdays" | "morning" | "afternoon" | "weekend" | "clear",
  ) {
    setValidationError("");
    setDayConfigs((previous) =>
      previous.map((config, dayOfWeek) => {
        if (preset === "clear") return { ...config, enabled: false };

        const matchesPreset =
          preset === "weekend"
            ? dayOfWeek === 0 || dayOfWeek === 6
            : preset === "morning"
              ? dayOfWeek >= 1 && dayOfWeek <= 6
              : dayOfWeek >= 1 && dayOfWeek <= 5;
        const start =
          preset === "morning"
            ? "08:00"
            : preset === "afternoon"
              ? "13:00"
              : preset === "weekdays"
                ? "09:00"
                : "10:00";
        const end =
          preset === "morning"
            ? "12:00"
            : preset === "weekend"
              ? "14:00"
              : "17:00";

        return matchesPreset
          ? { enabled: true, start, end }
          : { ...config, enabled: false };
      }),
    );
  }

  function handleDayToggle(dayOfWeek: number, checked: boolean) {
    setValidationError("");
    setDayConfigs((previous) =>
      previous.map((config, index) =>
        index === dayOfWeek ? { ...config, enabled: checked } : config,
      ),
    );
  }

  function handleTimeChange(
    dayOfWeek: number,
    field: "start" | "end",
    value: string,
  ) {
    setValidationError("");
    setDayConfigs((previous) =>
      previous.map((config, index) =>
        index === dayOfWeek ? { ...config, [field]: value } : config,
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeService) {
      setValidationError("Choose a service before saving weekly hours.");
      return;
    }
    if (!activeDays.length) {
      setValidationError("Select at least one working day.");
      return;
    }

    for (const { config, dayOfWeek } of activeDays) {
      const duration =
        minutesSinceMidnight(config.end) - minutesSinceMidnight(config.start);
      if (duration <= 0) {
        setValidationError(
          `${WEEKDAYS[dayOfWeek]} must end after its start time.`,
        );
        return;
      }
      if (duration % activeService.duration_minutes !== 0) {
        setValidationError(
          `${WEEKDAYS[dayOfWeek]} must fit complete ${activeService.duration_minutes}-minute appointments.`,
        );
        return;
      }
    }

    await onSubmit(
      activeService.id,
      activeDays.map(({ config, dayOfWeek }) => ({
        dayOfWeek,
        startTime: config.start,
        endTime: config.end,
      })),
    );
  }

  return (
    <section className="weekly-builder" aria-labelledby="weekly-builder-title">
      <div className="weekly-builder__header">
        <div>
          <h3 id="weekly-builder-title" className="schedule-heading">
            Weekly recurring hours
          </h3>
          <p className="hint">
            Choose working days and times once. Odyssey generates future
            appointment slots in Asia/Manila time.
          </p>
        </div>
        <span className="weekly-builder__saved-state">
          {savedAvailability.length
            ? `${savedAvailability.length} saved day${savedAvailability.length === 1 ? "" : "s"}`
            : "No saved hours"}
        </span>
      </div>

      <form className="weekly-schedule" onSubmit={handleSubmit} noValidate>
        <div className="weekly-builder__setup">
          <Field
            className="weekly-builder__service"
            label="Service"
            hint={
              activeService
                ? `${activeService.duration_minutes}-minute appointment intervals`
                : "Select the service these hours apply to"
            }
          >
            <select
              className="odyssey-input"
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
                    {service.base_price
                      ? ` · PHP ${Number(service.base_price).toFixed(2)}`
                      : ""}
                    )
                  </option>
                ))}
            </select>
          </Field>

          <div className="weekly-builder__templates">
            <span className="weekly-builder__label">Quick templates</span>
            <div className="preset-chips-group">
              <Button
                className="preset-chip"
                variant="outline"
                onClick={() => applyPreset("weekdays")}
              >
                Weekdays 9–5
              </Button>
              <Button
                className="preset-chip"
                variant="outline"
                onClick={() => applyPreset("morning")}
              >
                Mornings Mon–Sat
              </Button>
              <Button
                className="preset-chip"
                variant="outline"
                onClick={() => applyPreset("afternoon")}
              >
                Afternoons Mon–Fri
              </Button>
              <Button
                className="preset-chip"
                variant="outline"
                onClick={() => applyPreset("weekend")}
              >
                Weekend 10–2
              </Button>
              <Button
                className="preset-chip preset-chip--clear"
                variant="ghost"
                onClick={() => applyPreset("clear")}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>

        <fieldset className="weekly-builder__days">
          <legend>Working days</legend>
          <div className="weekly-day-picker">
            {WEEKDAYS.map((day, dayOfWeek) => {
              const enabled = dayConfigs[dayOfWeek].enabled;
              return (
                <label
                  key={day}
                  className={`weekly-day-toggle${enabled ? " is-active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) =>
                      handleDayToggle(dayOfWeek, event.target.checked)
                    }
                  />
                  <span>{day}</span>
                  <small>{enabled ? "Included" : "Off"}</small>
                </label>
              );
            })}
          </div>
        </fieldset>

        {activeDays.length ? (
          <div className="weekly-day-editors" aria-label="Hours by day">
            {activeDays.map(({ config, dayOfWeek }) => (
              <section className="weekly-day-editor" key={WEEKDAYS[dayOfWeek]}>
                <strong>{WEEKDAYS[dayOfWeek]}</strong>
                <div className="weekly-day-editor__times">
                  <label>
                    <span>From</span>
                    <Input
                      aria-label={`${WEEKDAYS[dayOfWeek]} start time`}
                      type="time"
                      value={config.start}
                      onChange={(event) =>
                        handleTimeChange(
                          dayOfWeek,
                          "start",
                          event.target.value,
                        )
                      }
                    />
                  </label>
                  <span className="weekly-day-editor__separator">to</span>
                  <label>
                    <span>Until</span>
                    <Input
                      aria-label={`${WEEKDAYS[dayOfWeek]} end time`}
                      type="time"
                      value={config.end}
                      onChange={(event) =>
                        handleTimeChange(dayOfWeek, "end", event.target.value)
                      }
                    />
                  </label>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="weekly-builder__empty">
            Select a day above to add its working hours.
          </div>
        )}

        {validationError ? (
          <p className="weekly-builder__error" role="alert">
            {validationError}
          </p>
        ) : null}

        <div className="weekly-builder__actions">
          <div>
            <strong>
              {activeDays.length} day{activeDays.length === 1 ? "" : "s"} in
              this schedule
            </strong>
            <span>
              Saving replaces the recurring hours for the selected service.
            </span>
          </div>
          <Button
            type="submit"
            disabled={availabilityBusy || !activeService}
          >
            {availabilityBusy ? "Saving…" : "Save weekly hours"}
          </Button>
        </div>
      </form>
    </section>
  );
}
