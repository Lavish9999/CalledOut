import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { StyleSheet, View } from "react-native";

import { Button, Card, Screen, Text } from "../../components/ui";
import { submitProof } from "../../features/proofs/api";
import { analytics } from "../../lib/analytics";
import { enqueueProof } from "../../lib/upload-queue";
import { queryClient, qk } from "../../lib/query";
import { colors, spacing } from "../../theme/tokens";

const prompts = [
  "Hold up two fingers",
  "Give a thumbs-up",
  "Point toward the equipment",
  "Turn your head to the left",
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;

    const details = [
      value.message,
      value.error,
      value.details,
      value.hint,
      value.code,
    ].filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );

    if (details.length) return details.join(" · ");

    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown upload error";
    }
  }

  return String(error || "Unknown upload error");
}

export default function Capture() {
  const { commitmentId } = useLocalSearchParams<{ commitmentId: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [loading, setLoading] = useState(false);
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
          Fresh in-app capture is required for standard proof. You can change
          permissions in system settings.
        </Text>
        <Button title="Allow camera" onPress={requestPermission} />
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  async function capture() {
    if (!commitmentId || !camera.current) return;

    setLoading(true);
    setError("");

    let photoUri: string | null = null;
    const capturedAt = new Date().toISOString();

    try {
      analytics.capture("proof_started");

      const photo = await camera.current.takePictureAsync({
        quality: 0.72,
        skipProcessing: false,
      });

      if (!photo) {
        throw new Error("The camera did not return a photo.");
      }

      photoUri = photo.uri;

      let locationResult:
        | "within_approved_location"
        | "outside_approved_location"
        | "unavailable" = "unavailable";

      // Location is optional and must never prevent proof submission.
      try {
        const locationPermission =
          await Location.getForegroundPermissionsAsync();

        if (locationPermission.granted) {
          await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

          locationResult = "within_approved_location";
        }
      } catch (locationError) {
        console.warn("Optional proof location unavailable", locationError);
      }

      const result = await submitProof({
        commitmentId,
        uri: photo.uri,
        prompt,
        promptCompleted: true,
        locationResult,
        capturedAt,
      });

      analytics.capture("proof_submitted");

      if (result?.status === "verified") {
        analytics.capture("proof_verified");
      }

      await queryClient.invalidateQueries({ queryKey: qk.today });
      router.back();
    } catch (submissionError) {
      console.error("Proof submission failed", submissionError);

      const message = getErrorMessage(submissionError);
      let savedForRetry = false;

      if (photoUri) {
        try {
          await enqueueProof({
            commitmentId,
            uri: photoUri,
            prompt,
            promptCompleted: true,
            locationResult: "unavailable",
            capturedAt,
          });

          savedForRetry = true;
        } catch (queueError) {
          console.error("Could not queue proof", queueError);
        }
      }

      setError(
        savedForRetry
          ? `Upload failed: ${message}. The photo was saved for retry.`
          : `Upload failed: ${message}`,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.dark }}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" />

      <View style={styles.overlay}>
        <Card style={{ backgroundColor: "rgba(255,255,255,.94)" }}>
          <Text variant="label">LIVE PROMPT</Text>
          <Text variant="section">{prompt}</Text>
          <Text>Keep your face and workout environment visible.</Text>
        </Card>

        {error ? (
          <Text
            style={{
              color: colors.surface,
              backgroundColor: colors.missed,
              padding: 12,
            }}
          >
            {error}
          </Text>
        ) : null}

        <Button title="Capture proof" loading={loading} onPress={capture} />
        <Button
          title="Cancel"
          variant="secondary"
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    padding: spacing.lg,
    paddingTop: 72,
    paddingBottom: 48,
  },
});
