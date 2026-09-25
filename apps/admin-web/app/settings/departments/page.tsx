"use client";

import { RecordsScreen } from "../../../components/records-screen";
import { departmentsConfig } from "../../../lib/admin-data";

export default function SettingsDepartmentsPage() {
  return <RecordsScreen config={departmentsConfig} />;
}
