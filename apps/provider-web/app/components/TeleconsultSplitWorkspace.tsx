"use client";

import { Button } from "@odyssey/ui";
import type { TeleconsultWorkspacePreference } from "@odyssey/types";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";

interface TeleconsultSplitWorkspaceProps {
  documentation: ReactNode;
  patientContext: ReactNode;
  preference: TeleconsultWorkspacePreference;
  onPreferenceChange: (preference: TeleconsultWorkspacePreference) => void;
  video: ReactNode;
}

const DEFAULT_SPLIT_RATIO = 55;
const MIN_DOCUMENTATION_WIDTH = 360;
const MIN_VIDEO_WIDTH = 320;
const SPLITTER_WIDTH = 16;

function clampRatio(value: number, availableWidth?: number): number {
  if (!availableWidth || availableWidth <= MIN_DOCUMENTATION_WIDTH + MIN_VIDEO_WIDTH) {
    return Math.min(70, Math.max(45, value));
  }
  const minimum = (MIN_VIDEO_WIDTH / availableWidth) * 100;
  const maximum = ((availableWidth - MIN_DOCUMENTATION_WIDTH) / availableWidth) * 100;
  return Math.min(maximum, Math.max(minimum, value));
}

/** Keeps the live call mounted while clinicians resize or collapse their chart. */
export function TeleconsultSplitWorkspace({
  documentation,
  patientContext,
  preference,
  onPreferenceChange,
  video,
}: TeleconsultSplitWorkspaceProps) {
  const panesRef = useRef<HTMLDivElement>(null);
  const documentationDetailsRef = useRef<HTMLDetailsElement>(null);
  const [splitRatio, setSplitRatio] = useState(preference.splitRatio || DEFAULT_SPLIT_RATIO);
  const [chartCollapsed, setChartCollapsed] = useState(preference.chartCollapsed);
  const [dragging, setDragging] = useState(false);
  const hasDocumentation = Boolean(documentation);

  useEffect(() => {
    setSplitRatio(preference.splitRatio || DEFAULT_SPLIT_RATIO);
    setChartCollapsed(preference.chartCollapsed);
  }, [preference.chartCollapsed, preference.splitRatio]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1025px), (min-width: 960px) and (orientation: landscape)");
    const ensureDocumentationIsOpen = () => {
      if (desktopQuery.matches && documentationDetailsRef.current) documentationDetailsRef.current.open = true;
    };
    ensureDocumentationIsOpen();
    desktopQuery.addEventListener("change", ensureDocumentationIsOpen);
    return () => desktopQuery.removeEventListener("change", ensureDocumentationIsOpen);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const updateSplit = (clientX: number) => {
      const bounds = panesRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const availableWidth = bounds.width - SPLITTER_WIDTH;
      setSplitRatio(clampRatio(((clientX - bounds.left) / availableWidth) * 100, availableWidth));
    };
    const handlePointerMove = (event: globalThis.PointerEvent) => updateSplit(event.clientX);
    const handlePointerUp = () => {
      setDragging(false);
      setSplitRatio((ratio) => {
        onPreferenceChange({ chartCollapsed: false, splitRatio: ratio });
        return ratio;
      });
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragging, onPreferenceChange]);

  function updateRatio(nextRatio: number, save = false) {
    const availableWidth = (panesRef.current?.getBoundingClientRect().width ?? 0) - SPLITTER_WIDTH;
    const ratio = clampRatio(nextRatio, availableWidth);
    setSplitRatio(ratio);
    if (save) onPreferenceChange({ chartCollapsed: false, splitRatio: ratio });
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!hasDocumentation || chartCollapsed || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!hasDocumentation || chartCollapsed) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    updateRatio(splitRatio + (event.key === "ArrowRight" ? 2 : -2), true);
  }

  function setCollapsed(nextCollapsed: boolean) {
    setChartCollapsed(nextCollapsed);
    onPreferenceChange({ chartCollapsed: nextCollapsed, splitRatio });
  }

  return (
    <div className={`teleconsult-call-workspace${hasDocumentation ? " has-documentation" : ""}${chartCollapsed ? " is-chart-collapsed" : ""}${dragging ? " is-resizing" : ""}`}>
      <aside className="teleconsult-call-workspace__context" aria-label="Patient details and vitals">
        {patientContext}
      </aside>
      <div
        className="teleconsult-call-workspace__panes"
        ref={panesRef}
        style={{ "--teleconsult-video-ratio": `${splitRatio}%` } as CSSProperties}
      >
        <section className="teleconsult-call-workspace__video" aria-label="Video consultation">
          {video}
        </section>
        {hasDocumentation ? <div
          aria-label="Resize video and documentation panes"
          aria-orientation="vertical"
          aria-valuemax={70}
          aria-valuemin={45}
          aria-valuenow={Math.round(splitRatio)}
          className="teleconsult-splitter"
          onKeyDown={resizeWithKeyboard}
          onPointerDown={startDrag}
          role="separator"
          tabIndex={0}
        ><span aria-hidden="true" /></div> : null}
        {hasDocumentation ? <details className="teleconsult-call-workspace__documentation" open ref={documentationDetailsRef}>
          <summary>Documentation workspace</summary>
          <div className="teleconsult-call-workspace__documentation-body">
            <div className="teleconsult-documentation-toggle-row">
              <span>Documentation workspace</span>
              <Button aria-expanded={!chartCollapsed} onClick={() => setCollapsed(true)} size="sm" variant="ghost">Collapse notes</Button>
            </div>
            <div className="teleconsult-call-workspace__documentation-content">{documentation}</div>
          </div>
        </details> : null}
        {hasDocumentation ? <Button aria-expanded={false} className="teleconsult-notes-reopen" onClick={() => setCollapsed(false)} size="sm" variant="secondary">Show notes</Button> : null}
      </div>
    </div>
  );
}
