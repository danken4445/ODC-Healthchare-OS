"use client";

import type { EncounterRegionDiagnosis } from "@odyssey/types";
import type { FormEvent } from "react";
import {
  MUSCULOSKELETAL_REGIONS,
  type BodyRegionDefinition,
} from "./musculoskeletal-figure";

export interface MusculoskeletalRegionPanelProps {
  busy?: boolean;
  diagnoses: EncounterRegionDiagnosis[];
  encounterOpen?: boolean;
  onDiagnosisSubmit?: (text: string) => Promise<void> | void;
  onRegionChange: (region: BodyRegionDefinition) => void;
  readOnly?: boolean;
  selectedRegion: BodyRegionDefinition;
}

export function MusculoskeletalRegionPanel({
  busy = false,
  diagnoses,
  encounterOpen = false,
  onDiagnosisSubmit,
  onRegionChange,
  readOnly = false,
  selectedRegion,
}: MusculoskeletalRegionPanelProps) {
  const regionDiagnoses = diagnoses
    .filter((diagnosis) => diagnosis.regionCode === selectedRegion.code)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onDiagnosisSubmit) return;
    const form = event.currentTarget;
    const value = String(new FormData(form).get("diagnosis") ?? "").trim();
    if (value.length < 2) return;
    await onDiagnosisSubmit(value);
    form.reset();
  }

  return (
    <aside
      className="odyssey-region-panel"
      aria-labelledby="odyssey-region-heading"
    >
      <div className="odyssey-region-panel__heading">
        <p>{readOnly ? "Your clinical history" : "Region assessment"}</p>
        <h2 id="odyssey-region-heading">{selectedRegion.display}</h2>
      </div>
      <label className="odyssey-region-panel__selector">
        <span>Body region</span>
        <select
          className="odyssey-input"
          onChange={(event) => {
            const region = MUSCULOSKELETAL_REGIONS.find(
              (candidate) => candidate.code === event.target.value,
            );
            if (region) onRegionChange(region);
          }}
          value={selectedRegion.code}
        >
          {MUSCULOSKELETAL_REGIONS.map((region) => (
            <option key={region.code} value={region.code}>
              {region.display}
            </option>
          ))}
        </select>
      </label>

      <section
        className="odyssey-region-panel__history"
        aria-labelledby="region-history-heading"
      >
        <div>
          <h3 id="region-history-heading">Recorded diagnoses</h3>
          <span>{regionDiagnoses.length}</span>
        </div>
        {regionDiagnoses.length ? (
          regionDiagnoses.map((diagnosis) => (
            <article key={diagnosis.id}>
              <strong>{diagnosis.diagnosisText}</strong>
              <p>{new Date(diagnosis.recordedAt).toLocaleString()}</p>
              {diagnosis.code ? (
                <small>
                  {diagnosis.codeSystem ?? "Clinical code"}: {diagnosis.code}
                </small>
              ) : null}
            </article>
          ))
        ) : (
          <p className="odyssey-region-panel__empty">
            No diagnoses are mapped to this region.
          </p>
        )}
      </section>

      {!readOnly ? (
        <form
          className="odyssey-region-panel__form"
          onSubmit={(event) => void submit(event)}
        >
          <label htmlFor="present-region-diagnosis">Present diagnosis</label>
          <textarea
            className="odyssey-input"
            disabled={!encounterOpen || busy}
            id="present-region-diagnosis"
            maxLength={1000}
            name="diagnosis"
            placeholder={`Record the current finding or diagnosis for ${selectedRegion.display.toLowerCase()}`}
            required
            rows={5}
          />
          <button
            className="odyssey-button odyssey-button--default"
            disabled={!encounterOpen || busy}
            type="submit"
          >
            {busy ? "Adding…" : "Add diagnosis"}
          </button>
          {!encounterOpen ? (
            <p>
              The encounter must be in progress before a diagnosis can be added.
            </p>
          ) : null}
        </form>
      ) : (
        <p className="odyssey-region-panel__readonly">Read-only patient view</p>
      )}

      <a
        className="odyssey-region-panel__history-link"
        href="#medical-history-heading"
      >
        View full history
      </a>
    </aside>
  );
}
