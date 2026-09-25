"use client";

import {
  Boxes,
  ClipboardCheck,
  FlaskConical,
  MoreVertical,
  UserCheck,
  Users,
  Video,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import type { VesperRecentModule } from "../../hooks/use-vesper-dashboard-data";

interface VesperModulesTableProps {
  modules: VesperRecentModule[];
}

const ICON_MAP: Record<string, LucideIcon> = {
  Users,
  UserCheck,
  Video,
  FlaskConical,
  Boxes,
  ClipboardCheck,
  ReceiptText,
};

export function VesperModulesTable({ modules }: VesperModulesTableProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="vesper-card">
      <div className="vesper-card__header">
        <div>
          <h2 className="vesper-card__title">Clinical Modules</h2>
          <p className="vesper-card__subtitle">Recently accessed modules</p>
        </div>
        <div className="vesper-card__actions">
          <button
            className="vesper-icon-btn"
            type="button"
            aria-label="Modules menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="vesper-dropdown-menu">
              <Link
                href="/settings/features"
                className="vesper-dropdown-item"
                onClick={() => setMenuOpen(false)}
              >
                Module settings
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="vesper-table-container">
        <table className="vesper-table">
          <thead>
            <tr>
              <th style={{ width: "45%" }}>Module</th>
              <th style={{ width: "30%" }}>Date</th>
              <th style={{ width: "25%" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {modules.length > 0 ? (
              modules.map((mod) => {
                const Icon = ICON_MAP[mod.iconName] ?? Users;

                return (
                  <tr key={mod.name}>
                    <td>
                      <div className="vesper-module-cell">
                        <Icon size={16} className="vesper-module-icon" />
                        <span className="vesper-module-name">{mod.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="vesper-date-text">{mod.date}</span>
                    </td>
                    <td>
                      <Link href={mod.href} className="vesper-action-link">
                        {mod.actionLabel}
                      </Link>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={3} className="vesper-table-empty">
                  No recently accessed modules
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
