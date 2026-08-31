import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";

let browserClient: SupabaseClient<Database> | undefined;

function publicSupabaseConfig(): { anonKey: string; url: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey)
    throw new Error("Missing public Supabase environment variables.");
  return { url, anonKey };
}

export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (typeof window === "undefined") {
    const { url, anonKey } = publicSupabaseConfig();
    return createClient<Database>(url, anonKey);
  }

  if (!browserClient) {
    const { url, anonKey } = publicSupabaseConfig();
    browserClient = createClient<Database>(url, anonKey);
  }

  return browserClient;
}

/**
 * Uses the short-lived JWT returned by the walk-in Edge Function without
 * creating a Supabase Auth session or persisting a token in browser storage.
 * The accessToken option is required here: a global Authorization header alone
 * can be replaced by Supabase's unauthenticated API-key fallback.
 */
export function createWalkInSupabaseClient(
  accessToken: string,
): SupabaseClient<Database> {
  if (!accessToken) throw new Error("A walk-in access token is required.");
  const { url, anonKey } = publicSupabaseConfig();
  return createClient<Database>(url, anonKey, {
    accessToken: async () => accessToken,
  });
}
