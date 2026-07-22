import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";

import { supabase } from "../../lib/supabase";

export type ProofVerificationResult = {
  status: "verified" | "circle_review" | "more_proof_required";
  score?: number | null;
  explanation?: string;
};

export type ProofInput = {
  commitmentId: string;
  uri: string;
  prompt: string;
  promptCompleted: boolean;
  locationResult:
    | "within_approved_location"
    | "outside_approved_location"
    | "unavailable"
    | "not_required";
  capturedAt: string;
  submissionId?: string;
};

export async function submitProof(
  input: ProofInput,
): Promise<ProofVerificationResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const submissionId = input.submissionId ?? Crypto.randomUUID();

  const existing = await supabase
    .from("proof_submissions")
    .select("id,status")
    .eq("id", submissionId)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    if (existing.data.status === "processing") {
      const result = await supabase.functions.invoke("verify-proof", {
        body: { submissionId: existing.data.id },
      });

      if (result.error) {
        throw result.error;
      }

      return result.data as ProofVerificationResult;
    }

    const existingStatus =
      existing.data.status === "rejected"
        ? "more_proof_required"
        : existing.data.status;

    return {
      status: existingStatus as ProofVerificationResult["status"],
    };
  }

  const base64 = await FileSystem.readAsStringAsync(input.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const storagePath = `${user.id}/${submissionId}.jpg`;

  const bytes = Uint8Array.from(atob(base64), (character) =>
    character.charCodeAt(0),
  );

  const fileBody = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  const upload = await supabase.storage
    .from("proof-media")
    .upload(storagePath, fileBody, {
      contentType: "image/jpeg",
      upsert: false,
    });

  const uploadedNewFile = !upload.error;

  if (upload.error) {
    const message = upload.error.message.toLowerCase();

    const fileAlreadyExists =
      message.includes("already exists") || message.includes("duplicate");

    if (!fileAlreadyExists) {
      throw upload.error;
    }
  }

  const creation = await supabase.rpc("create_proof_submission", {
    p_id: submissionId,
    p_commitment_id: input.commitmentId,
    p_captured_at: input.capturedAt,
    p_liveness_prompt: input.prompt,
    p_liveness_completed: input.promptCompleted,
    p_location_result: input.locationResult,
    p_asset_path: storagePath,
    p_client_submission_key: submissionId,
  });

  if (creation.error) {
    if (uploadedNewFile) {
      await supabase.storage.from("proof-media").remove([storagePath]);
    }
    throw creation.error;
  }

  const effectiveSubmissionId =
    typeof creation.data === "string" ? creation.data : submissionId;

  const result = await supabase.functions.invoke("verify-proof", {
    body: { submissionId: effectiveSubmissionId },
  });

  if (result.error) {
    throw result.error;
  }

  return result.data as ProofVerificationResult;
}
