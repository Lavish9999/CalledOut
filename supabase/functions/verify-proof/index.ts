import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

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

    const admin = createClient(supabaseUrl, serviceRoleKey, {
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

    const requestBody = await req.json();
    const submissionId = requestBody?.submissionId;

    if (!submissionId || typeof submissionId !== "string") {
      return json({ error: "submissionId is required" }, 400);
    }

    const { data: proof, error: proofError } = await admin
      .from("proof_submissions")
      .select("*, commitment:commitments(*)")
      .eq("id", submissionId)
      .eq("user_id", user.id)
      .single();

    if (proofError || !proof) {
      console.error("Proof lookup failed", proofError);
      return json({ error: proofError?.message ?? "Proof not found" }, 404);
    }

    if (proof.status === "verified") {
      return json({
        status: proof.status,
        score: proof.verification_score,
        explanation: "This proof was already verified.",
      });
    }

    const commitment = proof.commitment;
    if (!commitment) {
      return json({ error: "Commitment data was not found" }, 404);
    }

    const now = Date.now();
    const capturedAt = new Date(proof.captured_at).getTime();
    const windowStartsAt = new Date(
      commitment.proof_window_starts_at,
    ).getTime();
    const deadlineAt =
      new Date(commitment.deadline_at).getTime() +
      Number(commitment.grace_period_minutes ?? 0) * 60_000;

    const signals = {
      freshCapture:
        proof.capture_source === "in_app_camera" &&
        Math.abs(now - capturedAt) < 15 * 60_000,
      liveness: Boolean(proof.liveness_completed && proof.liveness_prompt),
      withinWindow: capturedAt >= windowStartsAt && capturedAt <= deadlineAt,
      locationMatch:
        !commitment.requires_location ||
        proof.location_result === "within_approved_location",
      healthMatch: false,
      integrityClean: true,
    };

    const checks = [
      ["fresh_capture", signals.freshCapture, 25],
      ["liveness_prompt", signals.liveness, 20],
      ["submission_window", signals.withinWindow, 15],
      ["location_match", signals.locationMatch, 15],
      ["health_or_wearable", signals.healthMatch, 15],
      ["integrity_and_duplicate", signals.integrityClean, 10],
    ] as const;

    const score = checks.reduce(
      (total, [, passed, points]) => total + (passed ? points : 0),
      0,
    );

    const decision =
      score >= 70
        ? "verified"
        : score >= 45
          ? "circle_review"
          : "more_proof_required";
    const storedProofStatus =
      decision === "more_proof_required" ? "rejected" : decision;

    const checksUpsert = await admin.from("verification_checks").upsert(
      checks.map(([checkType, passed, points]) => ({
        proof_submission_id: submissionId,
        check_type: checkType,
        passed,
        points_awarded: passed ? points : 0,
        details: { automated: true },
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "proof_submission_id,check_type" },
    );

    if (checksUpsert.error) {
      throw new Error(
        `Verification checks failed: ${checksUpsert.error.message}`,
      );
    }

    const decidedAt =
      decision === "verified" || decision === "more_proof_required"
        ? new Date().toISOString()
        : null;

    const proofUpdate = await admin
      .from("proof_submissions")
      .update({
        status: storedProofStatus,
        verification_score: score,
        decided_at: decidedAt,
      })
      .eq("id", submissionId);

    if (proofUpdate.error) {
      throw new Error(`Proof update failed: ${proofUpdate.error.message}`);
    }

    const commitmentStatus =
      decision === "verified"
        ? "verified"
        : decision === "circle_review"
          ? "under_review"
          : "rejected";

    const commitmentUpdate = await admin
      .from("commitments")
      .update({
        status: commitmentStatus,
        verified_at: decision === "verified" ? decidedAt : null,
      })
      .eq("id", proof.commitment_id);

    if (commitmentUpdate.error) {
      throw new Error(
        `Commitment update failed: ${commitmentUpdate.error.message}`,
      );
    }

    if (decision === "verified") {
      const { data: redemptionCommitment, error: redemptionLookupError } =
        await admin
          .from("redemptions")
          .select("id")
          .eq("redemption_commitment_id", proof.commitment_id)
          .is("deleted_at", null)
          .maybeSingle();

      if (redemptionLookupError) {
        throw new Error(
          `Redemption lookup failed: ${redemptionLookupError.message}`,
        );
      }

      // Redemption completion has its own trigger-generated activity event.
      // Skipping the generic proof event prevents duplicate timeline entries.
      if (!redemptionCommitment) {
        const activityUpsert = await admin.from("activity_events").upsert(
          {
            actor_id: user.id,
            circle_id: commitment.circle_id,
            commitment_id: proof.commitment_id,
            proof_submission_id: submissionId,
            event_type: "proof_verified",
            payload: { title: commitment.title },
          },
          { onConflict: "proof_submission_id,event_type" },
        );

        if (activityUpsert.error) {
          throw new Error(
            `Activity creation failed: ${activityUpsert.error.message}`,
          );
        }
      }
    }

    const auditInsert = await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "proof_verification_decision",
      entity_type: "proof_submission",
      entity_id: submissionId,
      after_state: {
        decision,
        stored_proof_status: storedProofStatus,
        score,
        signals,
      },
    });

    if (auditInsert.error) {
      console.error("Audit log failed", auditInsert.error);
    }

    return json({
      status: decision,
      score,
      explanation:
        decision === "more_proof_required"
          ? "This capture did not pass enough automated checks. A fresh retake is allowed before the deadline."
          : "Automated checks are not infallible. Circle review and disputes remain available.",
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
