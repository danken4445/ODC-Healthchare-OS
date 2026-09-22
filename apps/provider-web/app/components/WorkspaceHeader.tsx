"use client";

import Link from "next/link";
import { Button, DepartmentTag } from "@odyssey/ui";

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

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "all", label: "Overview" },
  { id: "queue", label: "Daily queue" },
  { id: "chart", label: "Consultation" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "schedule", label: "Availability" },
];

export function WorkspaceHeader({ signedInAs, department, liveStatus, activeTab, onTabChange, queueCount, notificationsCount, hasActiveEncounter, onSignOut }: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="workspace-header-bar">
        <div className="workspace-title-group">
          <p className="eyebrow">Provider workspace</p>
          <h1>Clinical workspace</h1>
          <div className="workspace-meta-badges">
            <span>{signedInAs}</span>
            {department ? <DepartmentTag>{department}</DepartmentTag> : null}
            <span className="realtime-status">Queue: {liveStatus.toLowerCase()}</span>
          </div>
        </div>
        <nav className="session-actions" aria-label="Account links">
          <Link href="/teleconsult">Video rooms</Link>
          <Link href="/payouts">Payouts</Link>
          <Button size="sm" variant="ghost" onClick={onSignOut}>Sign out</Button>
        </nav>
      </div>
      <nav className="workspace-nav-tabs" aria-label="Provider workspace sections">
        {tabs.map((tab) => {
          const count = tab.id === "queue" ? queueCount : tab.id === "diagnostics" ? notificationsCount : 0;
          return (
            <Button key={tab.id} size="sm" variant={activeTab === tab.id ? "default" : "ghost"} aria-current={activeTab === tab.id ? "page" : undefined} onClick={() => onTabChange(tab.id)}>
              {tab.label}{count ? ` (${count})` : ""}{tab.id === "chart" && hasActiveEncounter ? " — Active" : ""}
            </Button>
          );
        })}
      </nav>
    </header>
  );
}
