import { z } from "npm:zod@4.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { notifyOwner, ownerEmailShell } from "../_shared/notify.ts";

const requestSchema = z.object({
  action: z.enum(["lookup", "accept"]),
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  accepted: z.literal(true).optional(),
});

const CONSENT_TEXT =
  "Confirmo que li o documento apresentado nesta versão e concordo com os termos apresentados. Estou ciente de que este aceite eletrônico registra evidências de manifestação de vontade, mas não equivale automaticamente a uma assinatura qualificada.";

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonResponse({ error: "Invalid signature token request." }, 400);
  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "Signature service configuration is incomplete." }, 500);

  const tokenHash = await hashToken(input.data.token);
  if (input.data.action === "lookup") {
    const { data: tokenRecord, error: tokenError } = await admin.from("signature_tokens")
      .select("signature_id,expires_at,used_at")
      .eq("token_hash", tokenHash).maybeSingle();
    if (tokenError) return jsonResponse({ error: "Could not validate signature link." }, 500);
    if (!tokenRecord || tokenRecord.used_at || new Date(tokenRecord.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: "This link is invalid, expired, or already used." }, 404);
    }

    const { data: signature, error: signatureError } = await admin.from("contract_signatures")
      .select("id,contract_id,contract_version_id,participant_name,participant_role,status")
      .eq("id", tokenRecord.signature_id).single();
    if (signatureError || !signature || signature.status !== "pending") {
      return jsonResponse({ error: "This signature request is no longer available." }, 404);
    }
    const { data: version, error: versionError } = await admin.from("contract_versions")
      .select("id,contract_id,version,rendered_content,sha256")
      .eq("id", signature.contract_version_id).eq("contract_id", signature.contract_id).single();
    if (versionError || !version) return jsonResponse({ error: "Document version not found." }, 404);
    const { data: contract, error: contractError } = await admin.from("contracts")
      .select("id,title").eq("id", signature.contract_id).single();
    if (contractError || !contract) return jsonResponse({ error: "Contract not found." }, 404);

    return jsonResponse({
      title: contract.title,
      participant_name: signature.participant_name,
      participant_role: signature.participant_role,
      document_version: version.version,
      document_sha256: version.sha256,
      content: version.rendered_content,
      expires_at: tokenRecord.expires_at,
    });
  }

  if (input.data.accepted !== true) return jsonResponse({ error: "Consent is required." }, 400);
  const { data, error } = await admin.rpc("register_signature_acceptance", {
    p_token_hash: tokenHash,
    p_consent_text: CONSENT_TEXT,
  });
  if (error || !data?.signature_id) {
    return jsonResponse({ error: "This link has expired, was already used, or could not be accepted." }, 409);
  }
  await notifyOwner(
    "Aceite eletrônico registrado",
    ownerEmailShell("Aceite registrado", [
      ["Participante", data.participant_name],
      ["Contrato", contract.title],
      ["Data", new Date(data.accepted_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })],
    ]),
  );

  return jsonResponse({ accepted: true, participant_name: data.participant_name, accepted_at: data.accepted_at });
});
