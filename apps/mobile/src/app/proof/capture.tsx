import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Crypto from "expo-crypto";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { Button, Card, Screen, Text } from "../../components/ui";
import {
  submitProof,
  type ProofVerificationResult,
} from "../../features/proofs/api";
import { analytics } from "../../lib/analytics";
import { enqueueProof } from "../../lib/upload-queue";
import { queryClient, qk } from "../../lib/query";
import { colors, radius, spacing } from "../../theme/tokens";

const prompts = [
  "Hold up two fingers",
  "Give a thumbs-up",
  "Point toward the equipment",
  "Turn your head to the left",
];

type CapturedProof = {
  uri: string;
  capturedAt: string;
  submissionId: string;
};

type LocalResult = ProofVerificationResult | { status: "queued" };

function friendlyProofError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("outside the allowed proof window")) {
    return "The proof window has closed. Return to Today to see the updated promise status.";
  }

  if (message.includes("camera") || message.includes("photo")) {
    return "The photo could not be prepared. Retake it and try again.";
  }

  if (message.includes("restricted")) {
    return "This account cannot submit proof while access is restricted.";
  }

  return "Proof could not be sent right now. Check your connection and try again.";
}

function ResultScreen({
  result,
  onRetake,
  onDone,
}: {
  result: LocalResult;
  onRetake: () => void;
  onDone: () => void;
}) {
  const verified = result.status === "verified";
  const review = result.status === "circle_review";
  const queued = result.status === "queued";
  const needsMore = result.status === "more_proof_required";

  const icon = verified
    ? "checkmark-circle"
    : review
      ? "people-circle"
      : queued
        ? "cloud-offline"
        : "refresh-circle";
  const iconColor = verified
    ? colors.verified
    : needsMore
      ? colors.missed
      : colors.warning;
  const title = verified
    ? "Proof approved"
    : review
      ? "Sent for review"
      : queued
        ? "Saved for retry"
        : "More proof needed";
  const body = verified
    ? "Promise kept. Today and your record will update immediately."
    : review
      ? "Fresh proof was received. A person must review the photo before this promise is marked complete."
      : queued
        ? "The photo is stored for this account on this phone and will retry automatically while it remains eligible."
        : "This capture is missing required proof information. Retake fresh proof before the deadline.";

  return (
    <Screen scroll={false} contentStyle={styles.resultScreen}>
      <View style={styles.resultIcon}>
        <Ionicons name={icon} size={64} color={iconColor} />
      </View>
      <View style={{ gap: spacing.sm, alignItems: "center" }}>
        <Text variant="title" style={{ textAlign: "center" }}>
          {title}
        </Text>
        <Text style={{ color: colors.textSecondary, textAlign: "center" }}>
          {body}
        </Text>
      </View>
      <View style={{ width: "100%", gap: spacing.sm }}>
        {needsMore ? <Button title="Retake proof" onPress={onRetake} /> : null}
        <Button
          title={verified ? "Back to Today" : "Done"}
          variant={needsMore ? "secondary" : "primary"}
          onPress={onDone}
        />
      </View>
    </Screen>
  );
}

export default function Capture() {
  const { commitmentId } = useLocalSearchParams<{ commitmentId: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [captured, setCaptured] = useState<CapturedProof | null>(null);
  const [result, setResult] = useState<LocalResult | null>(null);
  const [error, setError] = useState("");

  const prompt =
    prompts[
      (commitmentId ?? "")
        .split("")
        .reduce((sum, character) => sum + character.charCodeAt(0), 0) %
        prompts.length
    ];

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <Screen>
        <Text variant="title">Camera required</Text>
        <Text>
          CalledOut accepts fresh in-app proof only. Photo-library uploads are
          disabled so the capture is tied to this proof window.
        </Text>
        <Button title="Allow camera" onPress={requestPermission} />
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  async function takePhoto() {
    if (!commitmentId || !camera.current || capturing) return;

    setCapturing(true);
    setError("");

    try {
      analytics.capture("proof_started");
      const photo = await camera.current.takePictureAsync({
        quality: 0.76,
        skipProcessing: false,
      });

      if (!photo) throw new Error("The camera did not return a photo.");

      setCaptured({
        uri: photo.uri,
        capturedAt: new Date().toISOString(),
        submissionId: Crypto.randomUUID(),
      });
    } catch (captureError) {
      console.error("Proof capture failed", captureError);
      setError(friendlyProofError(captureError));
    } finally {
      setCapturing(false);
    }
  }

  async function submitCaptured() {
    if (!commitmentId || !captured || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const verification = await submitProof({
        commitmentId,
        uri: captured.uri,
        prompt,
        promptCompleted: true,
        locationResult: "not_required",
        capturedAt: captured.capturedAt,
        submissionId: captured.submissionId,
      });

      analytics.capture("proof_submitted", { status: verification.status });
      if (verification.status === "verified") {
        analytics.capture("proof_verified");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.today }),
        queryClient.invalidateQueries({
          queryKey: qk.commitment(commitmentId),
        }),
      ]);
      setResult(verification);
    } catch (submissionError) {
      console.error("Proof submission failed", submissionError);

      let savedForRetry = false;
      try {
        await enqueueProof({
          commitmentId,
          uri: captured.uri,
          prompt,
          promptCompleted: true,
          locationResult: "not_required",
          capturedAt: captured.capturedAt,
          submissionId: captured.submissionId,
        });
        savedForRetry = true;
      } catch (queueError) {
        console.error("Could not queue proof", queueError);
      }

      if (savedForRetry) {
        setResult({ status: "queued" });
      } else {
        setError(friendlyProofError(submissionError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function retake() {
    setCaptured(null);
    setResult(null);
    setError("");
  }

  if (result) {
    return (
      <ResultScreen
        result={result}
        onRetake={retake}
        onDone={() => router.replace("/(tabs)" as never)}
      />
    );
  }

  if (captured) {
    return (
      <View style={styles.stage}>
        <Image
          source={{ uri: captured.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <View style={styles.reviewShade} />
        <View style={styles.overlay}>
          <Card style={styles.promptCard}>
            <Text variant="label">REVIEW FRESH PROOF</Text>
            <Text variant="section">{prompt}</Text>
            <Text style={{ color: colors.textSecondary }}>
              Make sure your face, prompt response, and workout environment are
              visible for the reviewer.
            </Text>
          </Card>

          <View style={{ gap: spacing.sm }}>
            {error ? (
              <Card style={{ backgroundColor: colors.surface }}>
                <Text style={{ color: colors.missed }}>{error}</Text>
              </Card>
            ) : null}
            <Button
              title="Submit fresh proof"
              loading={submitting}
              onPress={submitCaptured}
            />
            <Button
              title="Retake"
              variant="secondary"
              disabled={submitting}
              onPress={retake}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stage}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" />
      <View style={styles.cameraShade} />
      <View style={styles.overlay}>
        <Card style={styles.promptCard}>
          <Text variant="label">LIVE PROMPT</Text>
          <Text variant="section">{prompt}</Text>
          <Text style={{ color: colors.textSecondary }}>
            Keep your face, prompt response, and workout environment visible. A
            person may review the photo before the promise is approved.
          </Text>
        </Card>

        <View style={{ gap: spacing.sm }}>
          {error ? (
            <Card style={{ backgroundColor: colors.surface }}>
              <Text style={{ color: colors.missed }}>{error}</Text>
            </Card>
          ) : null}
          <Button title="Take photo" loading={capturing} onPress={takePhoto} />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => router.back()}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    backgroundColor: colors.dark,
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    padding: spacing.lg,
    paddingTop: 72,
    paddingBottom: 48,
  },
  promptCard: {
    backgroundColor: "rgba(255,255,255,.95)",
    borderRadius: radius.lg,
  },
  cameraShade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,.12)",
  },
  reviewShade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,.28)",
  },
  resultScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
  },
  resultIcon: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
});
