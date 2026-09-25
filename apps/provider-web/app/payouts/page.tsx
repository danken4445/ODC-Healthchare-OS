"use client";

import {
  createBrowserSupabaseClient,
  getDoctorPayouts,
  getPortalAccess,
  signOut,
} from "@odyssey/supabase-client";
import type { DoctorPayoutSummary } from "@odyssey/types";
import { Badge, Button, CurrencyDisplay, DataTable } from "@odyssey/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function ProviderPayoutsPage() {
  const [payouts, setPayouts] = useState<DoctorPayoutSummary[]>([]);
  const [status, setStatus] = useState("Loading your payout ledger…");
  const pending = useMemo(() => payouts.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.payout_amount, 0), [payouts]);
  const paid = useMemo(() => payouts.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.payout_amount, 0), [payouts]);

  async function handleSignOut() {
    await signOut(createBrowserSupabaseClient());
    window.location.href = "/";
  }

  useEffect(() => {
    async function load() {
      const client = createBrowserSupabaseClient();
      const access = await getPortalAccess(client, "provider");
      const clinicId = access.data?.organizationIds[0];
      if (access.error || !access.data?.allowed || !clinicId) {
        await signOut(client);
        setStatus("Sign in through the provider workspace to view payouts.");
        return;
      }
      const result = await getDoctorPayouts(client, clinicId);
      if (result.error) return setStatus(`Unable to load payouts: ${result.error.message}`);
      setPayouts(result.data);
      setStatus("Payout amounts are based on finalized service charges for completed encounters.");
    }
    void load();
  }, []);

  return (
    <main>
      <p className="eyebrow">Provider workspace · Remote care</p>
      <h1>My doctor payouts</h1>
      <nav className="session-actions">
        <Link href="/">← Queue</Link>
        <Link href="/teleconsult">Meeting rooms</Link>
        <Button size="sm" variant="ghost" onClick={() => void handleSignOut()} aria-label="Log out" title="Log out">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: "middle" }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log out
        </Button>
      </nav>
      <p role="status">{status}</p>
      <div className="two-column">
        <section><span className="hint">Pending</span><h2><CurrencyDisplay amount={pending} /></h2></section>
        <section><span className="hint">Paid</span><h2><CurrencyDisplay amount={paid} /></h2></section>
      </div>
      <DataTable
        caption="Your tenant-scoped payout entitlement ledger."
        data={payouts}
        emptyMessage="No completed, finalized encounters have generated a payout yet."
        getRowId={(item) => item.id}
        columns={[
          { id: "finished", header: "Encounter finished", cell: (item) => item.encounter_finished_at ? new Date(item.encounter_finished_at).toLocaleString() : "—" },
          { id: "mode", header: "Mode", cell: (item) => item.delivery_mode === "virtual" ? "Virtual" : "Clinic" },
          { id: "service", header: "Service", cell: (item) => item.service_type ?? "Consultation" },
          { id: "gross", header: "Service fees", cell: (item) => <CurrencyDisplay amount={item.gross_service_amount} currency={item.currency} /> },
          { id: "share", header: "Share", cell: (item) => `${(item.share_basis_points / 100).toFixed(2)}%` },
          { id: "payout", header: "Payout", cell: (item) => <CurrencyDisplay amount={item.payout_amount} currency={item.currency} /> },
          { id: "status", header: "Status", cell: (item) => <Badge variant={item.status === "paid" ? "success" : item.status === "void" ? "muted" : "warning"}>{item.status}</Badge> },
        ]}
      />
    </main>
  );
}
