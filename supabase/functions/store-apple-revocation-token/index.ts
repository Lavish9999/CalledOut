import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";
import {
  encryptAppleRefreshToken,
  exchangeAppleAuthorizationCode,
} from "../_shared/apple.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Required Supabase secrets are missing");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const authorizationCode = body?.authorizationCode;
    if (typeof authorizationCode !== "string" || !authorizationCode.trim()) {
      return json({ error: "authorizationCode is required" }, 400);
    }

    const refreshToken = await exchangeAppleAuthorizationCode(
      authorizationCode.trim(),
    );
    const encryptedRefreshToken = await encryptAppleRefreshToken(refreshToken);

    const upsert = await admin.from("apple_revocation_tokens").upsert(
      {
        user_id: user.id,
        encrypted_refresh_token: encryptedRefreshToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (upsert.error) throw upsert.error;

    return json({ ok: true });
  } catch (error) {
    console.error("store-apple-revocation-token failed", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not prepare Apple account revocation",
      },
      500,
    );
  }
});
