"use client";

import { createClinicAccount, setOrganizationModule } from "@odyssey/supabase-client";
import type { OrganizationModuleKey } from "@odyssey/types";
import { Building2, Check, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminSignIn } from "../../../../components/admin-sign-in";
import { useAdminData } from "../../../../components/admin-data-context";
import { PageHeader } from "../../../../components/page-header";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";

const steps = ["Organization", "Primary admin", "Modules", "Review"];
const moduleOptions: Array<{ key: OrganizationModuleKey; label: string }> = [
  { key: "core_visit", label: "Core visits" },
  { key: "clinical_documentation", label: "Clinical documentation" },
  { key: "inventory", label: "Inventory and POS" },
  { key: "diagnostics", label: "Diagnostics" },
  { key: "financial", label: "Billing and claims" },
  { key: "remote_care", label: "Remote care" },
  { key: "governance", label: "Governance" },
];

export default function NewClinicPage() {
  const router = useRouter();
  const { client, email, error: accessError, isSuperadmin, refreshAccess } = useAdminData();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminTitle, setAdminTitle] = useState("");
  const [password, setPassword] = useState("");
  const [enabledModules, setEnabledModules] = useState<OrganizationModuleKey[]>(["core_visit", "clinical_documentation", "financial", "governance"]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!email && accessError) return <AdminSignIn />;
  if (email && !isSuperadmin) return <section className="data-error" role="alert">Platform administrator access is required to create organizations.</section>;

  const currentValid = step === 0 ? Boolean(name.trim() && code.trim() && region && address.trim()) : step === 1 ? Boolean(adminName.trim() && /^\S+@\S+\.\S+$/.test(adminEmail) && password.length >= 8) : true;
  function toggleModule(key: OrganizationModuleKey) {
    if (key === "governance") return;
    setEnabledModules((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function createClinic() {
    setSaving(true);
    setError(null);
    const organizationResult = await client.from("organizations").insert({
      name: name.trim(),
      identifier: [{ system: "urn:odyssey:organization-code", value: code.trim() }],
      address: [{ text: address.trim(), district: region }],
      telecom: adminPhone.trim() ? [{ system: "phone", value: adminPhone.trim(), use: "work" }] : [],
      type_codes: ["prov"],
    }).select("id").single();
    if (organizationResult.error) {
      setError(organizationResult.error.message);
      setSaving(false);
      return;
    }

    const moduleResults = await Promise.all(moduleOptions.map((module) => setOrganizationModule(client, organizationResult.data.id, module.key, enabledModules.includes(module.key))));
    const moduleError = moduleResults.find((result) => result.error)?.error;
    if (moduleError) {
      setError(`The organization was created, but its module configuration failed: ${moduleError.message}`);
      setSaving(false);
      return;
    }

    const accountResult = await createClinicAccount(client, {
      displayName: adminTitle.trim() ? `${adminName.trim()} (${adminTitle.trim()})` : adminName.trim(),
      email: adminEmail,
      organizationId: organizationResult.data.id,
      password,
      roleCode: "admin",
    });
    if (accountResult.error) {
      setError(`The organization was created, but its primary administrator could not be created: ${accountResult.error.message}`);
      setSaving(false);
      return;
    }
    await refreshAccess();
    router.push(`/superadmin/clinics/${organizationResult.data.id}`);
  }

  return (
    <>
      <PageHeader eyebrow="Platform onboarding" title="Onboard new clinic" description="Create an organization, assign accountable administration, and review platform controls before activation." />
      <ol className="stepper" aria-label="Onboarding progress">
        {steps.map((item, index) => <li className={index === step ? "is-current" : index < step ? "is-complete" : ""} key={item}><span>{index < step ? <Check aria-hidden="true" size={14} /> : index + 1}</span><div><strong>{item}</strong><small>{index === step ? "Current step" : index < step ? "Complete" : "Not started"}</small></div></li>)}
      </ol>
      <section className="wizard-panel">
        {step === 0 ? <><div className="section-title"><h2>Organization record</h2><p>Enter the clinic's registered identity and operational location.</p></div><div className="form-grid"><label className="field-label field-span">Registered clinic name<Input value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="field-label">Organization code<Input value={code} onChange={(event) => setCode(event.target.value)} required /></label><label className="field-label">Region<select className="ui-input" value={region} onChange={(event) => setRegion(event.target.value)} required><option value="" disabled>Select region</option><option>NCR</option><option>Central Luzon</option><option>CALABARZON</option><option>Central Visayas</option><option>Davao Region</option></select></label><label className="field-label field-span">Registered address<Input value={address} onChange={(event) => setAddress(event.target.value)} required /></label></div></> : null}
        {step === 1 ? <><div className="section-title"><h2>Primary administrator</h2><p>This account receives clinic administration privileges and is accountable for local access reviews.</p></div><div className="notice"><ShieldCheck aria-hidden="true" size={18} /><span>The account can manage staff roles, billing configuration, and patient data exports. Issue the temporary password through an approved secure channel.</span></div><div className="form-grid"><label className="field-label">Full name<Input value={adminName} onChange={(event) => setAdminName(event.target.value)} required /></label><label className="field-label">Work email<Input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} required /></label><label className="field-label">Mobile number<Input value={adminPhone} onChange={(event) => setAdminPhone(event.target.value)} /></label><label className="field-label">Job title<Input value={adminTitle} onChange={(event) => setAdminTitle(event.target.value)} /></label><label className="field-label field-span">Temporary password<Input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label></div></> : null}
        {step === 2 ? <><div className="section-title"><h2>Platform modules</h2><p>Select the approved starting configuration. Changes remain available through audited feature controls.</p></div><div className="check-grid">{moduleOptions.map((module) => <label key={module.key}><input checked={enabledModules.includes(module.key)} disabled={module.key === "governance"} onChange={() => toggleModule(module.key)} type="checkbox" /><span><strong>{module.label}</strong><small>{module.key === "governance" ? "Required for administration" : module.key}</small></span></label>)}</div></> : null}
        {step === 3 ? <><div className="section-title"><h2>Activation review</h2><p>Confirm the organization record before creating the clinic workspace and administrator account.</p></div><dl className="review-list"><div><dt>Organization</dt><dd>{name}</dd></div><div><dt>Organization code</dt><dd>{code}</dd></div><div><dt>Region</dt><dd>{region}</dd></div><div><dt>Primary administrator</dt><dd>{adminName} ({adminEmail})</dd></div><div><dt>Enabled modules</dt><dd>{moduleOptions.filter((module) => enabledModules.includes(module.key)).map((module) => module.label).join(", ")}</dd></div><div><dt>Operational state</dt><dd>Active on creation</dd></div></dl></> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <footer className="wizard-actions"><Button variant="outline" disabled={step === 0 || saving} onClick={() => setStep((value) => value - 1)}><ChevronLeft aria-hidden="true" size={16} />Back</Button><span>Step {step + 1} of {steps.length}</span><Button disabled={!currentValid || saving} onClick={() => step === 3 ? void createClinic() : setStep((value) => Math.min(value + 1, 3))}>{step === 3 ? <><Building2 aria-hidden="true" size={16} />{saving ? "Creating..." : "Create clinic"}</> : <>Continue<ChevronRight aria-hidden="true" size={16} /></>}</Button></footer>
      </section>
    </>
  );
}
