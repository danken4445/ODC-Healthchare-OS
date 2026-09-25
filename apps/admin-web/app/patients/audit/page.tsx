"use client";

import { RecordsScreen } from "../../../components/records-screen";
import { auditConfig } from "../../../lib/admin-data";

export default function PatientAuditPage() { return <RecordsScreen config={auditConfig} />; }
