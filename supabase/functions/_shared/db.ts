import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { requireEnv } from "./env.ts";
import { HttpError } from "./http_error.ts";

const URL = requireEnv("SUPABASE_URL");

// Service role: bypasses RLS. Only for work the function has already
// authorized on its own terms.
export const service = createClient(URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Staff actions run as the staff member, not the service role, so auth.uid()
// inside the database is the real person: moderated_by records who, and
// is_admin() is checked by Postgres rather than trusted from here.
export async function requireAdmin(req: Request): Promise<SupabaseClient> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    throw new HttpError(401, "Sign in to the admin panel first.");
  }

  const client = createClient(URL, requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.rpc("is_admin");
  if (error) throw new HttpError(401, "Your session has expired. Sign in again.");
  if (data !== true) throw new HttpError(403, "This account is not a contest admin.");
  return client;
}
