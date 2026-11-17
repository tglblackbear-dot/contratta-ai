import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const url = new URL(request.url);
  const expected = Deno.env.get("PAYMENT_WEBHOOK_SECRET");
  if (!expected || url.searchParams.get("token") !== expected) {
    return jsonResponse({ error: "Invalid webhook token." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Server configuration incomplete." }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return jsonResponse({ error: "Invalid payload." }, 400);

  const event = String(body.event ?? body.type ?? "").toLowerCase();
  const paid = body.paid === true;
  const orderNsu = typeof body.order_nsu === "string" ? body.order_nsu : "";
  if (!orderNsu) return jsonResponse({ error: "Missing order_nsu." }, 400);

  const { data: order, error: orderError } = await admin.from("payment_orders")
    .select("order_nsu,user_id,amount,status").eq("order_nsu", orderNsu).maybeSingle();
  if (orderError) return jsonResponse({ error: "Could not read payment order." }, 500);
  if (!order) return jsonResponse({ ok: true, ignored: "unknown_order" });

  if (event === "refunded" || event === "canceled") {
    await admin.from("payment_orders").update({ status: event }).eq("order_nsu", orderNsu);
    return jsonResponse({ ok: true });
  }

  if (event !== "paid" && !paid) return jsonResponse({ ok: true, ignored: "event" });
  if (order.status === "paid") return jsonResponse({ ok: true, ignored: "already_paid" });

  const amount = typeof body.paid_amount === "number" ? body.paid_amount : typeof body.amount === "number" ? body.amount : 0;
  if (amount < order.amount) return jsonResponse({ error: "Amount mismatch." }, 400);

  const { error: updateError } = await admin.from("payment_orders").update({
    status: "paid",
    paid_at: new Date().toISOString(),
    transaction_nsu: typeof body.transaction_nsu === "string" ? body.transaction_nsu : null,
  }).eq("order_nsu", orderNsu);
  if (updateError) return jsonResponse({ error: "Could not update payment order." }, 500);

  const { data: current } = await admin.from("user_credits").select("credits").eq("user_id", order.user_id).maybeSingle();
  if (current) {
    const { error: updateCreditError } = await admin.from("user_credits")
      .update({ credits: current.credits + 1, updated_at: new Date().toISOString() })
      .eq("user_id", order.user_id);
    if (updateCreditError) return jsonResponse({ error: "Could not grant credit." }, 500);
  } else {
    const { error: insertCreditError } = await admin.from("user_credits")
      .insert({ user_id: order.user_id, credits: 1, updated_at: new Date().toISOString() });
    if (insertCreditError) return jsonResponse({ error: "Could not grant credit." }, 500);
  }

  return jsonResponse({ ok: true, credits_granted: true });
});
