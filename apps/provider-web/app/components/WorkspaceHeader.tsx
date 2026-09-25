"use client";

import {
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  FlaskConical,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Stethoscope,
  Users,
  Video,
} from "lucide-react";
import Link from "next/link";
import React from "react";

export type WorkspaceTab = "all" | "queue" | "chart" | "diagnostics" | "schedule";

interface WorkspaceHeaderProps {
  signedInAs: string | null;
  organizationId: string | null;
  department: string | null;
  roleId: string | null;
  liveStatus: string;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  queueCount: number;
  notificationsCount: number;
  hasActiveEncounter: boolean;
  onSignOut: () => void;
}

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "all", label: "Overview" },
  { id: "queue", label: "Daily queue" },
  { id: "chart", label: "Consultation" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "schedule", label: "Availability" },
];

export function WorkspaceHeader({
  signedInAs,
  department,
  liveStatus,
  activeTab,
  onTabChange,
  queueCount,
  notificationsCount,
  hasActiveEncounter,
  onSignOut,
}: WorkspaceHeaderProps) {
  // Extract doctor name from email or signedInAs
  const doctorDisplayName = signedInAs
    ? `Dr. ${signedInAs.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`
    : "Dr. Clinician";

  const initials = doctorDisplayName
    .replace(/^Dr\.\s*/, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase())
    .slice(0, 2)
    .join("") || "DR";

  return (
    <header className="vesper-provider-header">
      {/* Top Header Row */}
      <div className="vesper-provider-header__top">
        <div className="vesper-provider-title-group">
          <div className="vesper-doctor-avatar">{initials}</div>
          <div>
            <div className="vesper-provider-eyebrow-row">
              <span className="vesper-provider-eyebrow">Provider Workspace</span>
              {department && (
                <span className="vesper-dept-tag">{department}</span>
              )}
              <span className="vesper-live-indicator">
                <span className="vesper-live-dot" />
                <span>Queue: {liveStatus.toLowerCase()}</span>
              </span>
            </div>
            <h1 className="vesper-provider-h1">{doctorDisplayName}</h1>
          </div>
        </div>

        <nav className="vesper-provider-header__actions" aria-label="Quick links">
          <Link
            href="/teleconsult"
            className="vesper-header-link"
            title="Video Consultation Rooms"
          >
            <Video size={16} />
            <span>Video rooms</span>
          </Link>
          <Link
            href="/payouts"
            className="vesper-header-link"
            title="Doctor Payouts & Entitlements"
          >
            <HandCoins size={16} />
            <span>Payouts</span>
          </Link>
          <button
            type="button"
            className="vesper-provider-logout-btn"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out of clinical workspace"
          >
            <LogOut size={15} />
            <span>Log out</span>
          </button>
        </nav>
      </div>

      {/* Horizontal Tab Navigation (Matches Vesper Standard UI) */}
      <nav
        className="workspace-nav-tabs vesper-tab-bar"
        aria-label="Doctor workspace sections"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const count =
            tab.id === "queue"
              ? queueCount
              : tab.id === "diagnostics"
              ? notificationsCount
              : 0;

          return (
            <button
              key={tab.id}
              type="button"
              className={`vesper-tab-btn ${
                isActive ? "vesper-tab-btn--active" : "vesper-tab-btn--inactive"
              }`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onTabChange(tab.id)}
            >
              <span>{tab.label}</span>
              {count > 0 && (
                <span
                  className={`vesper-tab-badge ${
                    isActive ? "vesper-tab-badge--active" : "vesper-tab-badge--inactive"
                  }`}
                >
                  {count}
                </span>
              )}
              {tab.id === "chart" && hasActiveEncounter && (
                <span
                  className={`vesper-tab-badge ${
                    isActive ? "vesper-tab-badge--active" : "vesper-tab-badge--highlight"
                  }`}
                >
                  Active
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
