import { supabase } from "../../lib/supabase";

export type ProofReviewSummary = {
  id: string;
  capturedAt: string;
  prompt: string | null;
  commitmentTitle: string;
  circleId: string;
  circleName: string;
  memberName: string;
  memberUsername: string;
  myVote: "accept" | "reject" | null;
};

export type ProofReviewDetail = ProofReviewSummary & {
  status: string;
  assetUrl: string;
  commitmentId: string;
  deadlineAt: string;
  memberId: string;
};

async function requireUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Sign in to review proof.");
  return user;
}

export async function getPendingCircleProofReviews(): Promise<
  ProofReviewSummary[]
> {
  const user = await requireUser();

  const proofResult = await supabase
    .from("proof_submissions")
    .select("id,commitment_id,user_id,captured_at,liveness_prompt")
    .eq("status", "circle_review")
    .neq("user_id", user.id)
    .is("deleted_at", null)
    .order("captured_at", { ascending: true })
    .limit(50);
  if (proofResult.error) throw proofResult.error;
  if (!proofResult.data?.length) return [];

  const commitmentIds = [
    ...new Set(proofResult.data.map((proof) => proof.commitment_id)),
  ];
  const userIds = [...new Set(proofResult.data.map((proof) => proof.user_id))];
  const proofIds = proofResult.data.map((proof) => proof.id);

  const [commitmentResult, profileResult, voteResult] = await Promise.all([
    supabase
      .from("commitments")
      .select("id,title,circle_id")
      .in("id", commitmentIds)
      .not("circle_id", "is", null)
      .is("deleted_at", null),
    supabase
      .from("profiles")
      .select("id,display_name,username")
      .in("id", userIds),
    supabase
      .from("verification_votes")
      .select("proof_submission_id,vote")
      .in("proof_submission_id", proofIds)
      .eq("voter_id", user.id),
  ]);

  if (commitmentResult.error) throw commitmentResult.error;
  if (profileResult.error) throw profileResult.error;
  if (voteResult.error) throw voteResult.error;

  const circleIds = [
    ...new Set(
      (commitmentResult.data ?? [])
        .map((commitment) => commitment.circle_id)
        .filter((circleId): circleId is string => Boolean(circleId)),
    ),
  ];
  if (!circleIds.length) return [];

  const circleResult = await supabase
    .from("circles")
    .select("id,name")
    .in("id", circleIds)
    .is("deleted_at", null);
  if (circleResult.error) throw circleResult.error;

  const commitments = new Map(
    (commitmentResult.data ?? []).map((commitment) => [
      commitment.id,
      commitment,
    ]),
  );
  const profiles = new Map(
    (profileResult.data ?? []).map((profile) => [profile.id, profile]),
  );
  const circles = new Map(
    (circleResult.data ?? []).map((circle) => [circle.id, circle]),
  );
  const votes = new Map(
    (voteResult.data ?? []).map((vote) => [
      vote.proof_submission_id,
      vote.vote,
    ]),
  );

  return proofResult.data.flatMap((proof) => {
    const commitment = commitments.get(proof.commitment_id);
    const profile = profiles.get(proof.user_id);
    const circle = commitment?.circle_id
      ? circles.get(commitment.circle_id)
      : null;

    if (!commitment?.circle_id || !profile || !circle) return [];

    const vote = votes.get(proof.id);
    return [
      {
        id: proof.id,
        capturedAt: proof.captured_at,
        prompt: proof.liveness_prompt,
        commitmentTitle: commitment.title,
        circleId: commitment.circle_id,
        circleName: circle.name,
        memberName: profile.display_name,
        memberUsername: profile.username,
        myVote: vote === "accept" || vote === "reject" ? vote : null,
      },
    ];
  });
}

export async function getProofReview(
  submissionId: string,
): Promise<ProofReviewDetail> {
  const user = await requireUser();

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
  if (!proofResult.data.asset_path) {
    throw new Error("The proof image is unavailable.");
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
