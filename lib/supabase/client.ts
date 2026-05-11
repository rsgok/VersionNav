import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminConfig, getSupabaseConfig } from "./config";

export function createPublicSupabaseClient() {
  const config = getSupabaseConfig();

  if (!config) {
    return null;
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function createAdminSupabaseClient() {
  const config = getSupabaseAdminConfig();

  if (!config) {
    return null;
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
