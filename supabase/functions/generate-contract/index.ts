import { z } from "npm:zod@4.6.7";
import { getAuthorizedUser, isResponse } from "../_shared/auth.ts";
import { AUTHORSHIP_PHRASE } from "../_shared/attribution.ts";
import { AUTHORSHIP_SHA256 } from "../_shared/attribution.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { notifyOwner, ownerEmailShell } from "../_shared/notify.ts";

const requestSchema = z.object({
  session_id: z.string().uuid(),
  confirm_fields: z.literal(true),
});

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function interpolate(template: string, fields: Record<string, unknown>) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => {
    const value = fields[key];
    if (!hasValue(value)) throw new Error(`Campo obrigatório ainda não informado: ${key}`);
    return typeof value === "string" ? value.trim() : JSON.stringify(value);
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonResponse({ error: "Invalid document request." }, 400);
  const auth = await getAuthorizedUser(request);
  if (isResponse(auth)) return auth;
  const { client, user } = auth;
  const { data: creditRow, error: creditError } = await client.from("user_credits")
    .select("credits").eq("user_id", user.id).maybeSingle();
  if (creditError) return jsonResponse({ error: "Não foi possível verificar seus créditos." }, 500);
  if (!creditRow || creditRow.credits < 1) {
    return jsonResponse({ error: "Crédito insuficiente. Contrate um crédito para gerar este documento." }, 402);
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(AUTHORSHIP_PHRASE));
  const actualHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actualHash !== AUTHORSHIP_SHA256) return jsonResponse({ error: "Document integrity check failed." }, 500);

  const { data: session, error: sessionError } = await client.from("interview_sessions")
    .select("id,owner_id,contract_id,state,fields,missing_fields")
    .eq("id", input.data.session_id).eq("owner_id", user.id).single();
  if (sessionError || !session) return jsonResponse({ error: "Interview not found." }, 404);
  if (session.state !== "READY_TO_GENERATE" || (session.missing_fields ?? []).length > 0) {
    return jsonResponse({ error: "The interview is not ready for review." }, 409);
  }

  const { data: contract, error: contractError } = await client.from("contracts")
    .select("id,title,template_id,status")
    .eq("id", session.contract_id).eq("owner_id", user.id).single();
  if (contractError || !contract) return jsonResponse({ error: "Contract not found." }, 404);

  const { data: template, error: templateError } = await client.from("contract_templates")
    .select("slug,name,fields,clauses").eq("id", contract.template_id).eq("is_active", true).single();
  if (templateError || !template) return jsonResponse({ error: "Active template not found." }, 404);

  const fields = (session.fields ?? {}) as Record<string, unknown>;
  const requiredFields = (Array.isArray(template.fields) ? template.fields : [])
    .filter((field: unknown) => typeof field === "object" && field !== null && "required" in field && field.required === true)
    .map((field: { key?: unknown }) => typeof field.key === "string" ? field.key : "")
    .filter(Boolean);
  const missing = requiredFields.filter((key: string) => !hasValue(fields[key]));
  if (missing.length) return jsonResponse({ error: `Campos pendentes: ${missing.join(", ")}` }, 422);

  const clauses = Array.isArray(template.clauses) ? template.clauses as Array<{ title?: string; body?: string }> : [];
  if (!clauses.length) return jsonResponse({ error: "The selected template has no clauses." }, 422);

  let content: string;
  try {
    const sections = clauses.map((clause, index) => {
      if (!clause.title || !clause.body) throw new Error("Template clause is incomplete.");
      return `${index + 1}. ${clause.title.toLocaleUpperCase("pt-BR")}\n${interpolate(clause.body, fields)}`;
    });
    content = `${template.name.toLocaleUpperCase("pt-BR")}\n\n${sections.join("\n\n")}`;
    if (/\{\{[a-zA-Z0-9_]+\}\}/.test(content)) throw new Error("The generated document contains unresolved fields.");
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not prepare document." }, 422);
  }

  const { data: updatedContract, error: updateError } = await client.from("contracts").update({
    content,
    status: "draft",
    interview_data: fields,
  }).eq("id", contract.id).eq("owner_id", user.id).select("id").single();
  if (updateError || !updatedContract) return jsonResponse({ error: "Could not save the document draft." }, 500);

  const answers = Object.entries(fields).map(([field_key, value]) => ({
    contract_id: contract.id,
    owner_id: user.id,
    field_key,
    value,
    confirmed_at: new Date().toISOString(),
  }));
  if (answers.length) {
    const { error: answersError } = await client.from("contract_answers").upsert(answers, { onConflict: "contract_id,field_key" });
    if (answersError) return jsonResponse({ error: "Could not save confirmed contract answers." }, 500);
  }

  const { error: sessionUpdateError } = await client.from("interview_sessions").update({
    state: "COMPLETED",
  }).eq("id", session.id).eq("owner_id", user.id);
  if (sessionUpdateError) return jsonResponse({ error: "Could not finish the interview." }, 500);

  const { error: auditError } = await client.from("contract_audit_logs").insert({
    contract_id: contract.id,
    owner_id: user.id,
    actor_id: user.id,
    event_type: "draft_generated",
    metadata: { template_version: 1, authorship_identifier: AUTHORSHIP_PHRASE },
  });
  if (auditError) return jsonResponse({ error: "Could not record the document event." }, 500);

  const { data: consumed, error: consumeError } = await client.rpc("consume_contract_credit");
  if (consumeError || consumed !== true) {
    return jsonResponse({ error: "Não foi possível baixar o crédito deste contrato. Tente novamente." }, 402);
  }

  await notifyOwner(
    "Novo contrato gerado",
    ownerEmailShell("Novo contrato gerado", [
      ["Usuário", user.email ?? "—"],
      ["Contrato", contract.title],
      ["Modelo", template.slug],
      ["Data", new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })],
    ]),
  );

  return jsonResponse({ contract_id: updatedContract.id, status: "draft" });
});
