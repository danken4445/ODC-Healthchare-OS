"use client";

import { setClinicUserActive, setOrganizationModule } from "@odyssey/supabase-client";
import type { OrganizationModuleKey } from "@odyssey/types";
import { useState } from "react";
import { useAdminData } from "./admin-data-context";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

type ConfirmationActionProps = {
  action: string;
  enabled: boolean;
  identifier: string;
  operation: "feature" | "staff";
  subject: string;
};

export function ConfirmationAction({ action, enabled, identifier, operation, subject }: ConfirmationActionProps) {
  const { client, organization } = useAdminData();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!organization) return;
    setSaving(true);
    setError(null);
    const result = operation === "feature"
      ? await setOrganizationModule(client, organization.id, identifier as OrganizationModuleKey, !enabled)
      : await setClinicUserActive(client, organization.id, identifier, !enabled);
    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }
    setOpen(false);
    window.location.reload();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>{action}</Button>
      <Dialog open={open} onOpenChange={setOpen} title={`Confirm ${action.toLowerCase()}`} description="This change is persisted immediately and written to the administrative audit log.">
        <div className="dialog-body">
          <div className="confirmation-summary"><span>Account or resource</span><strong>{subject}</strong></div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={confirm}>{saving ? "Saving..." : "Confirm and record"}</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
