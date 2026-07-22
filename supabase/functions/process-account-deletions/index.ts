import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type StorageClient = ReturnType<typeof createClient>;

async function removeStoragePrefix(
  admin: StorageClient,
  bucket: string,
  prefix: string,
): Promise<number> {
  let removed = 0;

  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      if (error.message.toLowerCase().includes("not found")) return removed;
      throw new Error(`${bucket} listing failed: ${error.message}`);
    }

    if (!data?.length) return removed;

    const files: string[] = [];
    const folders: string[] = [];

    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) files.push(path);
      else folders.push(path);
    }

    for (const folder of folders) {
      removed += await removeStoragePrefix(admin, bucket, folder);
    }

    if (files.length) {
      const deletion = await admin.storage.from(bucket).remove(files);
      if (deletion.error) {
        throw new Error(`${bucket} deletion failed: ${deletion.error.message}`);
      }
      removed += files.length;
    }

    if (!files.length && !folders.length) return removed;
  }
}

async function recordFailure(
  admin: StorageClient,
  requestId: string,
  error: unknown,
) {
  const message =
    error instanceof Error ? error.message.slice(0, 2000) : "Unexpected error";

  const update = await admin
    .from("account_deletion_requests")
    .update({
      attempts: 1,
      last_attempt_at: new Date().toISOString(),
      last_error: message,
    })
    .eq("id", requestId)
    .select("attempts")
    .maybeSingle();

  if (update.error) {
    console.error("Could not record deletion failure", update.error);
    return;
  }

  const attempts = Number(update.data?.attempts ?? 1);
  await admin
    .from("account_deletion_requests")
    .update({ attempts })
    .eq("id", requestId);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("DEADLINE_JOB_SECRET");
  if (!secret || req.headers.get("x-job-secret") !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Required Supabase secrets are missing" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: requests, error } = await admin
    .from("account_deletion_requests")
    .select("id,user_id,attempts")
    .is("cancelled_at", null)
    .is("completed_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .lt("attempts", 10)
    .order("scheduled_for", { ascending: true })
    .limit(25);

  if (error) return json({ error: error.message }, 500);

  let completed = 0;
  const failures: Array<{ userId: string; error: string }> = [];

  for (const item of requests ?? []) {
    try {
      const attemptUpdate = await admin
        .from("account_deletion_requests")
        .update({
          attempts: Number(item.attempts ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", item.id);
      if (attemptUpdate.error) throw attemptUpdate.error;

      const preparation = await admin.rpc("prepare_account_deletion", {
        p_user: item.user_id,
      });
      if (preparation.error) {
        throw new Error(`Deletion preparation failed: ${preparation.error.message}`);
      }

      const proofFiles = await removeStoragePrefix(
        admin,
        "proof-media",
        item.user_id,
      );
      const profileFiles = await removeStoragePrefix(
        admin,
        "profile-media",
        item.user_id,
      );

      const result = await admin.auth.admin.deleteUser(item.user_id, false);
      if (result.error) throw result.error;

      console.info("CalledOut account deleted", {
        userId: item.user_id,
        proofFiles,
        profileFiles,
        preparation: preparation.data,
      });
      completed += 1;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unexpected deletion error";
      console.error("Account deletion failed", {
        userId: item.user_id,
        error: message,
      });
      failures.push({ userId: item.user_id, error: message });
      await recordFailure(admin, item.id, cause);
    }
  }

  return json({
    completed,
    failed: failures.length,
    failures,
    processedAt: new Date().toISOString(),
  });
});
