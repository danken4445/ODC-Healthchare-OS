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
