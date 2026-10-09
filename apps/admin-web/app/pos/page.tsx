"use client";

import { getOrganizationFacilityContext } from "@odyssey/supabase-client";
import { useEffect, useState } from "react";
import { useAdminData } from "../../components/admin-data-context";
import { AdminSignIn } from "../../components/admin-sign-in";
import { NbbPharmacyPosTerminal } from "../../components/nbb-pharmacy-pos-terminal";
import { PharmacyPrescriptionEncoder } from "../../components/pharmacy-prescription-encoder";
import { PharmacyPrescriptionQueue } from "../../components/pharmacy-prescription-queue";
import { RecordsScreen } from "../../components/records-screen";
import { posConfig } from "../../lib/admin-data";
import { shouldShowLegacyPharmacyPos } from "../../lib/pharmacy-pos-access";

export default function PosPage() {
  const { client, email, loading: authLoading, organization, permissions } = useAdminData();
  const [facilityLoading, setFacilityLoading] = useState(true);
  const [isGovernmentNoBilling, setIsGovernmentNoBilling] = useState(false);
  const canManageLegacyPos = shouldShowLegacyPharmacyPos(permissions);

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
      <>
        {permissions.includes("can_encode_pharmacy_prescriptions") && <PharmacyPrescriptionEncoder />}
        {permissions.includes("can_dispense_pharmacy_prescriptions") && (
          <PharmacyPrescriptionQueue organizationId={organization.id} />
        )}
        {canManageLegacyPos && (
          <NbbPharmacyPosTerminal
            organizationId={organization.id}
            organizationName={organization.name}
          />
        )}
      </>
    );
  }

  return (
    <>
      {organization?.id && permissions.includes("can_encode_pharmacy_prescriptions") && <PharmacyPrescriptionEncoder />}
      {organization?.id && permissions.includes("can_dispense_pharmacy_prescriptions") && (
        <PharmacyPrescriptionQueue organizationId={organization.id} />
      )}
      {canManageLegacyPos && <RecordsScreen config={posConfig} />}
    </>
  );
}
