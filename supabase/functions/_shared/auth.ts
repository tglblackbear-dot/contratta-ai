import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { jsonResponse } from "./cors.ts";

export async function getAuthorizedUser(request: Request): Promise<{
  client: SupabaseClient;
  user: User;
} | Response> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonResponse({ error: "Authentication required." }, 401);

  const token = authorization.slice("Bearer ".length);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return jsonResponse({ error: "Supabase function configuration is incomplete." }, 500);

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return jsonResponse({ error: "Invalid or expired session." }, 401);
  return { client, user: data.user };
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}
