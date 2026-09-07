import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Set them in .env (see .env.example).'
  );
}

/**
 * Anon-key client for Coop's shared Supabase project (Staging in dev; see
 * COOP_INTEGRATION_PLAN.md). v1 has no cashier login, so session persistence
 * and auto token refresh are switched off — there is no session to keep.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
