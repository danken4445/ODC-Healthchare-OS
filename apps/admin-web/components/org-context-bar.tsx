"use client";

import { Building2, ChevronRight, Globe2, LockKeyhole, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAdminData } from "./admin-data-context";
import { AppointmentNotificationControl } from "@odyssey/ui";

export function OrgContextBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { email, organization, organizations, selectOrganization, signOut } = useAdminData();
  const scopedClinicDetail = pathname.startsWith("/superadmin/clinics/") && pathname !== "/superadmin/clinics/new";
  const networkWide = pathname.startsWith("/superadmin") && !scopedClinicDetail;

  const handleLogOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <div className="org-context" role="status" aria-label="Current organization context">
      <div className="org-context__scope">
        <span className="org-context__label"><LockKeyhole aria-hidden="true" size={14} /> Access scope</span>
        <span className="org-context__value">
          {networkWide ? (
            <><Globe2 aria-hidden="true" size={15} /> Platform (all organizations)</>
          ) : (
            <><Globe2 aria-hidden="true" size={15} /> Platform <ChevronRight aria-hidden="true" size={14} /> <Building2 aria-hidden="true" size={15} />
              {organizations.length > 1 ? <select aria-label="Current organization" className="org-selector" value={organization?.id ?? ""} onChange={(event) => selectOrganization(event.target.value)}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <span>{organization?.name ?? "No organization selected"}</span>}
            </>
          )}
        </span>
      </div>
      {email ? (
        <div className="org-context__actions" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <AppointmentNotificationControl />
          <button
            className="org-context__logout-button"
            type="button"
            onClick={() => void handleLogOut()}
            title="Log out of administration portal"
            aria-label="Log out"
          >
            <LogOut aria-hidden="true" size={13} />
            <span>Log out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
