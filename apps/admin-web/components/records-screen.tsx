"use client";

import { useCallback, useState } from "react";
import { useAdminRecords } from "../hooks/use-admin-records";
import type { RecordsConfig } from "../lib/admin-data";
import { AdminSignIn } from "./admin-sign-in";
import { useAdminData } from "./admin-data-context";
import { DataTable, type DataRow } from "./data-table";
import { PageHeader } from "./page-header";
import { CreateRecordAction, RecordRowActions } from "./record-management";
import { SummaryStrip } from "./summary-strip";

const datasetsWithRowActions = new Set([
  "patients",
  "appointments",
  "billing",
  "claims",
  "companies",
  "staff",
  "departments",
  "roles",
  "services",
  "templates",
  "features",
  "clinics",
  "admins",
]);

export function RecordsScreen({ config, actionHref }: { config: RecordsConfig; actionHref?: string }) {
  const { email } = useAdminData();
  const [revision, setRevision] = useState(0);
  const { data, error, loading, summaries } = useAdminRecords(config.dataset, revision);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  const rowActions = useCallback(
    (row: DataRow) => <RecordRowActions dataset={config.dataset} onChanged={refresh} row={row} />,
    [config.dataset, refresh],
  );
  if (!email && error) return <AdminSignIn />;
  return (
    <>
      <PageHeader
        actions={<CreateRecordAction actionHref={actionHref} dataset={config.dataset} label={config.actionLabel} onChanged={refresh} />}
        description={config.description}
        eyebrow={config.eyebrow}
        title={config.title}
      />
      {summaries.length ? <SummaryStrip items={summaries} /> : null}
      {error ? (
        <section className="data-error" role="alert"><strong>Database records could not be loaded.</strong><p>{error}</p></section>
      ) : loading ? (
        <section className="data-loading" aria-live="polite">Loading database records…</section>
      ) : (
        <DataTable
          caption={config.title}
          columns={config.columns}
          data={data}
          emptyMessage={config.emptyMessage}
          rowActions={datasetsWithRowActions.has(config.dataset) ? rowActions : undefined}
        />
      )}
    </>
  );
}
