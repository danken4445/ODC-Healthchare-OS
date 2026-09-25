"use client";

import { RecordsScreen } from "../../components/records-screen";
import { departmentsConfig } from "../../lib/admin-data";

export default function DepartmentsPage() {
  return <RecordsScreen config={departmentsConfig} />;
}
