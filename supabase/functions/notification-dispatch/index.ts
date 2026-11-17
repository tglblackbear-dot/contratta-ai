import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface DueNotification {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  contract_id: string | null;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index];
  }
  return mismatch === 0;
}

function pushStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return undefined;
  const status = error.statusCode;
  return typeof status === "number" ? status : undefined;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const dispatchSecret = Deno.env.get("NOTIFICATION_DISPATCH_SECRET");
  if (!dispatchSecret) return jsonResponse({ error: "Notification dispatch is not configured." }, 503);
  const suppliedSecret = request.headers.get("x-notification-dispatch-secret") ?? "";
  if (!constantTimeEqual(suppliedSecret, dispatchSecret)) return jsonResponse({ error: "Unauthorized." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  const appUrl = Deno.env.get("PUBLIC_APP_URL");
  if (!url || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject || !appUrl) {
    return jsonResponse({ error: "Web Push configuration is incomplete." }, 503);
  }

  let appBaseUrl: URL;
  try {
    appBaseUrl = new URL(appUrl.endsWith("/") ? appUrl : `${appUrl}/`);
    if (appBaseUrl.protocol !== "https:" && appBaseUrl.hostname !== "localhost") throw new Error("HTTPS required.");
  } catch {
    return jsonResponse({ error: "PUBLIC_APP_URL must be a valid HTTPS URL." }, 500);
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  } catch {
    return jsonResponse({ error: "Web Push VAPID keys are invalid." }, 500);
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: notifications, error: notificationError } = await client.from("notifications")
    .select("id,owner_id,title,body,contract_id")
    .is("push_processed_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(100);
  if (notificationError) return jsonResponse({ error: "Could not load due notifications." }, 500);

  let processed = 0;
  let failed = 0;
  for (const notification of (notifications ?? []) as DueNotification[]) {
    const { data: preferences, error: preferencesError } = await client.from("user_preferences")
      .select("push_notifications")
      .eq("user_id", notification.owner_id)
      .maybeSingle();
    if (preferencesError) {
      failed += 1;
      continue;
    }
    if (!preferences?.push_notifications) {
      const { error: updateError } = await client.from("notifications")
        .update({ push_processed_at: new Date().toISOString() })
        .eq("id", notification.id)
        .is("push_processed_at", null);
      if (updateError) failed += 1;
      else processed += 1;
      continue;
    }

    const { data: subscriptions, error: subscriptionsError } = await client.from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("owner_id", notification.owner_id);
    if (subscriptionsError) {
      failed += 1;
      continue;
    }

    let deliveryFailed = false;
    for (const subscription of (subscriptions ?? []) as PushSubscriptionRow[]) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({
            title: notification.title,
            body: notification.body,
            tag: notification.id,
            url: new URL("app/notifications", appBaseUrl).toString(),
          }),
          { TTL: 60 * 60 * 24 },
        );
      } catch (error) {
        const status = pushStatus(error);
        if (status === 404 || status === 410) {
          const { error: deleteError } = await client.from("push_subscriptions").delete().eq("id", subscription.id);
          if (deleteError) deliveryFailed = true;
        } else {
          deliveryFailed = true;
        }
      }
    }

    if (deliveryFailed) {
      failed += 1;
      continue;
    }
    const { error: updateError } = await client.from("notifications")
      .update({ push_processed_at: new Date().toISOString() })
      .eq("id", notification.id)
      .is("push_processed_at", null);
    if (updateError) failed += 1;
    else processed += 1;
  }

  return jsonResponse({ processed, failed });
});
