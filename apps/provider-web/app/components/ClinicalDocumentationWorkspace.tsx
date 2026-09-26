import type { ReactNode } from "react";

export type ClinicalDocumentationMode = "visual" | "simple";

interface ClinicalDocumentationWorkspaceProps {
  forceSimpleMode?: boolean;
  headingId: string;
  mode: ClinicalDocumentationMode;
  onModeChange: (mode: ClinicalDocumentationMode) => void;
  simpleContent: ReactNode;
  visualContent: ReactNode;
}

/** Shared clinical documentation shell used by encounter and teleconsult workspaces. */
export function ClinicalDocumentationWorkspace({
  forceSimpleMode = false,
  headingId,
  mode,
  onModeChange,
  simpleContent,
  visualContent,
}: ClinicalDocumentationWorkspaceProps) {
  return (
    <>
      <div className="encounter-modebar">
        <div>
          <p className="eyebrow">Documentation workspace</p>
          <h2 id={headingId}>{mode === "visual" ? "Visual assessment" : "SOAP note"}</h2>
        </div>
        <div className="encounter-mode-toggle" role="group" aria-label="Documentation mode">
          <button aria-pressed={mode === "visual"} disabled={forceSimpleMode} onClick={() => onModeChange("visual")} type="button">Visual</button>
          <button aria-pressed={mode === "simple"} onClick={() => onModeChange("simple")} type="button">Simple</button>
        </div>
      </div>
      {forceSimpleMode ? <p className="encounter-mode-note">Simple mode is used on compact phone viewports.</p> : null}
      {mode === "visual" ? visualContent : simpleContent}
    </>
  );
}
