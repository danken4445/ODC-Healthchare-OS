"use client";

import { RecordsScreen } from "../../components/records-screen";
import { patientsConfig } from "../../lib/admin-data";

export default function PatientsPage() { return <RecordsScreen actionHref="/patients/import" config={patientsConfig} />; }
