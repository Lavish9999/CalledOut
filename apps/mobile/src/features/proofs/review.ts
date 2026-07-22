import { supabase } from "../../lib/supabase";

export type ProofReviewDetail = {
  id: string;
  status: string;
  capturedAt: string;
  prompt: string | null;
  assetUrl: string;
  commitmentId: string;
  commitmentTitle: string;
  deadlineAt: string;
  circleId: string;
  circleName: string;
  memberId: string;
  memberName: string;
  memberUsername: string;
  myVote: "accept" | "reject" | null;
};

export async function getProofReview(
  submissionId: string,
): Promise<ProofReviewDetail> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to review proof.");

  const proofResult = await supabase
    .from("proof_submissions")
    .select(
      "id,status,captured_at,liveness_prompt,asset_path,commitment_id,user_id",
    )
    .eq("id", submissionId)
    .is("deleted_at", null)
    .single();
  if (proofResult.error) throw proofResult.error;

  if (proofResult.data.user_id === user.id) {
    throw new Error("You cannot review your own proof.");
  }

  const commitmentResult = await supabase
    .from("commitments")
    .select("id,title,deadline_at,circle_id")
    .eq("id", proofResult.data.commitment_id)
    .is("deleted_at", null)
    .single();
  if (commitmentResult.error) throw commitmentResult.error;
  if (!commitmentResult.data.circle_id) {
    throw new Error("This proof is not attached to a reviewable circle.");
  }

  const [profileResult, circleResult, voteResult, signedResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name,username")
        .eq("id", proofResult.data.user_id)
        .single(),
      supabase
        .from("circles")
        .select("name")
        .eq("id", commitmentResult.data.circle_id)
        .single(),
      supabase
        .from("verification_votes")
        .select("vote")
        .eq("proof_submission_id", submissionId)
        .eq("voter_id", user.id)
        .maybeSingle(),
      supabase.storage
        .from("proof-media")
        .createSignedUrl(proofResult.data.asset_path, 10 * 60),
    ]);

  if (profileResult.error) throw profileResult.error;
  if (circleResult.error) throw circleResult.error;
  if (voteResult.error) throw voteResult.error;
  if (signedResult.error) throw signedResult.error;

  return {
    id: proofResult.data.id,
    status: proofResult.data.status,
    capturedAt: proofResult.data.captured_at,
    prompt: proofResult.data.liveness_prompt,
    assetUrl: signedResult.data.signedUrl,
    commitmentId: commitmentResult.data.id,
    commitmentTitle: commitmentResult.data.title,
    deadlineAt: commitmentResult.data.deadline_at,
    circleId: commitmentResult.data.circle_id,
    circleName: circleResult.data.name,
    memberId: proofResult.data.user_id,
    memberName: profileResult.data.display_name,
    memberUsername: profileResult.data.username,
    myVote:
      voteResult.data?.vote === "accept" || voteResult.data?.vote === "reject"
        ? voteResult.data.vote
        : null,
  };
}

export async function castProofReviewVote(input: {
  submissionId: string;
  vote: "accept" | "reject";
  reason?: string;
}) {
  const { error } = await supabase.rpc("cast_verification_vote", {
    p_submission: input.submissionId,
    p_vote: input.vote,
    p_reason: input.reason?.trim() || null,
  });

  if (error) throw error;
}
