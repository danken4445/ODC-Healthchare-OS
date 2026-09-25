"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  FlaskConical,
  Mail,
  MapPin,
  Phone,
  Plus,
  Share2,
  User,
  Users,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import type {
  VesperNotification,
  VesperPatientRecord,
} from "../../hooks/use-vesper-dashboard-data";

// ─── 1. New Encounter / Creation Modal ───────────────────────────────────────

interface NewActionModalProps {
  type: "encounter" | "patient" | "booking" | "referral";
  isOpen: boolean;
  onClose: () => void;
  patients: VesperPatientRecord[];
  onCreatePatient: (input: {
    fullName: string;
    birthDate: string;
    gender: string;
    telecom?: string;
    address?: string;
  }) => Promise<boolean>;
  onCreateBooking: (input: {
    patientId: string;
    serviceType: string;
    startAt: string;
    minutesDuration?: number;
  }) => Promise<boolean>;
  onCreateReferral: (input: {
    patientId: string;
    codeDisplay: string;
    priority: string;
    note?: string;
  }) => Promise<boolean>;
}

export function NewActionModal({
  type,
  isOpen,
  onClose,
  patients,
  onCreatePatient,
  onCreateBooking,
  onCreateReferral,
}: NewActionModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [patientName, setPatientName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("female");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id ?? "");
  const [serviceType, setServiceType] = useState("General Medical Consultation");
  const [bookingTime, setBookingTime] = useState(
    new Date(Date.now() + 3600000).toISOString().slice(0, 16)
  );

  const [specialistCode, setSpecialistCode] = useState("Cardiology Specialist Consultation");
  const [priority, setPriority] = useState("routine");
  const [referralNote, setReferralNote] = useState("");

  if (!isOpen) return null;

  const handleSubmitPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) {
      setErrorMsg("Patient name is required.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    const success = await onCreatePatient({
      fullName: patientName,
      birthDate,
      gender,
      telecom: phone,
      address,
    });
    setSubmitting(false);
    if (success) {
      onClose();
    } else {
      setErrorMsg("Failed to register patient. Please verify database connectivity.");
    }
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    const success = await onCreateBooking({
      patientId: selectedPatientId || patients[0]?.id || "default",
      serviceType,
      startAt: new Date(bookingTime).toISOString(),
      minutesDuration: 30,
    });
    setSubmitting(false);
    if (success) {
      onClose();
    } else {
      setErrorMsg("Failed to schedule booking. Please try again.");
    }
  };

  const handleSubmitReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    const success = await onCreateReferral({
      patientId: selectedPatientId || patients[0]?.id || "default",
      codeDisplay: specialistCode,
      priority,
      note: referralNote,
    });
    setSubmitting(false);
    if (success) {
      onClose();
    } else {
      setErrorMsg("Failed to issue specialist referral.");
    }
  };

  return (
    <div className="vesper-modal-backdrop" onClick={onClose}>
      <div
        className="vesper-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="vesper-modal__header">
          <div>
            <h2 className="vesper-modal__title">
              {type === "patient" && "Register New Patient"}
              {type === "booking" && "Schedule New Appointment"}
              {type === "referral" && "Create Specialist Referral"}
              {type === "encounter" && "Start New Encounter"}
            </h2>
            <p className="vesper-modal__desc">
              {type === "patient" && "Add a new FHIR Patient record to the clinic registry."}
              {type === "booking" && "Book a clinical or teleconsultation appointment."}
              {type === "referral" && "Route patient to an authorized medical specialist."}
              {type === "encounter" && "Admit patient directly to daily triage & consult queue."}
            </p>
          </div>
          <button
            type="button"
            className="vesper-modal__close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div className="vesper-modal__error" role="alert">
            <AlertCircle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* New Patient Form */}
        {(type === "patient" || type === "encounter") && (
          <form onSubmit={handleSubmitPatient} className="vesper-modal__form">
            <div className="vesper-form-field">
              <label className="vesper-form-label">Full Name</label>
              <input
                type="text"
                className="vesper-form-input"
                placeholder="e.g. Maria Santos Dela Cruz"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                required
              />
            </div>

            <div className="vesper-form-row">
              <div className="vesper-form-field">
                <label className="vesper-form-label">Date of Birth</label>
                <input
                  type="date"
                  className="vesper-form-input"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  required
                />
              </div>

              <div className="vesper-form-field">
                <label className="vesper-form-label">Gender</label>
                <select
                  className="vesper-form-select"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="female">Female (♀)</option>
                  <option value="male">Male (♂)</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="vesper-form-row">
              <div className="vesper-form-field">
                <label className="vesper-form-label">Phone Number</label>
                <input
                  type="tel"
                  className="vesper-form-input"
                  placeholder="+63 9XX XXX XXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="vesper-form-field">
                <label className="vesper-form-label">City / Address</label>
                <input
                  type="text"
                  className="vesper-form-input"
                  placeholder="City, Province"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>

            <div className="vesper-modal__footer">
              <button
                type="button"
                className="vesper-btn-outline"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="vesper-btn-primary"
                disabled={submitting}
              >
                {submitting ? "Registering..." : "Save Patient Record"}
              </button>
            </div>
          </form>
        )}

        {/* New Booking Form */}
        {type === "booking" && (
          <form onSubmit={handleSubmitBooking} className="vesper-modal__form">
            <div className="vesper-form-field">
              <label className="vesper-form-label">Select Patient</label>
              <select
                className="vesper-form-select"
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                disabled={patients.length === 0}
              >
                {patients.length > 0 ? (
                  patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} (Age {p.age}, Bed {p.bedOrQueue})
                    </option>
                  ))
                ) : (
                  <option value="">No registered patients available</option>
                )}
              </select>
            </div>

            <div className="vesper-form-field">
              <label className="vesper-form-label">Service / Consultation Type</label>
              <select
                className="vesper-form-select"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
              >
                <option value="General Medical Consultation">General Medical Consultation</option>
                <option value="Follow-up Consultation">Follow-up Consultation</option>
                <option value="Teleconsultation (Video)">Teleconsultation (Video)</option>
                <option value="Executive Health Check">Executive Health Check</option>
                <option value="Diagnostic Laboratory Panel">Diagnostic Laboratory Panel</option>
              </select>
            </div>

            <div className="vesper-form-field">
              <label className="vesper-form-label">Date & Time</label>
              <input
                type="datetime-local"
                className="vesper-form-input"
                value={bookingTime}
                onChange={(e) => setBookingTime(e.target.value)}
                required
              />
            </div>

            <div className="vesper-modal__footer">
              <button
                type="button"
                className="vesper-btn-outline"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="vesper-btn-primary"
                disabled={submitting || patients.length === 0}
              >
                {submitting ? "Booking..." : "Confirm Booking"}
              </button>
            </div>
          </form>
        )}

        {/* New Referral Form */}
        {type === "referral" && (
          <form onSubmit={handleSubmitReferral} className="vesper-modal__form">
            <div className="vesper-form-field">
              <label className="vesper-form-label">Select Patient</label>
              <select
                className="vesper-form-select"
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                disabled={patients.length === 0}
              >
                {patients.length > 0 ? (
                  patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} (Age {p.age})
                    </option>
                  ))
                ) : (
                  <option value="">No registered patients available</option>
                )}
              </select>
            </div>

            <div className="vesper-form-field">
              <label className="vesper-form-label">Specialist Department / Specialty</label>
              <select
                className="vesper-form-select"
                value={specialistCode}
                onChange={(e) => setSpecialistCode(e.target.value)}
              >
                <option value="Cardiology Specialist Consultation">Cardiology Specialist Consultation</option>
                <option value="Endocrinology Specialist">Endocrinology & Diabetes Clinic</option>
                <option value="Pulmonology Consultation">Pulmonology & Respiratory</option>
                <option value="Orthopedic Surgery Review">Orthopedic Surgery Review</option>
                <option value="Gastroenterology Evaluation">Gastroenterology Evaluation</option>
              </select>
            </div>

            <div className="vesper-form-field">
              <label className="vesper-form-label">Priority</label>
              <select
                className="vesper-form-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT / Immediate</option>
              </select>
            </div>

            <div className="vesper-form-field">
              <label className="vesper-form-label">Referral Notes / Clinical Indication</label>
              <textarea
                className="vesper-form-textarea"
                rows={3}
                placeholder="Reason for specialist evaluation, current findings, provisional diagnosis..."
                value={referralNote}
                onChange={(e) => setReferralNote(e.target.value)}
              />
            </div>

            <div className="vesper-modal__footer">
              <button
                type="button"
                className="vesper-btn-outline"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="vesper-btn-primary"
                disabled={submitting || patients.length === 0}
              >
                {submitting ? "Issuing..." : "Issue Referral"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── 2. Patient Detail Modal (FHIR Record Sheet) ─────────────────────────────

interface PatientDetailModalProps {
  patient: VesperPatientRecord | null;
  onClose: () => void;
}

export function PatientDetailModal({
  patient,
  onClose,
}: PatientDetailModalProps) {
  if (!patient) return null;

  return (
    <div className="vesper-modal-backdrop" onClick={onClose}>
      <div
        className="vesper-modal vesper-modal--wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="vesper-modal__header">
          <div className="vesper-patient-modal-title-group">
            <div className="vesper-patient-modal-avatar">{patient.initials}</div>
            <div>
              <h2 className="vesper-modal__title">{patient.fullName}</h2>
              <p className="vesper-modal__desc">
                FHIR Patient Resource • MRN: <strong>{patient.mrn}</strong> • Bed/Queue:{" "}
                <strong>{patient.bedOrQueue}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="vesper-modal__close-btn"
            onClick={onClose}
            aria-label="Close patient details"
          >
            <X size={18} />
          </button>
        </div>

        <div className="vesper-modal__body">
          {/* Patient Quick Vitals & Demographics */}
          <div className="vesper-patient-info-grid">
            <div className="vesper-info-card">
              <span className="vesper-info-card__label">Age & Gender</span>
              <strong className="vesper-info-card__value">
                {patient.age} yrs •{" "}
                {patient.gender === "female" ? "Female (♀)" : "Male (♂)"}
              </strong>
            </div>

            <div className="vesper-info-card">
              <span className="vesper-info-card__label">Date of Birth</span>
              <strong className="vesper-info-card__value">
                {patient.birthDate ?? "Not recorded"}
              </strong>
            </div>

            <div className="vesper-info-card">
              <span className="vesper-info-card__label">Queue / Bed Slot</span>
              <strong className="vesper-info-card__value">Room {patient.bedOrQueue}</strong>
            </div>

            <div className="vesper-info-card">
              <span className="vesper-info-card__label">Clinical Alerts</span>
              <strong className="vesper-info-card__value vesper-text-amber">
                {patient.alertsCount} Active Alert{patient.alertsCount === 1 ? "" : "s"}
              </strong>
            </div>
          </div>

          {/* Contact Details */}
          <div className="vesper-detail-section">
            <h3 className="vesper-detail-section__title">Contact & Demographics</h3>
            <div className="vesper-contact-list">
              <div className="vesper-contact-item">
                <Phone size={14} className="vesper-contact-icon" />
                <span>{patient.telecom ?? "No contact number recorded"}</span>
              </div>
              <div className="vesper-contact-item">
                <MapPin size={14} className="vesper-contact-icon" />
                <span>{patient.address ?? "No address recorded"}</span>
              </div>
              <div className="vesper-contact-item">
                <CheckCircle size={14} className="vesper-contact-icon vesper-text-emerald" />
                <span>Verified PhilHealth / HMO Active Beneficiary</span>
              </div>
            </div>
          </div>

          {/* Clinical Actions Quick Links */}
          <div className="vesper-detail-section">
            <h3 className="vesper-detail-section__title">Clinical Actions</h3>
            <div className="vesper-quick-actions">
              <Link
                href="/encounters"
                className="vesper-action-btn"
                onClick={onClose}
              >
                <FileText size={15} />
                <span>Open SOAP Note</span>
              </Link>
              <Link
                href="/teleconsult"
                className="vesper-action-btn"
                onClick={onClose}
              >
                <Video size={15} />
                <span>Start Video Consult</span>
              </Link>
              <Link
                href="/laboratory-services"
                className="vesper-action-btn"
                onClick={onClose}
              >
                <FlaskConical size={15} />
                <span>Order Diagnostics</span>
              </Link>
              <Link
                href="/billing"
                className="vesper-action-btn"
                onClick={onClose}
              >
                <Plus size={15} />
                <span>View Invoices & Billing</span>
              </Link>
            </div>
          </div>
        </div>

        <div className="vesper-modal__footer">
          <button
            type="button"
            className="vesper-btn-outline"
            onClick={onClose}
          >
            Close
          </button>
          <Link
            href={`/patients`}
            className="vesper-btn-primary"
            onClick={onClose}
          >
            Open Full Patient Record
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── 3. Notifications Drawer Modal ───────────────────────────────────────────

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: VesperNotification[];
  onMarkRead: (id: string) => void;
}

export function NotificationsDrawer({
  isOpen,
  onClose,
  notifications,
  onMarkRead,
}: NotificationsDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="vesper-modal-backdrop" onClick={onClose}>
      <div
        className="vesper-modal vesper-drawer-right"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="vesper-modal__header">
          <div>
            <h2 className="vesper-modal__title">Clinical Notifications</h2>
            <p className="vesper-modal__desc">Real-time alerts, lab results & updates</p>
          </div>
          <button
            type="button"
            className="vesper-modal__close-btn"
            onClick={onClose}
            aria-label="Close notifications"
          >
            <X size={18} />
          </button>
        </div>

        <div className="vesper-drawer__body">
          {notifications.length > 0 ? (
            <ul className="vesper-notifications-feed">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`vesper-notif-item ${
                    n.read ? "vesper-notif-item--read" : "vesper-notif-item--unread"
                  }`}
                  onClick={() => onMarkRead(n.id)}
                >
                  <div className="vesper-notif-icon">
                    <AlertCircle size={16} />
                  </div>
                  <div className="vesper-notif-content">
                    <strong className="vesper-notif-title">{n.title}</strong>
                    <p className="vesper-notif-msg">{n.message}</p>
                    <span className="vesper-notif-time">
                      {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="vesper-empty-notifications">
              <CheckCircle size={32} className="vesper-text-emerald" />
              <p>No unread clinical notifications at this time.</p>
            </div>
          )}
        </div>

        <div className="vesper-modal__footer">
          <button
            type="button"
            className="vesper-btn-outline"
            style={{ width: "100%" }}
            onClick={onClose}
          >
            Close Feed
          </button>
        </div>
      </div>
    </div>
  );
}
