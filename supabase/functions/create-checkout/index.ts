import { createClient } from "npm:@supabase/supabase-js@2";
import { getAuthorizedUser, isResponse } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const AMOUNT_CENTS = 600;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const auth = await getAuthorizedUser(request);
  if (isResponse(auth)) return auth;
  const { user } = auth;

  const apiKey = Deno.env.get("INFINITEPAY_API_KEY");
  const handle = Deno.env.get("INFINITEPAY_HANDLE");
  const webhookSecret = Deno.env.get("PAYMENT_WEBHOOK_SECRET");
  const appUrl = Deno.env.get("PUBLIC_APP_URL");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Configuração do servidor incompleta." }, 500);
  if (!apiKey && !handle) return jsonResponse({ error: "InfinitePay ainda não foi configurado." }, 503);
  if (!webhookSecret || !appUrl) return jsonResponse({ error: "Webhook de pagamento não configurado." }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const orderNsu = `${user.id}:${crypto.randomUUID()}`;
  const { error: orderError } = await admin.from("payment_orders").insert({
    order_nsu: orderNsu,
    user_id: user.id,
    amount: AMOUNT_CENTS,
    status: "pending",
  });
  if (orderError) return jsonResponse({ error: "Não foi possível registrar o pedido." }, 500);

  const payload: Record<string, unknown> = {
    items: [{ quantity: 1, price: AMOUNT_CENTS, description: "1 crédito Contratta AI - contrato avulso" }],
    order_nsu: orderNsu,
    redirect_url: `${appUrl.replace(/\/$/, "")}/billing?payment=success`,
    webhook: {
      url: `${supabaseUrl}/functions/v1/infinitepay-webhook?token=${encodeURIComponent(webhookSecret)}`,
      events: ["paid", "refunded", "canceled"],
    },
    customer: {
      name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "Cliente",
      email: user.email ?? "",
    },
  };
  if (!apiKey && handle) payload.handle = handle.replace(/^\$/, "");

  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-Api-Key": apiKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return jsonResponse({ error: "Não foi possível contatar a InfinitePay." }, 502);
  }
  if (!providerResponse.ok) return jsonResponse({ error: "A InfinitePay não criou o checkout." }, 502);

  const data = await providerResponse.json().catch(() => null) as Record<string, unknown> | null;
  const checkoutUrl = [data?.url, data?.redirect_url, data?.checkout_url, data?.payment_url, data?.link]
    .find((value): value is string => typeof value === "string" && /^https?:\/\//.test(value));
  if (!checkoutUrl) return jsonResponse({ error: "A InfinitePay não devolveu o link de pagamento." }, 502);

  return jsonResponse({ url: checkoutUrl, order_nsu: orderNsu });
});
