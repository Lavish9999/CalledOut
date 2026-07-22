import { useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  Button,
  Card,
  EmptyState,
  Field,
  Header,
  Loading,
  Screen,
  Text,
} from "../../../components/ui";
import {
  castProofReviewVote,
  getProofReview,
} from "../../../features/proofs/review";
import { queryClient, qk } from "../../../lib/query";
import { shortDateLabel, timeLabel } from "../../../lib/date";
import { colors, radius, spacing } from "../../../theme/tokens";

export default function CircleProofReviewScreen() {
  const { submissionId } = useLocalSearchParams<{ submissionId: string }>();
  const [reason, setReason] = useState("");

  const query = useQuery({
    queryKey: ["proof-review", submissionId],
    queryFn: () => getProofReview(submissionId),
    enabled: Boolean(submissionId),
  });

  const mutation = useMutation({
    mutationFn: (vote: "accept" | "reject") =>
      castProofReviewVote({
        submissionId,
        vote,
        reason,
      }),
    onSuccess: async (_, vote) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["proof-review", submissionId],
        }),
        queryClient.invalidateQueries({
          queryKey: qk.circle(query.data?.circleId ?? ""),
        }),
        queryClient.invalidateQueries({ queryKey: qk.circles }),
      ]);

      Alert.alert(
        "Vote recorded",
        vote === "accept"
          ? "Your approval was recorded. CalledOut will finalize the proof when the circle threshold is reached."
          : "Your rejection was recorded with the review note.",
        [{ text: "Done", onPress: router.back }],
        { cancelable: false },
      );
    },
  });

  if (query.isLoading) {
    return (
      <Screen>
        <Header title="Review proof" backLabel="Circle" onBack={router.back} />
        <Loading />
      </Screen>
    );
  }

  if (query.error || !query.data) {
    return (
      <Screen>
        <Header title="Review proof" backLabel="Circle" onBack={router.back} />
        <EmptyState
          title="Proof unavailable"
          body={
            query.error?.message ??
            "This proof may already be decided or may not belong to your circle."
          }
          action={<Button title="Go back" onPress={router.back} />}
        />
      </Screen>
    );
  }

  const proof = query.data;
  const alreadyVoted = proof.myVote !== null;
  const awaitingReview = proof.status === "circle_review";

  return (
    <Screen>
      <Header
        eyebrow="HUMAN REVIEW"
        title={proof.commitmentTitle}
        subtitle={`${proof.memberName} · @${proof.memberUsername} · ${proof.circleName}`}
        backLabel="Circle"
        onBack={router.back}
      />

      <Card style={{ gap: spacing.sm }}>
        <Text variant="bodyStrong">Review only what the promise requires</Text>
        <Text style={{ color: colors.textSecondary }}>
          Decide whether the fresh photo reasonably shows the requested prompt
          and a workout environment. Do not judge body shape, ability, clothing,
          disability, or workout intensity.
        </Text>
      </Card>

      <View
        style={{
          overflow: "hidden",
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.dark,
        }}
      >
        <Image
          source={{ uri: proof.assetUrl }}
          contentFit="contain"
          style={{ width: "100%", aspectRatio: 3 / 4 }}
        />
      </View>

      <Card style={{ gap: spacing.sm }}>
        <Text variant="label">REQUESTED PROMPT</Text>
        <Text variant="section">{proof.prompt ?? "No prompt was attached"}</Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          Captured {shortDateLabel(proof.capturedAt)} at {timeLabel(proof.capturedAt)}
          {" · "}deadline {shortDateLabel(proof.deadlineAt)} at {timeLabel(proof.deadlineAt)}
        </Text>
      </Card>

      <Field
        label="Review note"
        value={reason}
        onChangeText={setReason}
        placeholder="Required when rejecting. Describe only what is missing from the prompt or workout environment."
        multiline
        maxLength={500}
        style={{ minHeight: 110, textAlignVertical: "top" }}
      />

      {alreadyVoted ? (
        <Card style={{ backgroundColor: colors.surfaceMuted }}>
          <Text variant="bodyStrong">
            You voted to {proof.myVote === "accept" ? "approve" : "reject"} this proof.
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            You may update your vote while the proof is still awaiting review.
          </Text>
        </Card>
      ) : null}

      {!awaitingReview ? (
        <Card style={{ backgroundColor: colors.surfaceMuted }}>
          <Text variant="bodyStrong">Review closed</Text>
          <Text style={{ color: colors.textSecondary }}>
            This proof has already been decided.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Button
            title="Approve proof"
            loading={mutation.isPending}
            disabled={mutation.isPending}
            onPress={() => mutation.mutate("accept")}
          />
          <Button
            title="Reject proof"
            variant="danger"
            loading={mutation.isPending}
            disabled={mutation.isPending || reason.trim().length < 5}
            onPress={() =>
              Alert.alert(
                "Reject this proof?",
                "The member can retake fresh proof only while the proof window remains open.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Reject proof",
                    style: "destructive",
                    onPress: () => mutation.mutate("reject"),
                  },
                ],
              )
            }
          />
        </View>
      )}

      {mutation.error ? (
        <Text style={{ color: colors.missed }}>{mutation.error.message}</Text>
      ) : null}
    </Screen>
  );
}
