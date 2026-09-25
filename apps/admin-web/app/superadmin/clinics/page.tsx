"use client";

import { RecordsScreen } from "../../../components/records-screen";
import { clinicsConfig } from "../../../lib/admin-data";

export default function ClinicsPage() { return <RecordsScreen actionHref="/superadmin/clinics/new" config={clinicsConfig} />; }
