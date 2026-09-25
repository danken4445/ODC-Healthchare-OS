"use client";

import { RecordsScreen } from "../../components/records-screen";
import { appointmentsConfig } from "../../lib/admin-data";

export default function AppointmentsPage() { return <RecordsScreen config={appointmentsConfig} />; }
