import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// Edge Functions do not yet consume a generated Database type. Explicit row
// contracts keep Deno strict checking useful without allowing SDK `never`
// inference to leak into application logic.
type AdminClient = any;
type CircleMemberRow = { user_id: string };
type BlockRow = { blocker_id: string; blocked_id: string };

type CommitmentRecord = {
  id: string;
  user_id: string;
  circle_id: string | null;
  title: string;
  proof_window_starts_at: string;
  deadline_at: string;
  grace_period_minutes: number;
  requires_location: boolean;
};

type ProofRecord = {
  id: string;
  commitment_id: string;
  status: string;
  verification_score: number | null;
  captured_at: string;
  received_at: string;
  capture_source: string;
  liveness_completed: boolean;
  liveness_prompt: string | null;
  asset_path: string | null;
  location_result: string;
  commitment: CommitmentRecord | CommitmentRecord[] | null;
};

async function notifyCircleReviewers(
  admin: AdminClient,
  commitment: CommitmentRecord,
  submissionId: string,
) {
  if (!commitment.circle_id) return;

  const [membersResult, blocksResult] = await Promise.all([
    admin
      .from("circle_members")
      .select("user_id")
      .eq("circle_id", commitment.circle_id)
      .eq("status", "active")
      .is("deleted_at", null)
      .neq("user_id", commitment.user_id),
    admin
      .from("blocks")
      .select("blocker_id,blocked_id")
      .or(
        `blocker_id.eq.${commitment.user_id},blocked_id.eq.${commitment.user_id}`,
      ),
  ]);

  if (membersResult.error) throw membersResult.error;
  if (blocksResult.error) throw blocksResult.error;

  const members = (membersResult.data ?? []) as CircleMemberRow[];
  const blocks = (blocksResult.data ?? []) as BlockRow[];
  const blockedUsers = new Set<string>();

  for (const block of blocks) {
    if (block.blocker_id === commitment.user_id) {
      blockedUsers.add(block.blocked_id);
    } else if (block.blocked_id === commitment.user_id) {
      blockedUsers.add(block.blocker_id);
    }
  }

  const recipients = members
    .map((member: CircleMemberRow) => member.user_id)
    .filter((userId: string) => !blockedUsers.has(userId));

  await Promise.all(
    recipients.map(async (reviewerId: string) => {
      const queued = await admin.rpc("queue_user_notification", {
        p_user: reviewerId,
        p_category: "review_required",
        p_title: "Fresh proof needs review",
        p_body: `${commitment.title} is waiting for a fair prompt and workout check.`,
        p_data: {
          route: `/circle/review/${submissionId}`,
          submission_id: submissionId,
          commitment_id: commitment.id,
          circle_id: commitment.circle_id,
        },
        p_dedupe_key: `proof-review:${submissionId}:${reviewerId}`,
        p_deliver_after: new Date().toISOString(),
      });

      if (queued.error) {
        console.error("Could not queue proof-review notification", {
          reviewerId,
          error: queued.error,
        });
      }
    }),
  );
}

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Missing authorization token" }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Required Supabase function secrets are missing");
    }

    const admin: AdminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !user) {
      console.error("Proof auth failed", userError);
      return json({ error: userError?.message ?? "Unauthorized" }, 401);
    }

    const requestBody = (await req.json()) as { submissionId?: unknown };
    const submissionId = requestBody.submissionId;

    if (!submissionId || typeof submissionId !== "string") {
      return json({ error: "submissionId is required" }, 400);
    }

    const profileResult = await admin
      .from("profiles")
      .select("account_status")
      .eq("id", user.id)
      .single();
    const profile = profileResult.data as { account_status?: string } | null;

    if (profileResult.error || profile?.account_status !== "active") {
      return json({ error: "This CalledOut account is restricted" }, 403);
    }

    const proofResult = await admin
      .from("proof_submissions")
      .select("*, commitment:commitments(*)")
      .eq("id", submissionId)
      .eq("user_id", user.id)
      .single();
    const proof = proofResult.data as ProofRecord | null;

    if (proofResult.error || !proof) {
      console.error("Proof lookup failed", proofResult.error);
      return json(
        { error: proofResult.error?.message ?? "Proof not found" },
        404,
      );
    }

    if (proof.status === "verified") {
      return json({
        status: "verified",
        score: proof.verification_score,
        explanation: "This proof was already approved.",
      });
    }

    if (proof.status === "circle_review" || proof.status === "disputed") {
      return json({
        status: "circle_review",
        score: null,
        explanation: "This proof is already awaiting human review.",
      });
    }

    if (proof.status === "rejected") {
      return json({
        status: "more_proof_required",
        score: null,
        explanation:
          "This proof was rejected. Retake fresh proof before the deadline.",
      });
    }

    const commitment = Array.isArray(proof.commitment)
      ? (proof.commitment[0] ?? null)
      : proof.commitment;
    if (!commitment) {
      return json({ error: "Commitment data was not found" }, 404);
    }

    const now = Date.now();
    const capturedAt = new Date(proof.captured_at).getTime();
    const receivedAt = new Date(proof.received_at).getTime();
    const windowStartsAt = new Date(
      commitment.proof_window_starts_at,
    ).getTime();
    const deadlineAt =
      new Date(commitment.deadline_at).getTime() +
      Number(commitment.grace_period_minutes ?? 0) * 60_000;

    const signals = {
      inAppCamera: proof.capture_source === "in_app_camera",
      captureTimestampValid:
        Number.isFinite(capturedAt) &&
        capturedAt <= now + 5 * 60_000 &&
        capturedAt <= receivedAt + 5 * 60_000,
      withinWindow: capturedAt >= windowStartsAt && capturedAt <= deadlineAt,
      promptAttached: Boolean(
        proof.liveness_completed &&
          typeof proof.liveness_prompt === "string" &&
          proof.liveness_prompt.trim(),
      ),
      assetAttached:
        typeof proof.asset_path === "string" && proof.asset_path.length > 0,
      locationReady:
        !commitment.requires_location ||
        proof.location_result === "within_approved_location",
    };

    const checks = [
      ["in_app_capture", signals.inAppCamera],
      ["capture_timestamp", signals.captureTimestampValid],
      ["submission_window", signals.withinWindow],
      ["prompt_attached", signals.promptAttached],
      ["asset_attached", signals.assetAttached],
      ["location_ready", signals.locationReady],
    ] as const;

    const checksUpsert = await admin.from("verification_checks").upsert(
      checks.map(([checkType, passed]) => ({
        proof_submission_id: submissionId,
        check_type: checkType,
        passed,
        points_awarded: 0,
        details: {
          automated: true,
          purpose: "submission_readiness_only",
        },
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "proof_submission_id,check_type" },
    );

    if (checksUpsert.error) {
      throw new Error(
        `Verification checks failed: ${checksUpsert.error.message}`,
      );
    }

    const readyForHumanReview = Object.values(signals).every(Boolean);
    const decision = readyForHumanReview
      ? "circle_review"
      : "more_proof_required";
    const storedProofStatus = readyForHumanReview
      ? "circle_review"
      : "rejected";
    const decidedAt = readyForHumanReview ? null : new Date().toISOString();

    const proofUpdate = await admin
      .from("proof_submissions")
      .update({
        status: storedProofStatus,
        verification_score: null,
        decided_at: decidedAt,
      })
      .eq("id", submissionId);

    if (proofUpdate.error) {
      throw new Error(`Proof update failed: ${proofUpdate.error.message}`);
    }

    const commitmentUpdate = await admin
      .from("commitments")
      .update({
        status: readyForHumanReview ? "under_review" : "rejected",
        verified_at: null,
      })
      .eq("id", proof.commitment_id);

    if (commitmentUpdate.error) {
      throw new Error(
        `Commitment update failed: ${commitmentUpdate.error.message}`,
      );
    }

    if (readyForHumanReview) {
      await notifyCircleReviewers(admin, commitment, submissionId).catch(
        (notificationError: unknown) => {
          console.error("Proof review notification failed", notificationError);
        },
      );
    }

    const auditInsert = await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "proof_submission_readiness_checked",
      entity_type: "proof_submission",
      entity_id: submissionId,
      after_state: {
        decision,
        stored_proof_status: storedProofStatus,
        signals,
      },
    });

    if (auditInsert.error) {
      console.error("Audit log failed", auditInsert.error);
    }

    return json({
      status: decision,
      score: null,
      explanation: readyForHumanReview
        ? commitment.circle_id
          ? "Fresh proof was received and circle reviewers were notified."
          : "Fresh proof was received and is awaiting authorized review."
        : "This capture is missing required proof metadata. Retake fresh proof before the deadline.",
    });
  } catch (error) {
    console.error("verify-proof failed", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected verification error",
      },
      500,
    );
  }
});
