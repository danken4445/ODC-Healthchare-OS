"use client";

import { HelpCircle, Mail, Phone, ShieldCheck, LifeBuoy, FileQuestion } from "lucide-react";
import React from "react";
import { useAdminData } from "../../components/admin-data-context";

export default function SupportPage() {
  const { organization } = useAdminData();

  return (
    <div className="vesper-page-container">
      <div className="vesper-header-row">
        <div>
          <h1 className="vesper-h1">Support & Governance</h1>
          <p className="vesper-header-subcopy">
            System assistance, compliance guidance, and platform operations for {organization?.name ?? "Odyssey"}.
          </p>
        </div>
      </div>

      <div className="vesper-widget-row" style={{ marginTop: "24px" }}>
        <div className="vesper-card">
          <div className="vesper-card__header">
            <div>
              <h2 className="vesper-card__title">Clinic Technical Support</h2>
              <p className="vesper-card__subtitle">24/7 dedicated support channels</p>
            </div>
          </div>
          <div style={{ padding: "8px 0" }}>
            <div className="vesper-contact-list">
              <div className="vesper-contact-item">
                <Mail size={16} className="vesper-text-blue" />
                <span>support@odysseyhealth.ph</span>
              </div>
              <div className="vesper-contact-item">
                <Phone size={16} className="vesper-text-blue" />
                <span>+63 (2) 8888-ODYSSEY</span>
              </div>
              <div className="vesper-contact-item">
                <ShieldCheck size={16} className="vesper-text-emerald" />
                <span>DOH, PhilHealth, & HIPAA Compliant Data Infrastructure</span>
              </div>
            </div>
          </div>
        </div>

        <div className="vesper-card">
          <div className="vesper-card__header">
            <div>
              <h2 className="vesper-card__title">Audit & Compliance</h2>
              <p className="vesper-card__subtitle">Immutable records and governance access</p>
            </div>
          </div>
          <div style={{ padding: "8px 0" }}>
            <p style={{ color: "#64748B", fontSize: "13px", lineHeight: "1.6" }}>
              Every clinical action, patient chart access, prescription issuance, and HMO submission is
              cryptographically logged and traceable according to Philippine digital healthcare regulations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
