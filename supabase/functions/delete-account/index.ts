import { createClient } from "npm:@supabase/supabase-js@2";
import { getAuthorizedUser, isResponse } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const privateBuckets = ["contract-documents", "contract-attachments", "ocr-private"];
const pageSize = 100;

async function collectUserFiles(
  listPage: (
    bucket: string,
    prefix: string,
    offset: number,
  ) => Promise<{ data: Array<{ id?: string | null; name: string }> | null; error: unknown }>,
  bucket: string,
  userId: string,
) {
  const paths: string[] = [];

  async function visit(prefix: string): Promise<void> {
    let offset = 0;
    while (true) {
      const { data, error } = await listPage(bucket, prefix, offset);
      if (error) throw new Error("Could not enumerate private files for account deletion.");
      if (!data?.length) return;

      for (const entry of data) {
        const path = `${prefix}/${entry.name}`;
        if (entry.id) paths.push(path);
        else await visit(path);
      }
      if (data.length < pageSize) return;
      offset += data.length;
    }
  }

  await visit(userId);
  return paths;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const auth = await getAuthorizedUser(request);
  if (isResponse(auth)) return auth;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    return jsonResponse({ error: "Account deletion is not configured for this project." }, 503);
  }
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    for (const bucket of privateBuckets) {
      const paths = await collectUserFiles(
        (targetBucket, prefix, offset) => admin.storage.from(targetBucket).list(prefix, {
          limit: pageSize,
          offset,
          sortBy: { column: "name", order: "asc" },
        }),
        bucket,
        auth.user.id,
      );
      for (let offset = 0; offset < paths.length; offset += pageSize) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(offset, offset + pageSize));
        if (error) throw new Error("Could not remove private files for account deletion.");
      }
    }
  } catch {
    return jsonResponse({ error: "Private files could not be removed. The account was not deleted; try again or contact support." }, 500);
  }

  const { error } = await admin.auth.admin.deleteUser(auth.user.id);
  if (error) {
    return jsonResponse({ error: "Private files were removed, but the account could not be deleted. Retry the request or contact support." }, 500);
  }
  return jsonResponse({ deleted: true });
});
