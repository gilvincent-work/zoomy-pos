import {createClient, type SupabaseClient} from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/** True when the Supabase env is present (build-time). When false, the POS runs
 * fully on its local SQLite catalog and all sync is a no-op. */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * The anon-key client for Coop's shared Supabase project (Staging in dev; see
 * COOP_INTEGRATION_PLAN.md). Returns null when the env is unset so callers can
 * no-op instead of crashing — the POS must still run offline / unconfigured.
 * v1 has no cashier login, so session persistence and token refresh are off.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {persistSession: false, autoRefreshToken: false},
    });
  }
  return client;
}
