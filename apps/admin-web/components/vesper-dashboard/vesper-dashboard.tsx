"use client";

import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Clock,
  FlaskConical,
  Plus,
  RefreshCw,
  Share2,
  UserPlus,
  Users,
} from "lucide-react";
import React, { useState } from "react";
import { useAdminData } from "../admin-data-context";
import { AdminSignIn } from "../admin-sign-in";
import {
  useVesperDashboardData,
  type VesperPatientRecord,
} from "../../hooks/use-vesper-dashboard-data";
import { VesperStatCard } from "./vesper-stat-card";
import { VesperPatientRecords } from "./vesper-patient-records";
import { VesperDiagnosticStatus } from "./vesper-diagnostic-status";
import { VesperModulesTable } from "./vesper-modules-table";
import { VesperTasksCard } from "./vesper-tasks-card";
import { VesperTopbar } from "./vesper-topbar";
import {
  NewActionModal,
  NotificationsDrawer,
  PatientDetailModal,
} from "./vesper-modals";

export function VesperDashboard() {
  const { email, organization, permissions, isSuperadmin } = useAdminData();
  const {
    loading,
    error,
    kpis,
    patientRecords,
    diagnosticTests,
    recentModules,
    tasks,
    notifications,
    toggleTask,
    markNotificationRead,
    createPatient,
    createBooking,
    createReferral,
    refetch,
  } = useVesperDashboardData();

  // Modal & CTA dropdown state
  const [ctaMenuOpen, setCtaMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<
    "patient" | "booking" | "referral" | "encounter" | null
  >(null);
  const [selectedPatient, setSelectedPatient] = useState<VesperPatientRecord | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // If user is not authenticated and has error, display sign-in
  if (!email && error) {
    return <AdminSignIn />;
  }

  // Derive first name from email or default to "Provider"
  const firstName = email
    ? email.split("@")[0].split(/[._-]/)[0].replace(/\b\w/g, (c) => c.toUpperCase())
    : "Provider";

  // RBAC checks for CTA dropdown
  const canManagePatients = isSuperadmin || permissions.includes("can_manage_patients");
  const canManageAppointments = isSuperadmin || permissions.includes("can_manage_appointments");
  const canOrderDiagnostics = isSuperadmin || permissions.includes("can_order_diagnostics") || permissions.includes("can_view_referrals");

  return (
    <div className="vesper-dashboard-root">
      {/* Topbar: Search, Notifications, Profile */}
      <VesperTopbar
        patients={patientRecords}
        notifications={notifications}
        onSelectPatient={(p) => setSelectedPatient(p)}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenReferrals={() => setActiveModal("referral")}
      />

      <div className="vesper-dashboard-content">
        {/* Page Header + CTA */}
        <section className="vesper-header-row">
          <div className="vesper-header-left">
            <h1 className="vesper-h1">Welcome {firstName}</h1>
            <p className="vesper-header-subcopy">
              Manage your patients and their account permissions here.
            </p>
          </div>

          <div className="vesper-header-right">
            <div className="vesper-cta-group">
              <button
                type="button"
                className="vesper-primary-cta"
                onClick={() => setCtaMenuOpen(!ctaMenuOpen)}
                aria-expanded={ctaMenuOpen}
              >
                <Plus size={16} strokeWidth={2.5} />
                <span>New Encounter</span>
                <span className="vesper-cta-divider" />
                <ChevronDown size={14} className="vesper-cta-chevron" />
              </button>

              {/* Primary CTA Dropdown */}
              {ctaMenuOpen && (
                <div className="vesper-cta-dropdown">
                  {canManagePatients && (
                    <button
                      type="button"
                      className="vesper-cta-dropdown-item"
                      onClick={() => {
                        setCtaMenuOpen(false);
                        setActiveModal("patient");
                      }}
                    >
                      <UserPlus size={15} />
                      <span>New Patient</span>
                    </button>
                  )}
                  {canManageAppointments && (
                    <button
                      type="button"
                      className="vesper-cta-dropdown-item"
                      onClick={() => {
                        setCtaMenuOpen(false);
                        setActiveModal("booking");
                      }}
                    >
                      <CalendarDays size={15} />
                      <span>New Booking</span>
                    </button>
                  )}
                  {canOrderDiagnostics && (
                    <button
                      type="button"
                      className="vesper-cta-dropdown-item"
                      onClick={() => {
                        setCtaMenuOpen(false);
                        setActiveModal("referral");
                      }}
                    >
                      <Share2 size={15} />
                      <span>New Referral</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Top KPI Stat Cards (Row of 4) */}
        <section className="vesper-kpi-grid">
          <VesperStatCard
            label="Avg. Consultation Time"
            value={kpis.avgConsultationTime.value}
            unit={kpis.avgConsultationTime.unit}
            icon={Clock}
            delta={kpis.avgConsultationTime.delta}
            isPositive={kpis.avgConsultationTime.isPositive}
          />
          <VesperStatCard
            label="Patient Avg. Stay"
            value={kpis.avgQueueWaitTime.value}
            unit={kpis.avgQueueWaitTime.unit}
            icon={Users}
            delta={kpis.avgQueueWaitTime.delta}
            isPositive={kpis.avgQueueWaitTime.isPositive}
          />
          <VesperStatCard
            label="Pending Reports"
            value={kpis.pendingLabResults.value}
            icon={FlaskConical}
            delta={kpis.pendingLabResults.delta}
            isPositive={kpis.pendingLabResults.isPositive}
          />
          <VesperStatCard
            label="Overdue Tasks"
            value={kpis.overdueClaims.value}
            icon={ClipboardCheck}
            delta={kpis.overdueClaims.delta}
            isPositive={kpis.overdueClaims.isPositive}
          />
        </section>

        {/* Two-Column Widget Row 1: Patient Records & Diagnostic Test Status */}
        <section className="vesper-widget-row">
          <VesperPatientRecords
            patients={patientRecords}
            onSelectPatient={(p) => setSelectedPatient(p)}
            onRefresh={() => void refetch()}
          />
          <VesperDiagnosticStatus tests={diagnosticTests} />
        </section>

        {/* Two-Column Widget Row 2: Recently Accessed Modules & Tasks */}
        <section className="vesper-widget-row">
          <VesperModulesTable modules={recentModules} />
          <VesperTasksCard tasks={tasks} onToggleTask={toggleTask} />
        </section>
      </div>

      {/* Interactive Modals */}
      <NewActionModal
        type={activeModal ?? "encounter"}
        isOpen={activeModal !== null}
        onClose={() => setActiveModal(null)}
        patients={patientRecords}
        onCreatePatient={createPatient}
        onCreateBooking={createBooking}
        onCreateReferral={createReferral}
      />

      <PatientDetailModal
        patient={selectedPatient}
        onClose={() => setSelectedPatient(null)}
      />

      <NotificationsDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        onMarkRead={markNotificationRead}
      />
    </div>
  );
}
