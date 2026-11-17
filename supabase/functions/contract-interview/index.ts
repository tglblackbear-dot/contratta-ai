import { z } from "npm:zod@4.6.7";
import { getAuthorizedUser, isResponse } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const requestSchema = z.object({
  session_id: z.string().uuid(),
  operation_id: z.string().uuid(),
  expected_version: z.number().int().min(1),
  message: z.string().trim().min(1).max(4000),
});

const responseSchema = z.object({
  contract_type: z.string().min(1),
  conversation_status: z.enum(["collecting", "reviewing", "ready"]),
  extracted_fields: z.record(z.string(), z.unknown()),
  missing_fields: z.array(z.string()),
  validation_warnings: z.array(z.string()),
  next_question: z.string().nullable(),
  requires_confirmation: z.boolean(),
});

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonResponse({ error: "Invalid interview request." }, 400);

  const auth = await getAuthorizedUser(request);
  if (isResponse(auth)) return auth;
  const { client, user } = auth;

  const apiUrl = Deno.env.get("AI_API_URL");
  const apiKey = Deno.env.get("AI_API_KEY");
  const model = Deno.env.get("AI_MODEL");
  if (!apiUrl || !apiKey || !model) {
    return jsonResponse({ error: "A IA ainda não está configurada neste projeto Supabase." }, 503);
  }

  const { data: session, error: sessionError } = await client.from("interview_sessions")
    .select("id,owner_id,contract_id,state,fields,missing_fields,progress,version")
    .eq("id", input.data.session_id).eq("owner_id", user.id).single();
  if (sessionError || !session) return jsonResponse({ error: "Interview not found." }, 404);
  if (session.state === "PAUSED") {
    return jsonResponse({ error: "This interview is paused. Resume it before sending a response." }, 409);
  }
  if (session.state === "COMPLETED") {
    return jsonResponse({ error: "This interview is already completed." }, 409);
  }

  const { data: existingOperation, error: operationError } = await client.from("interview_messages")
    .select("content")
    .eq("session_id", session.id)
    .eq("owner_id", user.id)
    .eq("client_operation_id", input.data.operation_id)
    .eq("role", "assistant")
    .maybeSingle();
  if (operationError) return jsonResponse({ error: "Could not check the interview operation." }, 500);
  if (existingOperation) {
    let existingDecoded: unknown;
    try {
      existingDecoded = JSON.parse(existingOperation.content);
    } catch {
      return jsonResponse({ error: "Stored interview operation is invalid." }, 500);
    }
    const existingResult = responseSchema.safeParse(existingDecoded);
    if (!existingResult.success) return jsonResponse({ error: "Stored interview operation is invalid." }, 500);
    return jsonResponse({ ...existingResult.data, session_version: session.version });
  }
  if (session.version !== input.data.expected_version) {
    return jsonResponse({
      error: "This interview changed on another device. Review the current answers before sending again.",
      code: "version_conflict",
      session_version: session.version,
    }, 409);
  }

  const { data: contract, error: contractError } = await client.from("contracts")
    .select("id,title,contract_type,template_id")
    .eq("id", session.contract_id).eq("owner_id", user.id).single();
  if (contractError || !contract) return jsonResponse({ error: "Contract not found." }, 404);

  const { data: template, error: templateError } = await client.from("contract_templates")
    .select("slug,fields").eq("id", contract.template_id).eq("is_active", true).single();
  if (templateError || !template) return jsonResponse({ error: "Active template not found." }, 404);

  const { data: history, error: historyError } = await client.from("interview_messages")
    .select("role,content").eq("session_id", session.id).eq("owner_id", user.id)
    .order("created_at", { ascending: true }).limit(40);
  if (historyError) return jsonResponse({ error: "Could not load interview history." }, 500);

  const templateFields = (Array.isArray(template.fields) ? template.fields : [])
    .filter((field: unknown): field is { key?: unknown; label?: unknown; required?: unknown } => typeof field === "object" && field !== null);
  const requiredFields = templateFields
    .filter((field) => field.required === true)
    .map((field) => typeof field.key === "string" ? field.key : "")
    .filter(Boolean);

  const systemPrompt = [
    "Você conduz uma entrevista para organizar dados de um acordo no Brasil. Não dê aconselhamento jurídico.",
    "Não invente leis, jurisprudência, dados, valores ou obrigações. Não altere silenciosamente respostas anteriores.",
    "Aproveite todas as informações na mensagem; pergunte apenas o que ainda estiver faltando ou estiver ambíguo.",
    "Responda somente com JSON válido, sem Markdown, conforme o esquema solicitado.",
    `Tipo de contrato: ${template.slug}. Campos previstos: ${JSON.stringify(template.fields)}.`,
    `Campos já extraídos: ${JSON.stringify(session.fields)}.`,
    "Esquema: {contract_type:string,conversation_status:'collecting'|'reviewing'|'ready',extracted_fields:object,missing_fields:string[],validation_warnings:string[],next_question:string|null,requires_confirmation:boolean}.",
    "Use conversation_status 'ready' somente quando todos os campos obrigatórios estiverem claros. Sempre exija confirmação humana.",
  ].join("\n");
  const messages = [
    { role: "system", content: systemPrompt },
    ...(history ?? []).map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.role === "assistant" ? item.content : item.content,
    })),
    { role: "user", content: input.data.message },
  ];

  let aiResponse: Response;
  try {
    aiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, response_format: { type: "json_object" }, temperature: 0.1 }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return jsonResponse({ error: "Não foi possível conectar ao provedor de IA." }, 502);
  }
  if (!aiResponse.ok) return jsonResponse({ error: "O provedor de IA não processou a solicitação." }, 502);

  const providerPayload = await aiResponse.json().catch(() => null);
  const rawContent = providerPayload?.choices?.[0]?.message?.content;
  if (typeof rawContent !== "string") return jsonResponse({ error: "Resposta inválida do provedor de IA." }, 502);

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawContent);
  } catch {
    return jsonResponse({ error: "A resposta do provedor de IA não é um JSON válido." }, 502);
  }
  const parsed = responseSchema.safeParse(decoded);
  if (!parsed.success) return jsonResponse({ error: "A resposta do provedor não corresponde ao formato esperado." }, 502);

  const fields = { ...(session.fields ?? {}), ...parsed.data.extracted_fields };
  const missingFields = requiredFields.filter((key: string) => !hasValue(fields[key]));
  const conversationStatus = missingFields.length ? "collecting" : "ready";
  const missingLabels = templateFields
    .filter((field) => field.required === true && missingFields.includes(String(field.key)))
    .map((field) => typeof field.label === "string" ? field.label : "");
  const result = {
    ...parsed.data,
    contract_type: template.slug,
    conversation_status: conversationStatus,
    extracted_fields: fields,
    missing_fields: missingFields,
    requires_confirmation: conversationStatus === "ready",
    next_question: missingFields.length
      ? parsed.data.next_question ?? `Ainda preciso confirmar: ${missingLabels[0] ?? missingFields[0]}.`
      : null,
  };
  const assistantMessage = JSON.stringify(result);
  const progress = requiredFields.length
    ? Math.round(((requiredFields.length - missingFields.length) / requiredFields.length) * 100)
    : 0;

  const { data: committed, error: commitError } = await client.rpc("commit_interview_operation", {
    p_session_id: session.id,
    p_owner_id: user.id,
    p_operation_id: input.data.operation_id,
    p_expected_version: input.data.expected_version,
    p_user_message: input.data.message,
    p_assistant_content: assistantMessage,
    p_fields: fields,
    p_missing_fields: missingFields,
    p_progress: progress,
    p_state: conversationStatus === "ready" ? "READY_TO_GENERATE" : "COLLECTING_CONDITIONS",
  });
  if (commitError) return jsonResponse({ error: "Could not save the interview operation." }, 500);
  if (committed?.status === "conflict") {
    return jsonResponse({
      error: "This interview changed on another device. Review the current answers before sending again.",
      code: "version_conflict",
      session_version: committed.session_version,
    }, 409);
  }
  if (committed?.status !== "completed" || typeof committed.assistant_content !== "string") {
    return jsonResponse({ error: "The interview operation was not committed." }, 500);
  }

  let committedDecoded: unknown;
  try {
    committedDecoded = JSON.parse(committed.assistant_content);
  } catch {
    return jsonResponse({ error: "The committed interview result is invalid." }, 500);
  }
  const committedResult = responseSchema.safeParse(committedDecoded);
  if (!committedResult.success) return jsonResponse({ error: "The committed interview result is invalid." }, 500);
  return jsonResponse({ ...committedResult.data, session_version: committed.session_version });
});
