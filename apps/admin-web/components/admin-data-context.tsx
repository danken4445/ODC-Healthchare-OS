"use client";

import {
  createBrowserSupabaseClient,
  getAccessibleOrganizations,
  getMyOrganizationPermissions,
  getPortalAccess,
  signInWithPassword,
  signOut,
} from "@odyssey/supabase-client";
import type { ClinicRolePermission, PublicClinicSummary } from "@odyssey/types";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Client = ReturnType<typeof createBrowserSupabaseClient>;

interface AdminDataContextValue {
  client: Client;
  email: string | null;
  error: string | null;
  isSuperadmin: boolean;
  loading: boolean;
  organization: PublicClinicSummary | null;
  organizations: PublicClinicSummary[];
  permissions: ClinicRolePermission[];
  permissionsError: string | null;
  permissionsLoading: boolean;
  readCache: <T>(key: string, maxAgeMs?: number) => T | undefined;
  refreshAccess: () => Promise<void>;
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
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<PublicClinicSummary[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<ClinicRolePermission[]>([]);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);

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
    setError(null);
    const userResult = await client.auth.getUser();
    if (userResult.error || !userResult.data.user) {
      setEmail(null);
      setIsSuperadmin(false);
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
      setPermissionsLoading(false);
      setLoading(false);
      return;
    }
    if (!accessResult.data.allowed) {
      await signOut(client);
      setEmail(null);
      setIsSuperadmin(false);
      setOrganizations([]);
      setOrganizationId(null);
      setError("This account is not authorized for the administration portal.");
      setPermissionsLoading(false);
      setLoading(false);
      return;
    }
    setIsSuperadmin(accessResult.data.isSuperadmin);
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
    setOrganizationId(nextId);
  }, [organizations]);

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
  return <AdminDataContext.Provider value={{ client, email, error, isSuperadmin, loading, organization, organizations, permissions, permissionsError, permissionsLoading, readCache, refreshAccess, selectOrganization, signIn: handleSignIn, signOut: handleSignOut, writeCache }}>{children}</AdminDataContext.Provider>;
}

export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (!context) throw new Error("useAdminData must be used inside AdminDataProvider.");
  return context;
}
