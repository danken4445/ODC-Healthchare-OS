"use client";

import { getOrganizationModules, getStaffAdministration } from "@odyssey/supabase-client";
import type { Json, OrganizationModule } from "@odyssey/types";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminSignIn } from "../../../../components/admin-sign-in";
import { useAdminData } from "../../../../components/admin-data-context";
import { PageHeader } from "../../../../components/page-header";
import { StatusBadge } from "../../../../components/status-badge";
import { Tabs, TabsContent } from "../../../../components/ui/tabs";

interface ClinicRecord {
  active: boolean;
  address: Json;
  created_at: string;
  id: string;
  identifier: Json;
  name: string;
  updated_at: string;
}

interface AdminRecord { active: boolean; displayName: string; email: string | null; roleCode: string; }

function jsonValue(value: Json, key: string) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) && typeof candidate[key] === "string" ? candidate[key] : null;
}

export default function ClinicDetailPage() {
  const params = useParams<{ id: string }>();
  const { client, email, error: accessError, isSuperadmin } = useAdminData();
  const [clinic, setClinic] = useState<ClinicRecord | null>(null);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [modules, setModules] = useState<OrganizationModule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    async function load() {
      if (!email || !isSuperadmin) return;
      setLoading(true);
      const [clinicResult, staffResult, moduleResult] = await Promise.all([
        client.from("organizations").select("id, name, active, identifier, address, created_at, updated_at").eq("id", params.id).single(),
        getStaffAdministration(client, params.id),
        getOrganizationModules(client, params.id),
      ]);
      const failure = clinicResult.error ?? staffResult.error ?? moduleResult.error;
      if (!current) return;
      if (failure || !clinicResult.data || !staffResult.data || !moduleResult.data) {
        setError(failure?.message ?? "The organization record could not be loaded.");
      } else {
        setClinic(clinicResult.data);
        setAdmins(staffResult.data.staff.filter((member) => ["owner", "admin"].includes(member.roleCode)));
        setModules(moduleResult.data);
        setError(null);
      }
      setLoading(false);
    }
    void load();
    return () => { current = false; };
  }, [client, email, isSuperadmin, params.id]);

  if (!email && accessError) return <AdminSignIn />;
  if (email && !isSuperadmin) return <section className="data-error" role="alert">Platform administrator access is required to view this organization.</section>;
  if (loading) return <section className="data-loading">Loading organization record...</section>;
  if (error || !clinic) return <section className="data-error" role="alert"><strong>Organization record could not be loaded.</strong><p>{error}</p></section>;

  return (
    <>
      <PageHeader eyebrow="Platform oversight" title={clinic.name} description="Organization profile, accountable administrators, and active platform controls." />
      <Tabs defaultValue="overview" items={[{ label: "Overview", value: "overview" }, { label: "Administrators", value: "admins" }, { label: "Feature flags", value: "flags" }]}>
        <TabsContent value="overview"><dl className="review-list"><div><dt>Organization ID</dt><dd>{clinic.id}</dd></div><div><dt>Operational state</dt><dd><StatusBadge label={clinic.active ? "Active" : "Disabled"} /></dd></div><div><dt>Organization code</dt><dd>{jsonValue(clinic.identifier, "value") ?? "Not configured"}</dd></div><div><dt>Registered address</dt><dd>{jsonValue(clinic.address, "text") ?? "Not configured"}</dd></div><div><dt>Created</dt><dd>{new Date(clinic.created_at).toLocaleString("en-PH")}</dd></div><div><dt>Last updated</dt><dd>{new Date(clinic.updated_at).toLocaleString("en-PH")}</dd></div></dl></TabsContent>
        <TabsContent value="admins">{admins.length ? <dl className="review-list">{admins.map((admin) => <div key={`${admin.email}-${admin.roleCode}`}><dt>{admin.roleCode.replaceAll("_", " ")}</dt><dd>{admin.displayName}<br /><small>{admin.email ?? "No email available"} - {admin.active ? "Active" : "Disabled"}</small></dd></div>)}</dl> : <p className="data-loading">No clinic administrators are assigned.</p>}</TabsContent>
        <TabsContent value="flags">{modules.length ? <dl className="review-list">{modules.map((module) => <div key={module.id}><dt>{module.moduleKey.replaceAll("_", " ")}</dt><dd><StatusBadge label={module.enabled ? "Enabled" : "Disabled"} /></dd></div>)}</dl> : <p className="data-loading">No module controls are configured.</p>}</TabsContent>
      </Tabs>
    </>
  );
}
