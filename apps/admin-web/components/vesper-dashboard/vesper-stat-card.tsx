"use client";

import { LucideIcon, ArrowUp, ArrowDown } from "lucide-react";
import React from "react";

interface VesperStatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  delta: string;
  isPositive: boolean;
  deltaContext?: string;
}

export function VesperStatCard({
  label,
  value,
  unit,
  icon: Icon,
  delta,
  isPositive,
  deltaContext = "vs. last month",
}: VesperStatCardProps) {
  return (
    <div className="vesper-stat-card">
      <div className="vesper-stat-card__top">
        <span className="vesper-stat-card__label">{label}</span>
        <div className="vesper-stat-card__icon-badge">
          <Icon size={16} strokeWidth={2} />
        </div>
      </div>

      <div className="vesper-stat-card__bottom">
        <div className="vesper-stat-card__value-group">
          <span className="vesper-stat-card__value">{value}</span>
          {unit && <span className="vesper-stat-card__unit">{unit}</span>}
        </div>

        <div className="vesper-stat-card__delta-group">
          <span
            className={`vesper-stat-card__delta-pill ${
              isPositive ? "vesper-stat-card__delta-pill--positive" : "vesper-stat-card__delta-pill--negative"
            }`}
          >
            {isPositive ? (
              <ArrowUp size={11} strokeWidth={2.5} />
            ) : (
              <ArrowDown size={11} strokeWidth={2.5} />
            )}
            <span>{delta}</span>
          </span>
          <span className="vesper-stat-card__delta-context">{deltaContext}</span>
        </div>
      </div>
    </div>
  );
}
