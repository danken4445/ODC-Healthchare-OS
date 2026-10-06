"use client";

import { getOrganizationFacilityContext } from "@odyssey/supabase-client";
import { useEffect, useState } from "react";
import { useAdminData } from "../../components/admin-data-context";
import { AdminSignIn } from "../../components/admin-sign-in";
import { NbbPharmacyPosTerminal } from "../../components/nbb-pharmacy-pos-terminal";
import { RecordsScreen } from "../../components/records-screen";
import { posConfig } from "../../lib/admin-data";

export default function PosPage() {
  const { client, email, loading: authLoading, organization } = useAdminData();
  const [facilityLoading, setFacilityLoading] = useState(true);
  const [isGovernmentNoBilling, setIsGovernmentNoBilling] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkFacility() {
      if (!organization?.id) {
        if (active) {
          setFacilityLoading(false);
          setIsGovernmentNoBilling(false);
        }
        return;
      }
      setFacilityLoading(true);
      const res = await getOrganizationFacilityContext(client, organization.id);
      if (active) {
        if (!res.error && res.data) {
          setIsGovernmentNoBilling(res.data.isGovernmentNoBilling);
        } else {
          setIsGovernmentNoBilling(false);
        }
        setFacilityLoading(false);
      }
    }
    void checkFacility();
    return () => {
      active = false;
    };
  }, [client, organization?.id]);

  if (!authLoading && !email) {
    return <AdminSignIn />;
  }

  if (facilityLoading) {
    return (
      <section className="data-loading" aria-live="polite" style={{ padding: "2rem", textAlign: "center" }}>
        Loading terminal configuration…
      </section>
    );
  }

  if (isGovernmentNoBilling && organization?.id) {
    return (
      <NbbPharmacyPosTerminal
        organizationId={organization.id}
        organizationName={organization.name}
      />
    );
  }

  return <RecordsScreen config={posConfig} />;
}
