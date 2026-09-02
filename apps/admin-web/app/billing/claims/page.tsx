"use client";

import {
  createBrowserSupabaseClient,
  getClaimsWorkspace,
  submitClaim,
  adjudicateClaim,
  getPortalAccess,
  signInWithPassword,
  signOut,
  hasOrganizationPermission,
  getAccessibleOrganizations,
} from "@odyssey/supabase-client";
import type {
  ClaimSummary,
  PublicClinicSummary,
} from "@odyssey/types";
import {
  Button,
  DataTable,
  Field,
  Input,
  Badge,
  PayorTypeBadge,
  ClaimStatusBadge,
  CurrencyDisplay,
} from "@odyssey/ui";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ClaimsPage() {
  const [email, setEmail] = useState("admin@synthetic.odyssey.test");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [accessibleClinics, setAccessibleClinics] = useState<PublicClinicSummary[]>([]);
  const [canManageClaims, setCanManageClaims] = useState(false);
  const [status, setStatus] = useState("Sign in to access claims.");
  const [submitting, setSubmitting] = useState(false);

  const [claims, setClaims] = useState<ClaimSummary[]>([]);

  // Adjudication form
  const [adjClaimId, setAdjClaimId] = useState("");
  const [adjResult, setAdjResult] = useState<"approved" | "denied" | "partial">("approved");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");

  // Filter
  const [filterPayor, setFilterPayor] = useState<string>("all");

  async function checkSession() {
    const client = createBrowserSupabaseClient();
    const { data: { session } } = await client.auth.getSession();
    if (session?.user?.email) {
      setSignedInAs(session.user.email);
      const access = await getPortalAccess(client, "admin");
      if (access.data?.allowed) {
        const clinics = await getAccessibleOrganizations(client, access.data.organizationIds);
        if (clinics.data) {
          setAccessibleClinics(clinics.data);
          if (clinics.data.length > 0 && !organizationId) {
            setOrganizationId(clinics.data[0].id);
          }
        }
      }
    }
  }

  async function loadClaims() {
    if (!organizationId) return;
    const client = createBrowserSupabaseClient();
    const canClaim = await hasOrganizationPermission(client, organizationId, "can_manage_claims");
    setCanManageClaims(!!canClaim.data);

    const result = await getClaimsWorkspace(client, organizationId);
    if (result.data) setClaims(result.data);
    else setStatus(`Error: ${result.error?.message}`);
  }

  useEffect(() => { void checkSession(); }, []);
  useEffect(() => { if (organizationId) void loadClaims(); }, [organizationId]);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const client = createBrowserSupabaseClient();
    const result = await signInWithPassword(client, email, password);
    if (result.error) {
      setStatus(`Sign-in failed: ${result.error.message}`);
    } else {
      await checkSession();
      setStatus("Signed in. Loading claims data…");
    }
    setSubmitting(false);
  }

  async function handleSignOut() {
    const client = createBrowserSupabaseClient();
    await signOut(client);
    setSignedInAs(null);
    setOrganizationId(null);
    setClaims([]);
    setStatus("Signed out.");
  }

  async function handleSubmitClaim(claimId: string) {
    setSubmitting(true);
    const client = createBrowserSupabaseClient();
    const result = await submitClaim(client, claimId);
    if (result.error) {
      setStatus(`Error: ${result.error.message}`);
    } else {
      setStatus("Claim submitted.");
      await loadClaims();
    }
    setSubmitting(false);
  }

  async function handleAdjudicate(e: FormEvent) {
    e.preventDefault();
    if (!adjClaimId) return;
    setSubmitting(true);
    const client = createBrowserSupabaseClient();
    const result = await adjudicateClaim(
      client,
      adjClaimId,
      adjResult,
      adjAmount ? Number(adjAmount) : undefined,
      adjReason || undefined,
    );
    if (result.error) {
      setStatus(`Error: ${result.error.message}`);
    } else {
      setStatus("Adjudication recorded.");
      setAdjClaimId("");
      setAdjAmount("");
      setAdjReason("");
      await loadClaims();
    }
    setSubmitting(false);
  }

  const filteredClaims = claims.filter(
    (c) => filterPayor === "all" || c.payor_type === filterPayor,
  );

  if (!signedInAs) {
    return (
      <main>
        <p className="eyebrow">Odyssey Admin — Claims Management</p>
        <h1>Sign In</h1>
        <form onSubmit={handleSignIn}>
          <Field label="Email">
            <Input id="claims-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input id="claims-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" disabled={submitting}>Sign In</Button>
        </form>
        <p>{status}</p>
      </main>
    );
  }

  return (
    <main>
      <p className="eyebrow">Odyssey Admin — Claims Management</p>
      <h1>📋 HMO &amp; PhilHealth Claims</h1>
      <p>Signed in as <strong>{signedInAs}</strong> <Button size="sm" variant="ghost" onClick={handleSignOut}>Sign out</Button></p>

      {accessibleClinics.length > 1 && (
        <Field label="Select Clinic">
          <select
            id="claims-clinic-select"
            value={organizationId ?? ""}
            onChange={(e) => setOrganizationId(e.target.value)}
          >
            {accessibleClinics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      )}

      <nav style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
        <Link href="/billing"><Button variant="outline">💰 Billing Dashboard</Button></Link>
        <Link href="/pos"><Button variant="outline">🛒 Point of Sale</Button></Link>
        <Link href="/"><Button variant="ghost">← Dashboard</Button></Link>
      </nav>

      <p>{status}</p>

      <Field label="Filter by Payor">
        <select
          id="claims-filter-payor"
          value={filterPayor}
          onChange={(e) => setFilterPayor(e.target.value)}
        >
          <option value="all">All</option>
          <option value="hmo">HMO</option>
          <option value="philhealth_nbb">PhilHealth NBB</option>
          <option value="government_subsidized">Government Subsidized</option>
        </select>
      </Field>

      <h2>Claims ({filteredClaims.length})</h2>
      <DataTable<ClaimSummary>
        caption="Claims list"
        data={filteredClaims}
        getRowId={(row) => row.id}
        columns={[
          { id: "patient", header: "Patient", cell: (r) => r.patient_name },
          { id: "payor", header: "Payor", cell: (r) => r.payor_type ? <PayorTypeBadge payorType={r.payor_type} /> : <Badge variant="muted">{r.claim_type}</Badge> },
          { id: "total", header: "Total", cell: (r) => <CurrencyDisplay amount={r.total} /> },
          { id: "status", header: "Status", cell: (r) => <ClaimStatusBadge status={r.status} /> },
          { id: "submitted", header: "Submitted", cell: (r) => formatTime(r.submitted_at) },
          { id: "adjResult", header: "Result", cell: (r) =>
            r.adjudication_result
              ? <Badge variant={r.adjudication_result === "approved" ? "success" : r.adjudication_result === "denied" ? "danger" : "warning"}>
                  {r.adjudication_result}
                </Badge>
              : "—"
          },
          { id: "approved", header: "Approved", cell: (r) => r.approved_amount != null ? <CurrencyDisplay amount={r.approved_amount} /> : "—" },
          {
            id: "actions",
            header: "Actions",
            cell: (r) => canManageClaims ? (
              <span style={{ display: "flex", gap: "0.5rem" }}>
                {r.status === "active" && !r.submitted_at && (
                  <Button size="sm" disabled={submitting} onClick={() => handleSubmitClaim(r.id)}>Submit</Button>
                )}
                {r.submitted_at && !r.adjudicated_at && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setAdjClaimId(r.id); setAdjAmount(String(r.total ?? "")); }}
                  >
                    Adjudicate
                  </Button>
                )}
              </span>
            ) : null,
          },
        ]}
        emptyMessage="No claims found."
      />

      {adjClaimId && canManageClaims && (
        <>
          <h2>Adjudicate Claim</h2>
          <form onSubmit={handleAdjudicate} style={{ display: "grid", gap: "1rem", maxWidth: "30rem" }}>
            <Field label="Claim ID">
              <Input id="adj-claim-id" value={adjClaimId} readOnly />
            </Field>
            <Field label="Result">
              <select
                id="adj-result"
                value={adjResult}
                onChange={(e) => setAdjResult(e.target.value as "approved" | "denied" | "partial")}
              >
                <option value="approved">Approved</option>
                <option value="denied">Denied</option>
                <option value="partial">Partial</option>
              </select>
            </Field>
            <Field label="Approved Amount (₱)">
              <Input
                id="adj-amount"
                type="number"
                step="0.01"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
              />
            </Field>
            <Field label="Denied Reason">
              <Input
                id="adj-reason"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="Required if denied"
              />
            </Field>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button type="submit" disabled={submitting}>Record Adjudication</Button>
              <Button variant="ghost" onClick={() => setAdjClaimId("")}>Cancel</Button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
