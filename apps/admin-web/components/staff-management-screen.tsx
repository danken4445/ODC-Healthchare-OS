"use client";

import {
  getClinicRoleDefinitions,
  getStaffDepartments,
} from "@odyssey/supabase-client";
import type {
  ClinicRoleDefinition,
  DepartmentSummary,
} from "@odyssey/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminRecords } from "../hooks/use-admin-records";
import {
  departmentsConfig,
  permissionLabels,
  rolesConfig,
  staffConfig,
} from "../lib/admin-data";
import { AdminSignIn } from "./admin-sign-in";
import { useAdminData } from "./admin-data-context";
import { DataTable, type DataRow } from "./data-table";
import { PageHeader } from "./page-header";
import { CreateRecordAction, DepartmentDialog, RecordRowActions, RoleDialog } from "./record-management";
import { SummaryStrip } from "./summary-strip";
import { Tabs, TabsContent } from "./ui/tabs";

export function StaffManagementScreen() {
  const { client, email, error: accessError, isSuperadmin, organization, permissions } = useAdminData();
  const [revision, setRevision] = useState(0);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [roles, setRoles] = useState<ClinicRoleDefinition[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const staffRecords = useAdminRecords("staff", revision);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  const canManage = isSuperadmin || permissions.includes("can_manage_staff_roles");

  useEffect(() => {
    let current = true;
    async function loadCatalogs() {
      if (!organization) {
        if (current) setCatalogLoading(false);
        return;
      }
      setCatalogLoading(true);
      setCatalogError(null);
      const [departmentResult, roleResult] = await Promise.all([
        getStaffDepartments(client, organization.id),
        getClinicRoleDefinitions(client, organization.id),
      ]);
      if (!current) return;
      if (departmentResult.error || roleResult.error) {
        setCatalogError(departmentResult.error?.message ?? roleResult.error?.message ?? "Staff configuration could not be loaded.");
      } else {
        setDepartments(departmentResult.data);
        setRoles(roleResult.data);
      }
      setCatalogLoading(false);
    }
    void loadCatalogs();
    return () => { current = false; };
  }, [client, organization, revision]);

  const departmentRows = useMemo<DataRow[]>(() => departments.map((department) => ({
    id: department.id,
    name: department.name,
    code: department.code,
    description: department.description ?? "—",
    staffCount: staffRecords.data.filter((member) => member.departmentId === department.id).length,
    active: department.active,
    status: department.active ? "Active" : "Inactive",
  })), [departments, staffRecords.data]);

  const roleRows = useMemo<DataRow[]>(() => roles.map((role) => ({
    code: role.code,
    name: role.name,
    scope: role.isCustom ? "Custom role" : "Built-in role",
    assigned: staffRecords.data.filter((member) => member.roleCode === role.code).length,
    permissionCount: role.permissions.length,
    access: role.permissions.length ? role.permissions.slice(0, 3).map((permission) => permissionLabels.get(permission) ?? permission).join(", ") + (role.permissions.length > 3 ? ` +${role.permissions.length - 3}` : "") : "No access enabled",
  })), [roles, staffRecords.data]);

  if (!email && (accessError || staffRecords.error)) return <AdminSignIn />;
  const summaryItems = [
    { label: "Staff accounts", value: staffRecords.data.length.toLocaleString(), detail: "Assigned to this clinic" },
    { label: "Active departments", value: departments.filter((department) => department.active).length.toLocaleString(), detail: `${departments.length} total departments` },
    { label: "Configured roles", value: roles.length.toLocaleString(), detail: `${roles.filter((role) => role.isCustom).length} custom roles` },
  ];

  return (
    <>
      <PageHeader
        actions={<CreateRecordAction dataset="staff" label={staffConfig.actionLabel} onChanged={refresh} />}
        description="Manage staff accounts, department assignments, and database-authoritative role permissions without leaving the current admin workspace."
        eyebrow={staffConfig.eyebrow}
        title={staffConfig.title}
      />
      <SummaryStrip items={summaryItems} />
      {accessError || staffRecords.error || catalogError ? (
        <section className="data-error" role="alert"><strong>Staff administration could not be loaded.</strong><p>{accessError ?? staffRecords.error ?? catalogError}</p></section>
      ) : (
        <Tabs defaultValue="staff" items={[{ label: "Staff", value: "staff" }, { label: "Departments", value: "departments" }, { label: "Roles & permissions", value: "roles" }]}>
          <TabsContent value="staff">
            {staffRecords.loading ? <section className="data-loading" aria-live="polite">Loading staff accounts…</section> : (
              <DataTable
                caption="Staff accounts"
                columns={staffConfig.columns}
                data={staffRecords.data}
                emptyMessage={staffConfig.emptyMessage}
                rowActions={canManage ? (row) => <RecordRowActions dataset="staff" onChanged={refresh} row={row} /> : undefined}
              />
            )}
          </TabsContent>
          <TabsContent value="departments">
            <div className="management-tab-header"><div><h2>Departments</h2><p>Maintain operational locations and staff defaults while preserving historical inventory references.</p></div>{canManage ? <DepartmentDialog onChanged={refresh} /> : null}</div>
            {catalogLoading ? <section className="data-loading" aria-live="polite">Loading departments…</section> : (
              <DataTable caption="Departments" columns={departmentsConfig.columns} data={departmentRows} emptyMessage="No departments are configured for this clinic." rowActions={canManage ? (row) => <RecordRowActions dataset="departments" onChanged={refresh} row={row} /> : undefined} />
            )}
          </TabsContent>
          <TabsContent value="roles">
            <div className="management-tab-header"><div><h2>Roles and permissions</h2><p>Built-in role codes remain stable; permission changes apply only to the selected clinic.</p></div>{canManage ? <RoleDialog onChanged={refresh} /> : null}</div>
            {catalogLoading ? <section className="data-loading" aria-live="polite">Loading role definitions…</section> : (
              <DataTable caption="Roles and permissions" columns={rolesConfig.columns} data={roleRows} emptyMessage="No roles are available for this clinic." rowActions={canManage ? (row) => <RecordRowActions dataset="roles" onChanged={refresh} row={row} /> : undefined} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
