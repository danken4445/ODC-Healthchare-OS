"use client";

import Link from "next/link";
import { Button } from "@odyssey/ui";

export type WorkspaceTab = "all" | "schedule" | "queue" | "chart" | "diagnostics";

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

export function WorkspaceHeader({
  signedInAs,
  organizationId,
  department,
  roleId,
  liveStatus,
  activeTab,
  onTabChange,
  queueCount,
  notificationsCount,
  hasActiveEncounter,
  onSignOut,
}: WorkspaceHeaderProps) {
  const isOnline = liveStatus === "Live" || liveStatus === "Listening for updates";

  return (
    <header className="workspace-header">
      <div className="workspace-header-bar">
        <div className="workspace-title-group">
          <p className="eyebrow" style={{ letterSpacing: "0.08em" }}>
            Odyssey Healthcare OS · Provider Workspace
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: "1.65rem", fontWeight: 800 }}>
              Clinical Control Center
            </h1>
            <span
              className={`live-pulse-badge ${isOnline ? "" : "offline"}`}
              title={`Realtime subscription status: ${liveStatus}`}
            >
              <span className={`pulse-dot ${isOnline ? "" : "offline"}`} />
              <span className="live-indicator" data-live={isOnline}>
                {liveStatus} queue
              </span>
            </span>
          </div>
          {signedInAs && (
            <div className="workspace-meta-badges" style={{ marginTop: "0.25rem" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--odyssey-muted-foreground)" }}>
                Signed in as <strong style={{ color: "var(--odyssey-foreground)" }}>{signedInAs}</strong>
              </span>
              {department && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "9999px",
                    background: "var(--odyssey-muted)",
                    color: "var(--odyssey-foreground)",
                    fontWeight: 600,
                  }}
                >
                  {department}
                </span>
              )}
              {organizationId && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "9999px",
                    background: "rgba(23, 105, 170, 0.1)",
                    color: "var(--odyssey-primary)",
                    fontWeight: 600,
                  }}
                >
                  Clinic: {organizationId.slice(0, 8)}…
                </span>
              )}
            </div>
          )}
        </div>

        {signedInAs && (
          <nav className="session-actions" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Link
              href="/teleconsult"
              style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "var(--odyssey-primary)",
                textDecoration: "none",
                padding: "0.45rem 0.75rem",
                borderRadius: "0.375rem",
                background: "rgba(23, 105, 170, 0.08)",
              }}
            >
              📹 Video Rooms
            </Link>
            <Link
              href="/payouts"
              style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "var(--odyssey-foreground)",
                textDecoration: "none",
                padding: "0.45rem 0.75rem",
                borderRadius: "0.375rem",
                background: "var(--odyssey-muted)",
              }}
            >
              💳 My Payouts
            </Link>
            <Button size="sm" variant="ghost" onClick={onSignOut}>
              Sign out
            </Button>
          </nav>
        )}
      </div>

      {signedInAs && (
        <div
          className="workspace-nav-tabs"
          role="tablist"
          aria-label="Doctor Workspace Sections"
        >
          <button
            role="tab"
            aria-selected={activeTab === "all"}
            className={`workspace-nav-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => onTabChange("all")}
            type="button"
          >
            <span>🌟 Overview (All)</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "schedule"}
            className={`workspace-nav-tab ${activeTab === "schedule" ? "active" : ""}`}
            onClick={() => onTabChange("schedule")}
            type="button"
          >
            <span>📅 Schedule & Availability Studio</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "queue"}
            className={`workspace-nav-tab ${activeTab === "queue" ? "active" : ""}`}
            onClick={() => onTabChange("queue")}
            type="button"
          >
            <span>📋 Live Queue & Encounters</span>
            {queueCount > 0 && <span className="tab-badge">{queueCount}</span>}
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "chart"}
            className={`workspace-nav-tab ${activeTab === "chart" ? "active" : ""}`}
            onClick={() => onTabChange("chart")}
            type="button"
          >
            <span>🩺 Consultation Chart</span>
            {hasActiveEncounter && (
              <span
                className="tab-badge"
                style={{
                  background: "var(--odyssey-emerald)",
                  color: "#ffffff",
                }}
              >
                Active
              </span>
            )}
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "diagnostics"}
            className={`workspace-nav-tab ${activeTab === "diagnostics" ? "active" : ""}`}
            onClick={() => onTabChange("diagnostics")}
            type="button"
          >
            <span>🔬 Diagnostics & Referrals</span>
            {notificationsCount > 0 && (
              <span
                className="tab-badge"
                style={{
                  background: "var(--odyssey-amber)",
                  color: "#ffffff",
                }}
              >
                {notificationsCount}
              </span>
            )}
          </button>
        </div>
      )}
    </header>
  );
}
