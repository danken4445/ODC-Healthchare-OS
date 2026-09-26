import type { ReactNode } from "react";

interface LongitudinalRecordProps {
  children: ReactNode;
  count: number;
}

/** Shared progressive-disclosure shell for the patient's prior clinical record. */
export function LongitudinalRecord({ children, count }: LongitudinalRecordProps) {
  return (
    <details className="encounter-history" id="medical-history-heading">
      <summary>
        <span><span className="eyebrow">Longitudinal record</span><strong>Previous medical history</strong></span>
        <span>{count} earlier {count === 1 ? "encounter" : "encounters"}</span>
      </summary>
      <div className="encounter-history__content">{children}</div>
    </details>
  );
}
