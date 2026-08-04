import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role Supabase client. Bypasses RLS, so it must never be imported
 * into a Client Component — the `server-only` import above turns that mistake
 * into a build error rather than a data breach.
 */

let cached: SupabaseClient<Database> | null = null;

export function supabaseAdmin(): SupabaseClient<Database> {
  if (cached) return cached;

  cached = createClient<Database>(
    serverEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { "x-application-name": "markilux-investfest-waitlist" },
      },
    },
  );

  return cached;
}
