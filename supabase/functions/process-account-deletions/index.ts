import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";
import {
  appleRevocationConfigured,
  decryptAppleRefreshToken,
  revokeAppleRefreshToken,
} from "../_shared/apple.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// Database types are not generated for Edge Functions yet. Use explicit row
// contracts and leave the Supabase client unparameterized to avoid `never`.
type StorageClient = any;
type DeletionRequest = { id: string; user_id: string; attempts: number };
type AppleTokenRow = { encrypted_refresh_token: string };
type AppleRevocationResult = {
  hadAppleIdentity: boolean;
  revoked: boolean;
  error: string | null;
};

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

    const entries = (data ?? []) as Array<{ id?: string | null; name: string }>;
    if (!entries.length) return removed;

    const files: string[] = [];
    const folders: string[] = [];

    for (const entry of entries) {
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
      last_attempt_at: new Date().toISOString(),
      last_error: message,
    })
    .eq("id", requestId);

  if (update.error) {
    console.error("Could not record deletion failure", update.error);
  }
}

async function recordAppleRevocationFailure(
  admin: StorageClient,
  userId: string,
  message: string,
) {
  const audit = await admin.from("audit_logs").insert({
    actor_id: userId,
    action: "apple_revocation_unavailable_during_deletion",
    entity_type: "profile",
    entity_id: userId,
    after_state: { error: message.slice(0, 2000) },
  });
  if (audit.error) console.error("Apple revocation audit failed", audit.error);
}

async function revokeAppleIdentity(
  admin: StorageClient,
  userId: string,
): Promise<AppleRevocationResult> {
  try {
    const userResult = await admin.auth.admin.getUserById(userId);
    if (userResult.error) throw userResult.error;

    const hasAppleIdentity = Boolean(
      userResult.data.user?.identities?.some(
        (identity: { provider?: string }) => identity.provider === "apple",
      ),
    );
    if (!hasAppleIdentity) {
      return { hadAppleIdentity: false, revoked: false, error: null };
    }

    if (!appleRevocationConfigured()) {
      throw new Error("Sign in with Apple revocation secrets are not configured");
    }

    const tokenResult = await admin
      .from("apple_revocation_tokens")
      .select("encrypted_refresh_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (tokenResult.error) throw tokenResult.error;
    const tokenRow = tokenResult.data as AppleTokenRow | null;
    if (!tokenRow?.encrypted_refresh_token) {
      throw new Error("Apple account revocation authorization is unavailable");
    }

    const refreshToken = await decryptAppleRefreshToken(
      tokenRow.encrypted_refresh_token,
    );
    await revokeAppleRefreshToken(refreshToken);

    const deletion = await admin
      .from("apple_revocation_tokens")
      .delete()
      .eq("user_id", userId);
    if (deletion.error) throw deletion.error;

    return { hadAppleIdentity: true, revoked: true, error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Apple revocation failed";
    console.error("Apple revocation was unavailable; deletion will continue", {
      userId,
      error: message,
    });
    await recordAppleRevocationFailure(admin, userId, message);
    return { hadAppleIdentity: true, revoked: false, error: message };
  }
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

  const admin: StorageClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const requestResult = await admin
    .from("account_deletion_requests")
    .select("id,user_id,attempts")
    .is("cancelled_at", null)
    .is("completed_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .lt("attempts", 10)
    .order("scheduled_for", { ascending: true })
    .limit(25);

  if (requestResult.error) {
    return json({ error: requestResult.error.message }, 500);
  }
  const requests = (requestResult.data ?? []) as DeletionRequest[];

  let completed = 0;
  const failures: Array<{ userId: string; error: string }> = [];

  for (const item of requests) {
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

      const appleRevocation = await revokeAppleIdentity(admin, item.user_id);

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
        appleRevocation,
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
