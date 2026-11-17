import { z } from "npm:zod@4.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getAuthorizedUser, isResponse } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const requestSchema = z.object({
  contract_id: z.string().uuid(),
  version_id: z.string().uuid(),
  participant_name: z.string().trim().min(2).max(200),
  participant_email: z.union([z.string().trim().email().max(320), z.literal("")]).optional(),
  participant_role: z.string().trim().min(2).max(80),
});

function hashToken(token: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
    .then((digest) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonResponse({ error: "Invalid signature request." }, 400);
  const auth = await getAuthorizedUser(request);
  if (isResponse(auth)) return auth;
  const { client, user } = auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicAppUrl = Deno.env.get("PUBLIC_APP_URL");
  if (!supabaseUrl || !serviceRoleKey || !publicAppUrl) {
    return jsonResponse({ error: "Signature service configuration is incomplete." }, 500);
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(publicAppUrl);
  } catch {
    return jsonResponse({ error: "Public app URL is invalid." }, 500);
  }
  if (baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname)) {
    return jsonResponse({ error: "Public app URL must use HTTPS." }, 500);
  }

  const { data: contract, error: contractError } = await client.from("contracts")
    .select("id,owner_id").eq("id", input.data.contract_id).eq("owner_id", user.id).single();
  if (contractError || !contract) return jsonResponse({ error: "Contract not found." }, 404);
  const { data: version, error: versionError } = await client.from("contract_versions")
    .select("id,contract_id").eq("id", input.data.version_id).eq("contract_id", contract.id).single();
  if (versionError || !version) return jsonResponse({ error: "Document version not found." }, 404);

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: created, error: createError } = await admin.rpc("create_signature_token", {
    p_contract_id: contract.id,
    p_version_id: version.id,
    p_owner_id: user.id,
    p_participant_name: input.data.participant_name,
    p_participant_email: input.data.participant_email || null,
    p_participant_role: input.data.participant_role,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });
  if (createError || !created?.signature_id) {
    return jsonResponse({ error: "Could not create the signature link." }, 500);
  }

  const root = baseUrl.toString().replace(/\/$/, "");
  return jsonResponse({
    signature_id: created.signature_id,
    expires_at: expiresAt,
    url: `${root}/public/sign/${token}`,
  });
});
