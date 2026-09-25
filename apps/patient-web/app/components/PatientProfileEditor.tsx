"use client";

import { useState, useId, type FormEvent, useEffect } from "react";
import type { PatientSummary, CoverageSummary } from "@odyssey/types";
import { Button, Field, Input, Select, PatientQrCode } from "@odyssey/ui";
import { updateOwnPatientProfile, createBrowserSupabaseClient, createPatientQrPayload } from "@odyssey/supabase-client";

interface PatientProfileEditorProps {
  patient: PatientSummary;
  activeCoverage?: CoverageSummary | null;
  organizationId?: string | null;
  signedInAs?: string | null;
  onProfileUpdated: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
}

function formatPayor(payor: unknown): string {
  if (typeof payor === "string" && payor.trim()) return payor.trim();
  if (payor && typeof payor === "object") {
    const rec = payor as Record<string, unknown>;
    for (const key of ["name", "display", "text", "value"]) {
      if (typeof rec[key] === "string" && rec[key].trim()) return rec[key].trim();
    }
  }
  return "";
}

function extractTelecom(telecomList: unknown, system: "phone" | "email"): string {
  if (!Array.isArray(telecomList)) return "";
  for (const item of telecomList) {
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      if (rec.system === system && typeof rec.value === "string") {
        return rec.value;
      }
    }
  }
  // Fallback for phone if first item has no explicit system
  if (system === "phone" && telecomList.length > 0 && typeof telecomList[0] === "object") {
    const first = telecomList[0] as Record<string, unknown>;
    if (typeof first?.value === "string" && !first?.system) {
      return first.value;
    }
  }
  return "";
}

function extractAddress(addressList: unknown): string {
  if (!Array.isArray(addressList) || addressList.length === 0) return "";
  const first = addressList[0];
  if (!first || typeof first !== "object") return "";
  const rec = first as Record<string, unknown>;
  if (typeof rec.text === "string" && rec.text.trim()) return rec.text.trim();
  if (Array.isArray(rec.line)) {
    return rec.line.filter((l) => typeof l === "string" && l.trim()).join(", ");
  }
  return "";
}

function extractContact(contactList: unknown): {
  name: string;
  phone: string;
  relationship: string;
} {
  if (!Array.isArray(contactList) || contactList.length === 0) {
    return { name: "", phone: "", relationship: "" };
  }
  const first = contactList[0];
  if (!first || typeof first !== "object") {
    return { name: "", phone: "", relationship: "" };
  }
  const rec = first as Record<string, unknown>;
  let phone = "";
  if (Array.isArray(rec.telecom) && rec.telecom.length > 0 && typeof rec.telecom[0] === "object") {
    const tel = rec.telecom[0] as Record<string, unknown>;
    if (typeof tel.value === "string") phone = tel.value;
  } else if (typeof rec.phone === "string") {
    phone = rec.phone;
  }
  return {
    name: typeof rec.name === "string" ? rec.name : "",
    phone,
    relationship: typeof rec.relationship === "string" ? rec.relationship : "",
  };
}

function calculateAge(birthDate?: string | null): string {
  if (!birthDate) return "Age not recorded";
  const bday = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(bday.getTime())) return "Age not recorded";
  const now = new Date();
  let age = now.getFullYear() - bday.getFullYear();
  if (
    now.getMonth() < bday.getMonth() ||
    (now.getMonth() === bday.getMonth() && now.getDate() < bday.getDate())
  ) {
    age -= 1;
  }
  return `${age} years old`;
}

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "PT"
  );
}

export function PatientProfileEditor({
  patient,
  activeCoverage,
  organizationId,
  signedInAs,
  onProfileUpdated,
  onSignOut,
}: PatientProfileEditorProps) {
  const formId = useId();

  // Extract initial fields from patient summary
  const initialPhone = extractTelecom(patient.telecom, "phone");
  const initialEmail = extractTelecom(patient.telecom, "email");
  const initialAddress = extractAddress(patient.address);
  const initialEmergency = extractContact(patient.contact);

  const [displayName, setDisplayName] = useState(patient.displayName || "");
  const [birthDate, setBirthDate] = useState(patient.birth_date || "");
  const [gender, setGender] = useState(patient.gender || "");
  const [bloodType, setBloodType] = useState(patient.blood_type || "");
  const [photoUrl, setPhotoUrl] = useState(patient.photo_url || "");
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);
  const [address, setAddress] = useState(initialAddress);
  const [emergencyName, setEmergencyName] = useState(initialEmergency.name);
  const [emergencyPhone, setEmergencyPhone] = useState(initialEmergency.phone);
  const [emergencyRelationship, setEmergencyRelationship] = useState(initialEmergency.relationship);

  const [photoError, setPhotoError] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Sync state if patient prop updates from outside
  useEffect(() => {
    setDisplayName(patient.displayName || "");
    setBirthDate(patient.birth_date || "");
    setGender(patient.gender || "");
    setBloodType(patient.blood_type || "");
    setPhotoUrl(patient.photo_url || "");
    setPhone(extractTelecom(patient.telecom, "phone"));
    setEmail(extractTelecom(patient.telecom, "email"));
    setAddress(extractAddress(patient.address));
    const em = extractContact(patient.contact);
    setEmergencyName(em.name);
    setEmergencyPhone(em.phone);
    setEmergencyRelationship(em.relationship);
    setPhotoError(false);
  }, [patient]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFeedback(null);

    if (!displayName.trim()) {
      setFeedback({ type: "error", message: "Patient full name is required." });
      return;
    }
    if (!phone.trim()) {
      setFeedback({ type: "error", message: "Primary phone number is required." });
      return;
    }
    if (!address.trim()) {
      setFeedback({ type: "error", message: "Residential address is required." });
      return;
    }

    setIsSaving(true);
    try {
      const client = createBrowserSupabaseClient();
      const result = await updateOwnPatientProfile(client, {
        patientId: patient.id,
        displayName: displayName.trim(),
        birthDate: birthDate || null,
        gender: (gender || null) as "female" | "male" | "other" | "unknown" | null,
        bloodType: (bloodType || null) as
          | "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | null,
        photoUrl: photoUrl.trim() || null,
        phone: phone.trim(),
        email: email.trim() || null,
        address: address.trim(),
        emergencyContactName: emergencyName.trim() || null,
        emergencyContactPhone: emergencyPhone.trim() || null,
        emergencyContactRelationship: emergencyRelationship.trim() || null,
      });

      if (result.error) {
        setFeedback({
          type: "error",
          message: `Unable to save profile: ${result.error.message}`,
        });
      } else {
        setFeedback({
          type: "success",
          message: "Your profile information has been successfully updated and synced across all clinics.",
        });
        await onProfileUpdated();
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: `An unexpected error occurred: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset() {
    setDisplayName(patient.displayName || "");
    setBirthDate(patient.birth_date || "");
    setGender(patient.gender || "");
    setBloodType(patient.blood_type || "");
    setPhotoUrl(patient.photo_url || "");
    setPhone(initialPhone);
    setEmail(initialEmail);
    setAddress(initialAddress);
    setEmergencyName(initialEmergency.name);
    setEmergencyPhone(initialEmergency.phone);
    setEmergencyRelationship(initialEmergency.relationship);
    setFeedback(null);
    setPhotoError(false);
  }

  const qrPayload = organizationId
    ? createPatientQrPayload(organizationId, patient.id)
    : patient.id;

  return (
    <div className="patient-profile-wrapper">
      {/* Identity Card Banner */}
      <div className="patient-profile-hero-card">
        <div className="patient-profile-hero-main">
          <div className="patient-avatar-frame">
            {photoUrl && !photoError ? (
              <img
                src={photoUrl}
                alt={displayName}
                className="patient-avatar-image"
                onError={() => setPhotoError(true)}
              />
            ) : (
              <div className="patient-avatar-fallback">
                {getInitials(displayName)}
              </div>
            )}
            <span
              className="patient-avatar-status-dot"
              title="Verified Patient Account"
            />
          </div>

          <div className="patient-profile-hero-info">
            <div className="patient-profile-title-row">
              <h2 className="patient-profile-name">{displayName || "Patient Name"}</h2>
              <div className="patient-profile-badges">
                {bloodType ? (
                  <span className="profile-pill-badge profile-pill-badge--blood">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
                      <path d="M12 21.5c-4.4 0-8-3.6-8-8 0-4.8 6.5-11.7 7.4-12.7.3-.3.9-.3 1.2 0 .9 1 7.4 7.9 7.4 12.7 0 4.4-3.6 8-8 8z" />
                    </svg>
                    Blood: {bloodType}
                  </span>
                ) : (
                  <span className="profile-pill-badge profile-pill-badge--neutral">
                    Blood Type: Not set
                  </span>
                )}
                {gender && (
                  <span className="profile-pill-badge profile-pill-badge--gender">
                    {gender.charAt(0).toUpperCase() + gender.slice(1)}
                  </span>
                )}
                <span className="profile-pill-badge profile-pill-badge--verified">
                  Verified Patient
                </span>
              </div>
            </div>

            <p className="patient-profile-subtext">
              <span>{calculateAge(birthDate)}</span>
              {birthDate && <span> · Born {new Date(`${birthDate}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "long" })}</span>}
              {phone && <span> · 📞 {phone}</span>}
            </p>
          </div>
        </div>

        <div className="patient-profile-hero-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowQrModal(true)}
            className="patient-profile-qr-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            Show Clinic QR Pass
          </Button>
        </div>
      </div>

      {/* QR Modal Overlay */}
      {showQrModal && (
        <div className="teleconsult-drawer-backdrop" onClick={() => setShowQrModal(false)}>
          <div className="teleconsult-drawer" style={{ maxWidth: "24rem" }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Clinic Check-in QR Pass</h3>
              <Button size="sm" variant="ghost" onClick={() => setShowQrModal(false)}>✕</Button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem 0" }}>
              <PatientQrCode payload={qrPayload} size={180} />
              <p style={{ marginTop: "1rem", fontWeight: 600, fontSize: "1.1rem" }}>{displayName}</p>
              <p className="hint" style={{ textAlign: "center", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                Present this digital QR code at any clinic reception kiosk or desk to instantly verify your identity and check in.
              </p>
            </div>
            <Button style={{ width: "100%" }} onClick={() => setShowQrModal(false)}>Done</Button>
          </div>
        </div>
      )}

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`profile-feedback-alert profile-feedback-alert--${feedback.type}`}
          role="alert"
        >
          <div className="profile-feedback-icon">
            {feedback.type === "success" ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
          <div className="profile-feedback-text">
            <strong>{feedback.type === "success" ? "Changes Saved" : "Action Required"}</strong>
            <p>{feedback.message}</p>
          </div>
          <button
            type="button"
            className="profile-feedback-close"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Form */}
      <form id={formId} onSubmit={handleSubmit} className="patient-profile-form">
        {/* Card 1: Personal & Demographics */}
        <section className="profile-card-section" aria-labelledby="personal-heading">
          <div className="profile-card-header">
            <div className="profile-card-icon-bubble">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <h3 id="personal-heading">Personal & Clinical Details</h3>
              <p className="hint">Required for clinical encounters, triage, prescription records, and doctor appointments.</p>
            </div>
          </div>

          <div className="profile-inputs-grid">
            <div className="profile-field-col-span-2">
              <Field label="Full Legal / Preferred Name">
                <Input
                  name="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Maria Santos Dela Cruz"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </Field>
            </div>

            <Field label="Date of Birth">
              <Input
                name="birthDate"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
              />
            </Field>

            <Field label="Biological Gender">
              <Select
                name="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </Select>
            </Field>

            <Field label="Blood Type">
              <Select
                name="bloodType"
                value={bloodType}
                onChange={(e) => setBloodType(e.target.value)}
              >
                <option value="">Select blood type</option>
                <option value="A+">A+ (A Positive)</option>
                <option value="A-">A- (A Negative)</option>
                <option value="B+">B+ (B Positive)</option>
                <option value="B-">B- (B Negative)</option>
                <option value="AB+">AB+ (AB Positive)</option>
                <option value="AB-">AB- (AB Negative)</option>
                <option value="O+">O+ (O Positive)</option>
                <option value="O-">O- (O Negative)</option>
              </Select>
            </Field>

            <div className="profile-field-col-span-2">
              <Field label="Profile Avatar / Photo URL">
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <Input
                    name="photoUrl"
                    type="url"
                    value={photoUrl}
                    onChange={(e) => {
                      setPhotoUrl(e.target.value);
                      setPhotoError(false);
                    }}
                    placeholder="https://example.com/avatar.jpg"
                    style={{ flex: 1 }}
                  />
                  {photoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPhotoUrl("");
                        setPhotoError(false);
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </Field>
            </div>
          </div>
        </section>

        {/* Card 2: Contact Information */}
        <section className="profile-card-section" aria-labelledby="contact-heading">
          <div className="profile-card-header">
            <div className="profile-card-icon-bubble">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <div>
              <h3 id="contact-heading">Contact & Address</h3>
              <p className="hint">Used for appointment SMS updates, virtual video teleconsultation links, and billing notices.</p>
            </div>
          </div>

          <div className="profile-inputs-grid">
            <Field label="Mobile Phone Number (Required)">
              <Input
                name="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+63 912 345 6789"
                maxLength={40}
                required
              />
            </Field>

            <Field label="Email Address">
              <Input
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                maxLength={120}
              />
            </Field>

            <div className="profile-field-col-span-2">
              <Field label="Complete Residential Address (Required)">
                <Input
                  name="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Unit, Street, Barangay, City, Province, Postal Code"
                  maxLength={500}
                  required
                />
              </Field>
            </div>
          </div>
        </section>

        {/* Card 3: Emergency Contact */}
        <section className="profile-card-section" aria-labelledby="emergency-heading">
          <div className="profile-card-header">
            <div className="profile-card-icon-bubble" style={{ color: "#d97706", backgroundColor: "#fef3c7" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h3 id="emergency-heading">Emergency Contact</h3>
              <p className="hint">In case of acute medical emergencies or clinic urgent care escalations.</p>
            </div>
          </div>

          <div className="profile-inputs-grid">
            <Field label="Emergency Contact Full Name">
              <Input
                name="emergencyContactName"
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                placeholder="e.g. Juan Dela Cruz"
                maxLength={120}
              />
            </Field>

            <Field label="Relationship to Patient">
              <Select
                name="emergencyContactRelationship"
                value={emergencyRelationship}
                onChange={(e) => setEmergencyRelationship(e.target.value)}
              >
                <option value="">Select relationship</option>
                <option value="Spouse">Spouse / Partner</option>
                <option value="Parent">Parent / Guardian</option>
                <option value="Child">Child (Son/Daughter)</option>
                <option value="Sibling">Sibling (Brother/Sister)</option>
                <option value="Relative">Relative</option>
                <option value="Friend">Friend / Colleague</option>
                <option value="Other">Other</option>
              </Select>
            </Field>

            <div className="profile-field-col-span-2">
              <Field label="Emergency Contact Phone Number">
                <Input
                  name="emergencyContactPhone"
                  type="tel"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="+63 998 765 4321"
                  maxLength={40}
                />
              </Field>
            </div>
          </div>
        </section>

        {/* Card 4: Insurance & Clinic Health ID Info */}
        <section className="profile-card-section profile-card-section--readonly" aria-labelledby="insurance-heading">
          <div className="profile-card-header">
            <div className="profile-card-icon-bubble" style={{ color: "#2563eb", backgroundColor: "#dbeafe" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <div>
              <h3 id="insurance-heading">Insurance & Healthcare ID</h3>
              <p className="hint">Managed and verified by your registered healthcare provider.</p>
            </div>
          </div>

          <div className="profile-summary-grid">
            <div className="profile-summary-item">
              <span className="profile-summary-label">Primary HMO / Insurance</span>
              <strong className="profile-summary-val">
                {formatPayor(activeCoverage?.payor) || (activeCoverage?.coverage_type ? activeCoverage.coverage_type.replaceAll("_", " ") : "None on file")}
              </strong>
            </div>

            <div className="profile-summary-item">
              <span className="profile-summary-label">Policy / Subscriber No.</span>
              <strong className="profile-summary-val">
                {activeCoverage?.subscriber_id || "Not specified"}
              </strong>
            </div>

            <div className="profile-summary-item">
              <span className="profile-summary-label">Coverage Status</span>
              <strong className="profile-summary-val">
                {activeCoverage?.status ? activeCoverage.status.toUpperCase() : "Inactive / None"}
              </strong>
            </div>
          </div>

          <p className="profile-insurance-note">
            💡 <em>Need to link your PhilHealth or corporate HMO card? Please present your member card or letter of authorization (LOA) to the clinic front desk or doctor during your appointment.</em>
          </p>
        </section>

        {/* Action Bottom Bar */}
        <div className="patient-profile-actions-bar">
          <div className="patient-profile-actions-left">
            <Button
              type="submit"
              disabled={isSaving}
              className="patient-save-button"
            >
              {isSaving ? (
                <>
                  <span className="spinner-inline" /> Saving changes...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Save Profile Changes
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={handleReset}
            >
              Reset
            </Button>
          </div>

          <div className="patient-profile-session-info">
            <span className="hint">Session: {signedInAs}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSignOut}
              aria-label="Sign out"
              style={{ color: "var(--destructive, #dc2626)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
