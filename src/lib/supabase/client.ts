import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client with SSR support (for client components)
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
    db: { schema: "asset_map" as any },
  });
}

// Singleton for backward compatibility with existing code
export const supabase = createClient();

// Server-side client with service role (for scripts and API routes)
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    db: { schema: "asset_map" },
    auth: { persistSession: false },
  });
}
