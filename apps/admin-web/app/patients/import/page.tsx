"use client";

import { importGovernancePatients } from "@odyssey/supabase-client";
import type { GovernancePatientImportRow, ImportedPatientCredential } from "@odyssey/types";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { ChangeEvent, useState } from "react";
import { AdminSignIn } from "../../../components/admin-sign-in";
import { useAdminData } from "../../../components/admin-data-context";
import { DataTable } from "../../../components/data-table";
import { PageHeader } from "../../../components/page-header";
import { StatusBadge } from "../../../components/status-badge";
import { Button } from "../../../components/ui/button";

function parseCsv(text: string): GovernancePatientImportRow[] {
  const [headerLine, ...lines] = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!headerLine) return [];
  const headers = headerLine.split(",").map((value) => value.trim().toLowerCase());
  return lines.map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const value = (key: string) => values[headers.indexOf(key)] || undefined;
    return { name: value("name") ?? "", birth_date: value("birth_date"), gender: value("gender"), phone: value("phone") };
  });
}

export default function PatientImportPage() {
  const { client, email, error: accessError, organization } = useAdminData();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<GovernancePatientImportRow[]>([]);
  const [results, setResults] = useState<ImportedPatientCredential[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  if (!email && accessError) return <AdminSignIn />;

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected); setResults([]); setError(null);
    if (!selected) { setRows([]); return; }
    try {
      const parsed = parseCsv(await selected.text());
      if (!parsed.length) throw new Error("The CSV contains no patient rows.");
      if (parsed.length > 500) throw new Error("Imports are limited to 500 rows per batch.");
      setRows(parsed);
    } catch (readError) {
      setRows([]);
      setError(readError instanceof Error ? readError.message : "The CSV could not be read.");
    }
  }

  async function runImport() {
    if (!file || !rows.length || !organization) return;
    setProcessing(true); setError(null);
    const result = await importGovernancePatients(client, organization.id, file.name, rows);
    if (result.error) setError(result.error.message); else setResults(result.data);
    setProcessing(false);
  }

  const failures = results.filter((item) => item.error);
  return <>
    <PageHeader eyebrow="Patient data administration" title="Mass patient ingestion" description="Validate and import a structured patient file. The database records every batch and returns row-level outcomes." />
    <section className="import-panel">
      <label className="import-dropzone"><FileSpreadsheet aria-hidden="true" size={30} /><div><strong>{file?.name ?? "Patient master file"}</strong><span>{file ? `${rows.length} rows ready for database validation` : "CSV with name, birth_date, gender, and phone columns; maximum 500 rows"}</span></div><span className="ui-button ui-button--outline"><Upload aria-hidden="true" size={16} />Choose CSV</span><input accept=".csv,text/csv" className="sr-only" onChange={chooseFile} type="file" /></label>
      <div className="import-progress" aria-busy={processing}><div><span>Database import</span><strong>{results.length ? "Complete" : processing ? "Processing" : "Ready"}</strong></div><div className="progress-track"><span className={processing ? "is-processing" : ""} style={{ width: results.length ? "100%" : "0%" }} /></div><p>{results.length ? `${results.length - failures.length} rows imported; ${failures.length} rows failed.` : "Rows are validated and committed by the tenant-scoped import function."}</p></div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="import-actions"><Button disabled={!file || !rows.length || processing || !organization} onClick={runImport}>{processing ? "Importing..." : `Import ${rows.length || ""} rows`}</Button><a className="ui-button ui-button--outline" download="odyssey-patient-import.csv" href="data:text/csv;charset=utf-8,name,birth_date,gender,phone%0A">Download field template</a></div>
    </section>
    {results.length ? <section className="panel-section"><div className="panel-heading"><div><h2>Import result</h2><p>{failures.length ? <><AlertTriangle aria-hidden="true" size={14} /> Correct failed rows and upload them in a new batch.</> : <>All submitted rows were accepted.</>}</p></div><span className="validation-pass"><CheckCircle2 aria-hidden="true" size={14} />{results.length - failures.length} imported</span></div><DataTable caption="Patient import results" columns={[{ key: "row", label: "Row", numeric: true }, { key: "patient", label: "Patient" }, { key: "record", label: "Record identifier" }, { key: "walkIn", label: "Walk-in identifier" }, { key: "result", label: "Result" }, { key: "status", label: "Status", render: (row) => <StatusBadge label={String(row.status)} /> }]} data={results.map((item) => ({ row: item.rowNumber, patient: item.displayName, record: item.patientId || "-", walkIn: item.walkInId ?? "-", result: item.error ?? "Imported", status: item.error ? "Failed" : "Completed" }))} /></section> : null}
  </>;
}
