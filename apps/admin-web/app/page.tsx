"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminData } from "../components/admin-data-context";
import { VesperDashboard } from "../components/vesper-dashboard";

export default function DashboardPage() {
  const { isSuperadmin, loading } = useAdminData();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isSuperadmin) {
      router.replace("/superadmin/clinics");
    }
  }, [isSuperadmin, loading, router]);

  if (!loading && isSuperadmin) {
    return (
      <div className="route-loading" aria-live="polite">
        <span className="loading-spinner" aria-hidden="true" />
        Opening Clinics Directory…
      </div>
    );
  }

  return <VesperDashboard />;
}

