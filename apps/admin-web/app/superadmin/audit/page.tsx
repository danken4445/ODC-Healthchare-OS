"use client";

import { RecordsScreen } from "../../../components/records-screen";
import { globalAuditConfig } from "../../../lib/admin-data";

export default function GlobalAuditPage() { return <RecordsScreen config={globalAuditConfig} />; }
