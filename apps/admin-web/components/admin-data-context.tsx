"use client";

import {
  createBrowserSupabaseClient,
  getAccessibleOrganizations,
  getCurrentStaffDepartment,
  getMyOrganizationPermissions,
  getPortalAccess,
  getRootSupplyDepartment,
  signInWithPassword,
  signOut,
} from "@odyssey/supabase-client";
import type { ClinicRolePermission, PublicClinicSummary } from "@odyssey/types";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Client = ReturnType<typeof createBrowserSupabaseClient>;

interface AdminDataContextValue {
  assignedDepartmentId: string | null;
  client: Client;
  email: string | null;
  error: string | null;
  isItAdmin: boolean;
  isOrganizationAdmin: boolean;
  isScopedDepartment: boolean;
  isSuperadmin: boolean;
  loading: boolean;
  organization: PublicClinicSummary | null;
  organizations: PublicClinicSummary[];
  permissions: ClinicRolePermission[];
  permissionsError: string | null;
  permissionsLoading: boolean;
  readCache: <T>(key: string, maxAgeMs?: number) => T | undefined;
  refreshAccess: () => Promise<void>;
  roleCodes: string[];
  rootSupplyDepartmentId: string | null;
  selectOrganization: (organizationId: string) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  writeCache: <T>(key: string, value: T) => void;
}

interface CacheEntry { cachedAt: number; value: unknown; }

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => createBrowserSupabaseClient(), []);
  const cache = useRef(new Map<string, CacheEntry>());
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [currentOrgRoleCodes, setCurrentOrgRoleCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<PublicClinicSummary[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<ClinicRolePermission[]>([]);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [assignedDepartmentId, setAssignedDepartmentId] = useState<string | null>(null);
  const [rootSupplyDepartmentId, setRootSupplyDepartmentId] = useState<string | null>(null);

  const readCache = useCallback(<T,>(key: string, maxAgeMs = 30_000): T | undefined => {
    const entry = cache.current.get(key);
    if (!entry || Date.now() - entry.cachedAt > maxAgeMs) {
      if (entry) cache.current.delete(key);
      return undefined;
    }
    return entry.value as T;
  }, []);

  const writeCache = useCallback(<T,>(key: string, value: T) => {
    cache.current.set(key, { cachedAt: Date.now(), value });
  }, []);

  const refreshAccess = useCallback(async () => {
    cache.current.clear();
    setLoading(true);
    setPermissions([]);
    setPermissionsError(null);
    setPermissionsLoading(true);
    setAssignedDepartmentId(null);
    setRootSupplyDepartmentId(null);
    setError(null);
    const userResult = await client.auth.getUser();
    if (userResult.error || !userResult.data.user) {
      setEmail(null);
      setIsSuperadmin(false);
      setRoleCodes([]);
      setCurrentOrgRoleCodes([]);
      setOrganizations([]);
      setOrganizationId(null);
      setError("Sign in with an authorized administrative account to load database records.");
      setPermissionsLoading(false);
      setLoading(false);
      return;
    }
    setEmail(userResult.data.user.email ?? null);
    const accessResult = await getPortalAccess(client, "admin");
    if (accessResult.error) {
      setError(accessResult.error.message);
      setRoleCodes([]);
      setCurrentOrgRoleCodes([]);
      setPermissionsLoading(false);
      setLoading(false);
      return;
    }
    if (!accessResult.data.allowed) {
      await signOut(client);
      setEmail(null);
      setIsSuperadmin(false);
      setRoleCodes([]);
      setCurrentOrgRoleCodes([]);
      setOrganizations([]);
      setOrganizationId(null);
      setError("This account is not authorized for the administration portal.");
      setPermissionsLoading(false);
      setLoading(false);
      return;
    }
    setIsSuperadmin(accessResult.data.isSuperadmin);
    setRoleCodes(accessResult.data.roleCodes ?? []);
    const organizationResult = accessResult.data.isSuperadmin
      ? await client.from("organizations").select("id, name, telecom, address").order("name")
      : await getAccessibleOrganizations(client, accessResult.data.organizationIds);
    if (organizationResult.error) {
      setError(organizationResult.error.message);
      setPermissionsLoading(false);
      setLoading(false);
      return;
    }
    const available = (organizationResult.data ?? []) as PublicClinicSummary[];
    setOrganizations(available);
    const stored = window.localStorage.getItem("odyssey-admin-organization");
    const selected = available.find((item) => item.id === stored)?.id ?? available[0]?.id ?? null;
    setOrganizationId(selected);
    setLoading(false);
  }, [client]);

  useEffect(() => { void refreshAccess(); }, [refreshAccess]);

  const selectOrganization = useCallback((nextId: string) => {
    if (!organizations.some((item) => item.id === nextId)) return;
    window.localStorage.setItem("odyssey-admin-organization", nextId);
    setPermissions([]);
    setPermissionsError(null);
    setPermissionsLoading(true);
    setAssignedDepartmentId(null);
    setRootSupplyDepartmentId(null);
    setOrganizationId(nextId);
  }, [organizations]);

  useEffect(() => {
    let current = true;
    if (loading || !organizationId || !email) {
      setCurrentOrgRoleCodes([]);
      return () => { current = false; };
    }
    void (async () => {
      const { data: userData } = await client.auth.getUser();
      if (!userData?.user?.id || !current) return;
      const { data: userRoles } = await client
        .from("user_roles")
        .select("roles(name)")
        .eq("organization_id", organizationId)
        .eq("user_id", userData.user.id);
      if (!current) return;
      const names = (userRoles ?? [])
        .map((r: any) => r.roles?.name)
        .filter(Boolean) as string[];
      setCurrentOrgRoleCodes(names);
    })();
    return () => { current = false; };
  }, [client, email, loading, organizationId]);

  useEffect(() => {
    let current = true;
    if (loading) return () => { current = false; };
    if (!organizationId) {
      setAssignedDepartmentId(null);
      setRootSupplyDepartmentId(null);
      return () => { current = false; };
    }
    void Promise.all([
      getCurrentStaffDepartment(client, organizationId),
      getRootSupplyDepartment(client, organizationId),
    ]).then(([deptResult, rootResult]) => {
      if (!current) return;
      setAssignedDepartmentId(deptResult.error ? null : deptResult.data);
      setRootSupplyDepartmentId(rootResult.error ? null : (rootResult.data ?? null));
    });
    return () => { current = false; };
  }, [client, loading, organizationId]);

  useEffect(() => {
    let current = true;
    if (loading) return () => { current = false; };
    if (!email || error || !organizationId || isSuperadmin) {
      setPermissions([]);
      setPermissionsError(null);
      setPermissionsLoading(false);
      return () => { current = false; };
    }
    setPermissionsLoading(true);
    setPermissionsError(null);
    void getMyOrganizationPermissions(client, organizationId).then((result) => {
      if (!current) return;
      if (result.error) {
        setPermissions([]);
        setPermissionsError(result.error.message);
      } else {
        setPermissions(result.data);
      }
      setPermissionsLoading(false);
    });
    return () => { current = false; };
  }, [client, email, error, isSuperadmin, loading, organizationId]);

  const isItAdmin = useMemo(() => {
    if (isSuperadmin) return false;
    const allRoles = new Set([...roleCodes, ...currentOrgRoleCodes]);
    return allRoles.has("it_admin") && !allRoles.has("admin") && !allRoles.has("owner");
  }, [isSuperadmin, roleCodes, currentOrgRoleCodes]);

  const isOrganizationAdmin = useMemo(() => {
    const allRoles = new Set([...roleCodes, ...currentOrgRoleCodes]);
    return allRoles.has("admin") || allRoles.has("owner");
  }, [roleCodes, currentOrgRoleCodes]);

  const isScopedDepartment = useMemo(() => {
    if (isSuperadmin || isItAdmin) return false;
    return Boolean(
      assignedDepartmentId &&
      (!rootSupplyDepartmentId || assignedDepartmentId !== rootSupplyDepartmentId)
    );
  }, [assignedDepartmentId, isSuperadmin, isItAdmin, rootSupplyDepartmentId]);

  const handleSignIn = useCallback(async (accountEmail: string, password: string) => {
    const result = await signInWithPassword(client, accountEmail, password);
    if (result.error) return result.error.message;
    await refreshAccess();
    return null;
  }, [client, refreshAccess]);

  const handleSignOut = useCallback(async () => {
    await signOut(client);
    await refreshAccess();
  }, [client, refreshAccess]);

  const organization = organizations.find((item) => item.id === organizationId) ?? null;
  return (
    <AdminDataContext.Provider
      value={{
        assignedDepartmentId,
        client,
        email,
        error,
        isItAdmin,
        isOrganizationAdmin,
        isScopedDepartment,
        isSuperadmin,
        loading,
        organization,
        organizations,
        permissions,
        permissionsError,
        permissionsLoading,
        readCache,
        refreshAccess,
        roleCodes,
        rootSupplyDepartmentId,
        selectOrganization,
        signIn: handleSignIn,
        signOut: handleSignOut,
        writeCache,
      }}
    >
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (!context) throw new Error("useAdminData must be used inside AdminDataProvider.");
  return context;
}
