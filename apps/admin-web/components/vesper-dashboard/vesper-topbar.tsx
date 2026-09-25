"use client";

import {
  Bell,
  CheckCircle2,
  ChevronDown,
  LogOut,
  MessageSquare,
  Search,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { useAdminData } from "../admin-data-context";
import type {
  VesperNotification,
  VesperPatientRecord,
} from "../../hooks/use-vesper-dashboard-data";

interface VesperTopbarProps {
  patients?: VesperPatientRecord[];
  notifications?: VesperNotification[];
  onSelectPatient?: (patient: VesperPatientRecord) => void;
  onOpenNotifications?: () => void;
  onOpenReferrals?: () => void;
}

export function VesperTopbar({
  patients = [],
  notifications = [],
  onSelectPatient,
  onOpenNotifications,
  onOpenReferrals,
}: VesperTopbarProps) {
  const router = useRouter();
  const { email, isSuperadmin, organization, organizations, selectOrganization, signOut } =
    useAdminData();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: ⌘+F / Ctrl+F
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchFocused(true);
      }
      if (e.key === "Escape") {
        setSearchFocused(false);
        setUserMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filter patients by search term
  const searchResults = searchTerm.trim()
    ? patients.filter(
        (p) =>
          p.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.bedOrQueue.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.mrn?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Extract user display details from authenticated account
  const userDisplayName = email
    ? email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Clinic Staff";

  const userEmail = email ?? (organization?.name ?? "Sign-in required");

  const initials = userDisplayName
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase())
    .slice(0, 2)
    .join("") || "CS";

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await signOut();
    router.push("/");
  };

  return (
    <header className="vesper-topbar">
      {/* Left: Search input */}
      <div className="vesper-topbar__search-wrap">
        <div className="vesper-search-box">
          <Search size={16} className="vesper-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="vesper-search-input"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
          />
          <div className="vesper-shortcut-badge">
            <span>⌘</span>
            <span>+</span>
            <span>F</span>
          </div>
        </div>

        {/* Live Search Results Overlay */}
        {searchFocused && searchTerm.trim() && (
          <div className="vesper-search-results">
            <div className="vesper-search-results__header">
              <span>Matching Patients & Records</span>
              <button
                type="button"
                className="vesper-search-close"
                onClick={() => setSearchTerm("")}
              >
                <X size={14} />
              </button>
            </div>
            {searchResults.length > 0 ? (
              <ul className="vesper-search-list">
                {searchResults.map((p) => (
                  <li
                    key={p.id}
                    className="vesper-search-item"
                    onMouseDown={() => {
                      onSelectPatient?.(p);
                      setSearchTerm("");
                      setSearchFocused(false);
                    }}
                  >
                    <div className="vesper-search-item__avatar">{p.initials}</div>
                    <div className="vesper-search-item__info">
                      <strong>{p.fullName}</strong>
                      <span>
                        Age {p.age} • Bed {p.bedOrQueue} • {p.mrn}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="vesper-search-empty">
                No matching patients found for "{searchTerm}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Actions Cluster */}
      <div className="vesper-topbar__actions">
        {/* Referrals Inbox Button */}
        <button
          type="button"
          className="vesper-icon-action-btn"
          aria-label="Referrals inbox"
          onClick={onOpenReferrals}
          title="Referrals & Internal Communications"
        >
          <MessageSquare size={17} />
          <span className="vesper-dot-indicator" />
        </button>

        {/* Notifications Button */}
        <button
          type="button"
          className="vesper-icon-action-btn"
          aria-label="Notifications"
          onClick={onOpenNotifications}
          title="Clinical & System Notifications"
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span className="vesper-dot-indicator vesper-dot-indicator--amber" />
          )}
        </button>

        {/* User Profile Block */}
        <div className="vesper-user-profile-anchor">
          <button
            type="button"
            className="vesper-user-profile"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-expanded={userMenuOpen}
          >
            <div className="vesper-user-avatar">{initials}</div>
            <div className="vesper-user-info">
              <span className="vesper-user-name">{userDisplayName}</span>
              <span className="vesper-user-role">{userEmail}</span>
            </div>
          </button>

          {/* User Menu Dropdown */}
          {userMenuOpen && (
            <div className="vesper-user-dropdown">
              <div className="vesper-user-dropdown__header">
                <strong>{userDisplayName}</strong>
                <span>{isSuperadmin ? "Superadministrator" : organization?.name ?? "Clinic Staff"}</span>
              </div>

              {organizations.length > 1 && (
                <div className="vesper-user-dropdown__orgs">
                  <label htmlFor="clinic-select" className="vesper-dropdown-label">Switch Clinic</label>
                  <select
                    id="clinic-select"
                    className="vesper-select"
                    value={organization?.id ?? ""}
                    onChange={(e) => {
                      selectOrganization(e.target.value);
                      setUserMenuOpen(false);
                    }}
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="vesper-user-dropdown__links">
                <Link
                  href="/settings/branding"
                  className="vesper-user-dropdown__link"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <User size={14} /> Clinic Profile
                </Link>
                <Link
                  href="/waiting-room"
                  className="vesper-user-dropdown__link"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <CheckCircle2 size={14} /> Patient Queue
                </Link>
              </div>

              <div className="vesper-user-dropdown__footer">
                <button
                  type="button"
                  className="vesper-logout-btn"
                  onClick={() => void handleLogout()}
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
