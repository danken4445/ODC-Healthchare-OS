"use client";

import type { AnatomyView } from "@odyssey/types";
import type { KeyboardEvent } from "react";

export interface BodyRegionDefinition {
  code: string;
  display: string;
}

export const MUSCULOSKELETAL_REGIONS: BodyRegionDefinition[] = [
  { code: "head", display: "Head" },
  { code: "neck", display: "Neck" },
  { code: "chest", display: "Chest" },
  { code: "abdomen", display: "Abdomen" },
  { code: "pelvis", display: "Pelvis" },
  { code: "upper-back", display: "Upper back" },
  { code: "lower-back", display: "Lower back" },
  { code: "left-shoulder", display: "Left shoulder" },
  { code: "right-shoulder", display: "Right shoulder" },
  { code: "left-upper-arm", display: "Left upper arm" },
  { code: "right-upper-arm", display: "Right upper arm" },
  { code: "left-elbow", display: "Left elbow" },
  { code: "right-elbow", display: "Right elbow" },
  { code: "left-forearm-hand", display: "Left forearm and hand" },
  { code: "right-forearm-hand", display: "Right forearm and hand" },
  { code: "left-hip", display: "Left hip" },
  { code: "right-hip", display: "Right hip" },
  { code: "left-thigh", display: "Left thigh" },
  { code: "right-thigh", display: "Right thigh" },
  { code: "left-knee", display: "Left knee" },
  { code: "right-knee", display: "Right knee" },
  { code: "left-lower-leg-foot", display: "Left lower leg and foot" },
  { code: "right-lower-leg-foot", display: "Right lower leg and foot" },
];

interface RegionPath extends BodyRegionDefinition {
  d: string;
}

const frontRegions: RegionPath[] = [
  {
    code: "head",
    display: "Head",
    d: "M116 22 C116 4 164 4 164 22 L160 61 C156 78 124 78 120 61 Z",
  },
  { code: "neck", display: "Neck", d: "M128 72 L152 72 L157 99 L123 99 Z" },
  {
    code: "right-shoulder",
    display: "Right shoulder",
    d: "M122 98 C100 94 81 103 73 120 L82 143 L116 132 Z",
  },
  {
    code: "left-shoulder",
    display: "Left shoulder",
    d: "M158 98 C180 94 199 103 207 120 L198 143 L164 132 Z",
  },
  {
    code: "chest",
    display: "Chest",
    d: "M117 105 C128 99 152 99 163 105 L174 174 C157 184 123 184 106 174 Z",
  },
  {
    code: "abdomen",
    display: "Abdomen",
    d: "M108 178 C124 185 156 185 172 178 L168 251 C153 260 127 260 112 251 Z",
  },
  {
    code: "pelvis",
    display: "Pelvis",
    d: "M111 255 C128 263 152 263 169 255 L178 295 C160 310 120 310 102 295 Z",
  },
  {
    code: "right-upper-arm",
    display: "Right upper arm",
    d: "M72 124 C62 135 57 165 59 204 L82 208 L94 143 Z",
  },
  {
    code: "left-upper-arm",
    display: "Left upper arm",
    d: "M208 124 C218 135 223 165 221 204 L198 208 L186 143 Z",
  },
  {
    code: "right-elbow",
    display: "Right elbow",
    d: "M58 207 L82 210 L80 238 L55 236 Z",
  },
  {
    code: "left-elbow",
    display: "Left elbow",
    d: "M222 207 L198 210 L200 238 L225 236 Z",
  },
  {
    code: "right-forearm-hand",
    display: "Right forearm and hand",
    d: "M55 240 L79 241 L72 318 L61 356 L42 350 L51 313 Z",
  },
  {
    code: "left-forearm-hand",
    display: "Left forearm and hand",
    d: "M225 240 L201 241 L208 318 L219 356 L238 350 L229 313 Z",
  },
  {
    code: "right-hip",
    display: "Right hip",
    d: "M103 297 C113 305 124 309 137 308 L133 343 L101 342 Z",
  },
  {
    code: "left-hip",
    display: "Left hip",
    d: "M177 297 C167 305 156 309 143 308 L147 343 L179 342 Z",
  },
  {
    code: "right-thigh",
    display: "Right thigh",
    d: "M101 346 L133 347 L129 426 L99 426 Z",
  },
  {
    code: "left-thigh",
    display: "Left thigh",
    d: "M179 346 L147 347 L151 426 L181 426 Z",
  },
  {
    code: "right-knee",
    display: "Right knee",
    d: "M99 430 L129 430 L127 460 L98 460 Z",
  },
  {
    code: "left-knee",
    display: "Left knee",
    d: "M181 430 L151 430 L153 460 L182 460 Z",
  },
  {
    code: "right-lower-leg-foot",
    display: "Right lower leg and foot",
    d: "M98 464 L127 464 L123 535 L139 548 L88 548 L100 523 Z",
  },
  {
    code: "left-lower-leg-foot",
    display: "Left lower leg and foot",
    d: "M182 464 L153 464 L157 535 L141 548 L192 548 L180 523 Z",
  },
];

const backRegions: RegionPath[] = frontRegions.map((region) => {
  if (region.code === "chest")
    return { ...region, code: "upper-back", display: "Upper back" };
  if (region.code === "abdomen")
    return { ...region, code: "lower-back", display: "Lower back" };
  return region;
});

type SupportedAnatomyView = Extract<AnatomyView, "front" | "back">;

const pathsByView: Record<SupportedAnatomyView, RegionPath[]> = {
  front: frontRegions,
  back: backRegions,
};

const figureCropByView: Record<SupportedAnatomyView, string> = {
  // The source is a 2:1 front/back image. These crops keep the full figure
  // inside the same 280 × 560 coordinate space as its click targets.
  front: "360 0 440 875",
  back: "970 0 440 875",
};

const BODY_MAP_ASSET = "/assets/musculoskeletal-front-back.png";

export interface MusculoskeletalFigureProps {
  activeRegionCodes?: string[];
  anatomyView: AnatomyView;
  onRegionSelect: (region: BodyRegionDefinition) => void;
  onViewChange: (view: AnatomyView) => void;
  selectedRegionCode?: string | null;
}

export function MusculoskeletalFigure({
  activeRegionCodes = [],
  anatomyView,
  onRegionSelect,
  onViewChange,
  selectedRegionCode,
}: MusculoskeletalFigureProps) {
  // Existing clinical records can still contain legacy side-view values. Keep
  // them readable in the front map now that only front and back are offered.
  const activeView: SupportedAnatomyView = anatomyView === "back" ? "back" : "front";

  function activate(
    event: KeyboardEvent<SVGPathElement>,
    region: BodyRegionDefinition,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRegionSelect(region);
    }
  }

  return (
    <section
      className="odyssey-anatomy"
      aria-labelledby="odyssey-anatomy-heading"
    >
      <div className="odyssey-anatomy__heading">
        <div>
          <p>Visual assessment</p>
          <h2 id="odyssey-anatomy-heading">Musculoskeletal map</h2>
        </div>
        <span>Choose a region</span>
      </div>
      <div
        className="odyssey-anatomy__views"
        role="group"
        aria-label="Anatomy view"
      >
        {(["front", "back"] as SupportedAnatomyView[]).map((view) => (
          <button
            aria-pressed={activeView === view}
            key={view}
            onClick={() => onViewChange(view)}
            type="button"
          >
            {`${view[0].toUpperCase()}${view.slice(1)}`}
          </button>
        ))}
      </div>
      <div className="odyssey-anatomy__canvas">
        <svg
          viewBox="0 0 280 560"
          role="group"
          aria-label={`${activeView} view musculoskeletal body map`}
        >
          <svg
            aria-hidden="true"
            className="odyssey-anatomy__image"
            height="560"
            preserveAspectRatio="xMidYMid meet"
            viewBox={figureCropByView[activeView]}
            width="280"
          >
            <image height="889" href={BODY_MAP_ASSET} width="1778" />
          </svg>
          {pathsByView[activeView].map((region) => {
            const selected = selectedRegionCode === region.code;
            const recorded = activeRegionCodes.includes(region.code);
            return (
              <path
                aria-label={`${region.display}${recorded ? ", diagnosis recorded" : ""}`}
                aria-pressed={selected}
                className={`odyssey-anatomy__region${selected ? " is-selected" : ""}${recorded ? " has-record" : ""}`}
                d={region.d}
                key={`${activeView}-${region.code}`}
                onClick={() => onRegionSelect(region)}
                onKeyDown={(event) => activate(event, region)}
                role="button"
                tabIndex={0}
              />
            );
          })}
        </svg>
      </div>
      <div className="odyssey-anatomy__legend" aria-label="Map legend">
        <span>
          <i />
          Available region
        </span>
        <span>
          <i className="has-record" />
          Diagnosis recorded
        </span>
        <span>
          <i className="is-selected" />
          Selected
        </span>
      </div>
    </section>
  );
}
