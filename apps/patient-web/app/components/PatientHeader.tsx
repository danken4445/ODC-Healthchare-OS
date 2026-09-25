"use client";

import { Button } from "@odyssey/ui";

export type PatientTab = "all" | "book" | "bookings" | "records" | "billing" | "profile";

interface PatientHeaderProps {
  activeTab: PatientTab;
  bookingCount?: number;
  hasActiveVirtual?: boolean;
  liveStatus: string;
  onSelectTab: (tab: PatientTab) => void;
  onSignOut: () => void;
  patientName?: string | null;
  selectedClinicName?: string | null;
  virtualBookingCount?: number;
}

const tabs: Array<{ id: PatientTab; label: string; icon: string }> = [
  { id: "all", label: "Home", icon: "home" },
  { id: "bookings", label: "Bookings", icon: "calendar" },
  { id: "book", label: "Book", icon: "plus" },
  { id: "records", label: "Records", icon: "file" },
  { id: "profile", label: "Profile", icon: "user" },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 22c.6-5 3.3-7 8-7s7.4 2 8 7"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24">{paths[name]}</svg>;
}

export function PatientHeader({ activeTab, bookingCount = 0, hasActiveVirtual, liveStatus, onSelectTab, onSignOut, patientName, selectedClinicName }: PatientHeaderProps) {
  return (
    <>
      <header className="patient-header">
        <div className="patient-header-bar">
          <button className="patient-brand" onClick={() => onSelectTab("all")} type="button">
            <span className="patient-brand__mark">O</span>
            <span><strong>{selectedClinicName ?? "Odyssey Health"}</strong><small>Patient care, made simple</small></span>
          </button>
          <div className="patient-account">
            <span className="patient-account__copy"><small>Welcome back</small><strong>{patientName}</strong></span>
            <span className="live-pulse-badge" data-live={liveStatus === "Live"}><span className="pulse-dot" />{liveStatus === "Live" ? "Live" : "Syncing"}</span>
            <Button size="sm" variant="ghost" onClick={onSignOut} aria-label="Log out" title="Log out">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: "middle" }}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log out
            </Button>
          </div>
        </div>
        <nav className="patient-nav-tabs" aria-label="Patient portal">
          {tabs.map((tab) => (
            <button aria-current={activeTab === tab.id ? "page" : undefined} className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => onSelectTab(tab.id)} type="button">
              <Icon name={tab.icon} /><span>{tab.label}</span>
              {tab.id === "bookings" && bookingCount > 0 ? <small>{bookingCount}</small> : null}
            </button>
          ))}
          <button className={activeTab === "billing" ? "active" : ""} onClick={() => onSelectTab("billing")} type="button"><span>Bills</span></button>
        </nav>
      </header>
      <nav className="mobile-bottom-nav" aria-label="Patient portal">
        {tabs.map((tab) => (
          <button aria-current={activeTab === tab.id ? "page" : undefined} className={`${activeTab === tab.id ? "active" : ""} ${tab.id === "book" ? "mobile-nav-item--book" : ""}`} key={tab.id} onClick={() => onSelectTab(tab.id)} type="button">
            <span className="mobile-nav-icon"><Icon name={tab.icon} /></span><span>{tab.label}</span>
            {tab.id === "bookings" && hasActiveVirtual ? <i aria-label="Call ready" /> : null}
          </button>
        ))}
      </nav>
    </>
  );
}
