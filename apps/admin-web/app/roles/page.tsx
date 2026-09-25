"use client";

import { RecordsScreen } from "../../components/records-screen";
import { rolesConfig } from "../../lib/admin-data";

export default function RolesPage() {
  return <RecordsScreen config={rolesConfig} />;
}
