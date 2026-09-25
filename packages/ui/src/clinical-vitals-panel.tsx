import type { ObservationSummary } from "@odyssey/types";

type VitalPoint = {
  timestamp: string | null;
  value: number;
  secondaryValue?: number;
};

type VitalSeries = {
  id: string;
  label: string;
  points: Array<{ timestamp: string; value: number }>;
};

export interface ClinicalVitalReading {
  id:
    | "blood-pressure"
    | "heart-rate"
    | "respiratory-rate"
    | "temperature"
    | "oxygen-saturation"
    | "weight"
    | "pain";
  label: string;
  value: string | null;
  unit?: string;
  recordedAt: string | null;
  history: VitalPoint[];
  series: VitalSeries[];
  painScale?: boolean;
  weightChange?: number | null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  return null;
}

function observationTime(observation: ObservationSummary): string | null {
  const value = observation.effective_at ?? observation.issued_at;
  return value && Number.isFinite(new Date(value).getTime()) ? value : null;
}

function compareObservations(
  a: ObservationSummary,
  b: ObservationSummary,
): number {
  return (
    (new Date(observationTime(a) ?? 0).getTime() || 0) -
    (new Date(observationTime(b) ?? 0).getTime() || 0)
  );
}

function displayNumber(value: number): string {
  return String(value);
}

function makeSeries(
  id: string,
  label: string,
  history: VitalPoint[],
  value: (point: VitalPoint) => number | undefined,
): VitalSeries {
  return {
    id,
    label,
    points: history.flatMap((point) => {
      const pointValue = value(point);
      return point.timestamp && pointValue !== undefined
        ? [{ timestamp: point.timestamp, value: pointValue }]
        : [];
    }),
  };
}

export function buildClinicalVitalReadings(
  observations: ObservationSummary[],
): ClinicalVitalReading[] {
  const triage = observations
    .filter((observation) => observation.code === "TRIAGE-VITALS")
    .slice()
    .sort(compareObservations);

  const buildHistory = (
    values: (
      triageValue: Record<string, unknown>,
    ) => { value: number; secondaryValue?: number } | null,
  ): VitalPoint[] =>
    triage.flatMap((observation) => {
      const triageValue = objectValue(observation.value);
      const value = triageValue ? values(triageValue) : null;
      return value
        ? [{ timestamp: observationTime(observation), ...value }]
        : [];
    });

  const bloodPressure = buildHistory((value) => {
    const pressure = objectValue(value.blood_pressure);
    const systolic = numberValue(pressure?.systolic);
    const diastolic = numberValue(pressure?.diastolic);
    return systolic !== null && diastolic !== null
      ? { value: systolic, secondaryValue: diastolic }
      : null;
  });
  const heartRate = buildHistory((value) => {
    const pulse = numberValue(value.pulse_bpm);
    return pulse === null ? null : { value: pulse };
  });
  const respiratoryRate = buildHistory((value) => {
    const rate = numberValue(value.respiratory_rate);
    return rate === null ? null : { value: rate };
  });
  const temperature = buildHistory((value) => {
    const reading = numberValue(value.temperature_c);
    return reading === null ? null : { value: reading };
  });
  const oxygenSaturation = buildHistory((value) => {
    const saturation = numberValue(value.oxygen_saturation_percent);
    return saturation === null ? null : { value: saturation };
  });
  const weight = buildHistory((value) => {
    const reading = numberValue(value.weight_kg);
    return reading === null ? null : { value: reading };
  });
  const pain = buildHistory((value) => {
    const score = numberValue(value.pain_score);
    return score === null ? null : { value: score };
  });

  const latest = (history: VitalPoint[]) => history.at(-1) ?? null;
  const latestWeight = latest(weight);
  const previousWeight = weight.length > 1 ? (weight.at(-2) ?? null) : null;
  const weightChange =
    latestWeight &&
    previousWeight &&
    latestWeight.value !== previousWeight.value
      ? latestWeight.value - previousWeight.value
      : null;

  return [
    {
      id: "blood-pressure",
      label: "Blood pressure",
      value: latest(bloodPressure)
        ? `${displayNumber(latest(bloodPressure)!.value)}/${displayNumber(latest(bloodPressure)!.secondaryValue!)}`
        : null,
      unit: "mmHg",
      recordedAt: latest(bloodPressure)?.timestamp ?? null,
      history: bloodPressure,
      series: [
        makeSeries(
          "systolic",
          "Systolic",
          bloodPressure,
          (point) => point.value,
        ),
        makeSeries(
          "diastolic",
          "Diastolic",
          bloodPressure,
          (point) => point.secondaryValue,
        ),
      ],
    },
    {
      id: "heart-rate",
      label: "Heart rate",
      value: latest(heartRate) ? displayNumber(latest(heartRate)!.value) : null,
      unit: "bpm",
      recordedAt: latest(heartRate)?.timestamp ?? null,
      history: heartRate,
      series: [
        makeSeries(
          "heart-rate",
          "Heart rate",
          heartRate,
          (point) => point.value,
        ),
      ],
    },
    {
      id: "respiratory-rate",
      label: "Respiratory rate",
      value: latest(respiratoryRate)
        ? displayNumber(latest(respiratoryRate)!.value)
        : null,
      unit: "/min",
      recordedAt: latest(respiratoryRate)?.timestamp ?? null,
      history: respiratoryRate,
      series: [
        makeSeries(
          "respiratory-rate",
          "Respiratory rate",
          respiratoryRate,
          (point) => point.value,
        ),
      ],
    },
    {
      id: "temperature",
      label: "Temperature",
      value: latest(temperature)
        ? displayNumber(latest(temperature)!.value)
        : null,
      unit: "°C",
      recordedAt: latest(temperature)?.timestamp ?? null,
      history: temperature,
      series: [
        makeSeries(
          "temperature",
          "Temperature",
          temperature,
          (point) => point.value,
        ),
      ],
    },
    {
      id: "oxygen-saturation",
      label: "Oxygen saturation",
      value: latest(oxygenSaturation)
        ? displayNumber(latest(oxygenSaturation)!.value)
        : null,
      unit: "%",
      recordedAt: latest(oxygenSaturation)?.timestamp ?? null,
      history: oxygenSaturation,
      series: [
        makeSeries(
          "oxygen-saturation",
          "Oxygen saturation",
          oxygenSaturation,
          (point) => point.value,
        ),
      ],
    },
    {
      id: "weight",
      label: "Weight",
      value: latestWeight ? displayNumber(latestWeight.value) : null,
      unit: "kg",
      recordedAt: latestWeight?.timestamp ?? null,
      history: weight,
      series: [makeSeries("weight", "Weight", weight, (point) => point.value)],
      weightChange,
    },
    {
      id: "pain",
      label: "Pain",
      value: latest(pain) ? displayNumber(latest(pain)!.value) : null,
      unit: "/10",
      recordedAt: latest(pain)?.timestamp ?? null,
      history: pain,
      series: [makeSeries("pain", "Pain", pain, (point) => point.value)],
      painScale: true,
    },
  ];
}

function formatDateTime(value: string | null): string {
  if (!value) return "Recorded time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatWeightChange(value: number): string {
  return `${value > 0 ? "+" : ""}${displayNumber(value)} kg from previous`;
}

function VitalTrendChart({ reading }: { reading: ClinicalVitalReading }) {
  const timestampedSeries = reading.series.filter(
    (series) => series.points.length > 1,
  );
  const allPoints = timestampedSeries.flatMap((series) => series.points);
  const timestamps = allPoints.map((point) =>
    new Date(point.timestamp).getTime(),
  );
  const start = Math.min(...timestamps);
  const end = Math.max(...timestamps);
  if (!timestampedSeries.length || !Number.isFinite(start) || start === end)
    return null;

  const values = allPoints.map((point) => point.value);
  const minimum = reading.painScale ? 0 : Math.min(...values);
  const maximum = reading.painScale ? 10 : Math.max(...values);
  const spread = Math.max(maximum - minimum, 1);
  const width = 320;
  const height = 144;
  const left = 38;
  const right = 12;
  const top = 12;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (timestamp: string) =>
    left +
    ((new Date(timestamp).getTime() - start) / (end - start)) * plotWidth;
  const y = (value: number) =>
    top + (1 - (value - minimum) / spread) * plotHeight;
  const colors = ["var(--odyssey-primary)", "var(--odyssey-foreground)"];

  return (
    <figure
      className="odyssey-vital-trend"
      aria-labelledby={`${reading.id}-trend-title`}
    >
      <figcaption id={`${reading.id}-trend-title`}>
        <span>Recorded trend</span>
        <small>
          {formatDateTime(new Date(start).toISOString())} –{" "}
          {formatDateTime(new Date(end).toISOString())}
        </small>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${reading.label} trend from ${formatDateTime(new Date(start).toISOString())} to ${formatDateTime(new Date(end).toISOString())}`}
      >
        <line
          className="odyssey-vital-trend__axis"
          x1={left}
          x2={width - right}
          y1={top + plotHeight}
          y2={top + plotHeight}
        />
        <line
          className="odyssey-vital-trend__axis"
          x1={left}
          x2={left}
          y1={top}
          y2={top + plotHeight}
        />
        <text x={left - 6} y={top + 4} textAnchor="end">
          {displayNumber(maximum)}
        </text>
        <text x={left - 6} y={top + plotHeight} textAnchor="end">
          {displayNumber(minimum)}
        </text>
        <text x={left} y={height - 8} textAnchor="start">
          {formatDateTime(new Date(start).toISOString())}
        </text>
        <text x={width - right} y={height - 8} textAnchor="end">
          {formatDateTime(new Date(end).toISOString())}
        </text>
        {timestampedSeries.map((series, index) => {
          const path = series.points
            .map(
              (point, pointIndex) =>
                `${pointIndex ? "L" : "M"}${x(point.timestamp)} ${y(point.value)}`,
            )
            .join(" ");
          return (
            <g
              key={series.id}
              className={`odyssey-vital-trend__series odyssey-vital-trend__series--${index + 1}`}
            >
              <path d={path} style={{ stroke: colors[index] }} />
              {series.points.map((point) => (
                <circle
                  key={`${point.timestamp}-${point.value}`}
                  cx={x(point.timestamp)}
                  cy={y(point.value)}
                  r="4"
                  tabIndex={0}
                  role="img"
                  aria-label={`${series.label}: ${displayNumber(point.value)} ${reading.unit ?? ""}, recorded ${formatDateTime(point.timestamp)}`}
                  style={{ fill: colors[index] }}
                >
                  <title>{`${series.label}: ${displayNumber(point.value)} ${reading.unit ?? ""} — ${formatDateTime(point.timestamp)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {timestampedSeries.length > 1 ? (
        <ul className="odyssey-vital-trend__legend" aria-label="Trend series">
          {timestampedSeries.map((series, index) => (
            <li
              key={series.id}
              className={`odyssey-vital-trend__legend--${index + 1}`}
            >
              {series.label}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}

function VitalHistory({ reading }: { reading: ClinicalVitalReading }) {
  if (reading.history.length < 2) return null;
  return (
    <details className="odyssey-vital-history">
      <summary>
        {reading.history.length} recorded readings <span>View history</span>
      </summary>
      <VitalTrendChart reading={reading} />
      <div className="odyssey-vital-history__table-wrap">
        <table>
          <caption>{reading.label} recorded values</caption>
          <thead>
            <tr>
              <th scope="col">Recorded</th>
              <th scope="col">Value</th>
              {reading.id === "blood-pressure" ? (
                <th scope="col">Diastolic</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {reading.history
              .slice()
              .reverse()
              .map((point, index) => (
                <tr
                  key={`${point.timestamp ?? "unavailable"}-${point.value}-${index}`}
                >
                  <td>{formatDateTime(point.timestamp)}</td>
                  <td>
                    {displayNumber(point.value)}{" "}
                    {reading.id === "blood-pressure"
                      ? "systolic"
                      : reading.unit}
                  </td>
                  {reading.id === "blood-pressure" ? (
                    <td>{displayNumber(point.secondaryValue!)} mmHg</td>
                  ) : null}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function VitalCard({ reading }: { reading: ClinicalVitalReading }) {
  const hasValue = reading.value !== null;
  return (
    <article
      className="odyssey-clinical-vitals__card"
      aria-labelledby={`${reading.id}-label`}
    >
      <h3 id={`${reading.id}-label`}>{reading.label}</h3>
      {hasValue ? (
        <>
          <p className="odyssey-clinical-vitals__value">
            <strong>{reading.value}</strong>
            {reading.unit ? <span>{reading.unit}</span> : null}
          </p>
          {reading.painScale ? (
            <div
              className="odyssey-clinical-vitals__pain-scale"
              aria-label={`Pain score ${reading.value} on a 0 to 10 scale`}
            >
              <span>0</span>
              <meter min="0" max="10" value={Number(reading.value)}>
                {reading.value} out of 10
              </meter>
              <span>10</span>
            </div>
          ) : null}
          {reading.weightChange !== undefined &&
          reading.weightChange !== null ? (
            <p className="odyssey-clinical-vitals__change">
              {formatWeightChange(reading.weightChange)}
            </p>
          ) : null}
          <p className="odyssey-clinical-vitals__time">
            Recorded{" "}
            <time dateTime={reading.recordedAt ?? undefined}>
              {formatDateTime(reading.recordedAt)}
            </time>
          </p>
          <VitalHistory reading={reading} />
        </>
      ) : (
        <p className="odyssey-clinical-vitals__missing">No reading recorded</p>
      )}
    </article>
  );
}

export function ClinicalVitalsPanel({
  readings,
}: {
  readings: ClinicalVitalReading[];
}) {
  const latestTime = readings.reduce<string | null>((latest, reading) => {
    if (!reading.recordedAt) return latest;
    return !latest ||
      new Date(reading.recordedAt).getTime() > new Date(latest).getTime()
      ? reading.recordedAt
      : latest;
  }, null);
  const hasReadings = readings.some((reading) => reading.value !== null);

  return (
    <section
      className="odyssey-clinical-vitals"
      aria-labelledby="clinical-vitals-heading"
    >
      <div className="odyssey-clinical-vitals__heading">
        <div>
          <p>Clinical context</p>
          <h2 id="clinical-vitals-heading">Vitals</h2>
        </div>
        {latestTime ? (
          <span>
            Latest:{" "}
            <time dateTime={latestTime}>{formatDateTime(latestTime)}</time>
          </span>
        ) : null}
      </div>
      {hasReadings ? (
        <div className="odyssey-clinical-vitals__grid">
          {readings.map((reading) => (
            <VitalCard key={reading.id} reading={reading} />
          ))}
        </div>
      ) : (
        <p className="odyssey-clinical-vitals__empty">
          No vital signs have been recorded for this patient.
        </p>
      )}
    </section>
  );
}
