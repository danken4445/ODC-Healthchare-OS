import { SuperadminDashboard } from "../../../components/superadmin-dashboard";

export const metadata = {
  title: "Network Overview — Odyssey Healthcare OS",
  description: "Superadmin network health dashboard: active clinics, patient volume, claims pipeline, inventory risk, and cross-tenant activity.",
};

export default function SuperadminDashboardPage() {
  return <SuperadminDashboard />;
}
