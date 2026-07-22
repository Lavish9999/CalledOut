import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button, Card, StatusPill, Text } from "./ui";
import { colors, spacing } from "../theme/tokens";
import type {
  Commitment,
  RedemptionLink,
  RedemptionStatus,
} from "../types/domain";
import { deadlineLabel, timeLabel } from "../lib/date";
import { getPlanOverview } from "../features/subscription/api";
import { consumeGracePass } from "../features/commitments/api";
import { queryClient, qk } from "../lib/query";

const processingStatuses = new Set(["proof_submitted", "under_review"]);

export function CommitmentCard({ item }: { item: Commitment }) {
  const planQuery = useQuery({ queryKey: qk.plan, queryFn: getPlanOverview });
  const graceMutation = useMutation({
    mutationFn: (action: "extend" | "excuse") =>
      consumeGracePass(item.id, action),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.today }),
        queryClient.invalidateQueries({ queryKey: qk.plan }),
        queryClient.invalidateQueries({ queryKey: qk.commitment(item.id) }),
      ]);
    },
    onError: (error) => {
      Alert.alert(
        "Grace pass unavailable",
        error instanceof Error ? error.message : "Please try again.",
      );
    },
  });
  const proofWindowOpen = item.status === "proof_window_open";
  const canRetryRejected =
    item.status === "rejected" && new Date(item.deadline_at) > new Date();
  const gracePassesRemaining = planQuery.data?.gracePassesRemaining ?? 0;
  const canUseGracePass =
    ["upcoming", "proof_window_open"].includes(item.status) &&
    new Date(item.deadline_at) > new Date() &&
    gracePassesRemaining > 0;
  const audience = item.circle?.name ?? "Private";
  const proofLabel =
    item.proof_method === "live_photo"
      ? "Fresh live photo"
      : item.proof_method.replaceAll("_", " ");
  const consequence = item.circle?.name
    ? "Miss the deadline and this promise goes to The Wall."
    : "Misses still count against your private record.";

  function chooseGracePass() {
    Alert.alert(
      "Use a grace pass",
      `You have ${gracePassesRemaining} left. Extending moves the deadline one hour. Excusing closes the promise without recording a miss. Either choice uses one pass.`,
      [
        { text: "Keep the promise", style: "cancel" },
        {
          text: "Extend 1 hour",
          onPress: () => graceMutation.mutate("extend"),
        },
        {
          text: "Excuse commitment",
          style: "destructive",
          onPress: () => graceMutation.mutate("excuse"),
        },
      ],
    );
  }

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${item.title} commitment details`}
        onPress={() => router.push(`/commitment/${item.id}` as never)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: spacing.md,
          }}
        >
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="section">{item.title}</Text>
            <Text style={{ color: colors.textSecondary }}>
              Due {timeLabel(item.deadline_at)} ·{" "}
              {item.minimum_duration_minutes} min
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
            }}
          >
            <StatusPill status={item.status} />
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </View>
        </View>
      </Pressable>

      {item.status === "verified" ? (
        <>
          <Text variant="bodyStrong" style={{ color: colors.verified }}>
            Verified at {item.verified_at ? timeLabel(item.verified_at) : "—"}
          </Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            Promise kept · {audience}
          </Text>
        </>
      ) : item.status === "under_review" ? (
        <>
          <Text variant="bodyStrong">Circle review</Text>
          <Text style={{ color: colors.textSecondary }}>
            Automated checks were not decisive. Your accountability circle can
            review the fresh capture.
          </Text>
        </>
      ) : item.status === "proof_submitted" ? (
        <>
          <Text variant="bodyStrong">Proof received</Text>
          <Text style={{ color: colors.textSecondary }}>
            The fresh capture is being checked. This card will update when the
            result is ready.
          </Text>
        </>
      ) : proofWindowOpen ? (
        <>
          <Text variant="display">{deadlineLabel(item.deadline_at)}</Text>
          <Text style={{ color: colors.textSecondary }}>
            left to submit {proofLabel.toLowerCase()} · {audience}
          </Text>
          <Button
            title="Submit proof"
            onPress={() =>
              router.push({
                pathname: "/proof/capture",
                params: { commitmentId: item.id },
              } as never)
            }
          />
        </>
      ) : item.status === "upcoming" ? (
        <>
          <View style={{ gap: spacing.xxs }}>
            <Text variant="bodyStrong">
              Proof opens at {timeLabel(item.proof_window_starts_at)}
            </Text>
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              {proofLabel} · {audience}
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary }}>{consequence}</Text>
        </>
      ) : item.status === "missed" ? (
        <>
          <Text variant="bodyStrong" style={{ color: colors.missed }}>
            You missed the deadline.
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            {item.circle?.name
              ? "The miss is now on The Wall. Redemption can answer it, but it cannot erase it."
              : "The miss is now part of your record. Redemption can answer it, but it cannot erase it."}
          </Text>
          <Button
            title="Start redemption"
            variant="danger"
            onPress={() => router.push(`/redemption/${item.id}` as never)}
          />
        </>
      ) : item.status === "rejected" ? (
        <>
          <Text variant="bodyStrong" style={{ color: colors.missed }}>
            Proof was not verified.
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            Submit a new live capture before the deadline to keep this promise.
          </Text>
          {canRetryRejected ? (
            <Button
              title="Submit new proof"
              onPress={() =>
                router.push({
                  pathname: "/proof/capture",
                  params: { commitmentId: item.id },
                } as never)
              }
            />
          ) : null}
        </>
      ) : null}

      {canUseGracePass ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Use a grace pass. ${gracePassesRemaining} remaining.`}
          disabled={graceMutation.isPending}
          onPress={chooseGracePass}
          style={({ pressed }) => ({
            opacity: graceMutation.isPending ? 0.45 : pressed ? 0.7 : 1,
          })}
        >
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: spacing.md,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
            }}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color={colors.textSecondary}
            />
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text variant="bodyStrong">Grace pass</Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                {gracePassesRemaining} available · extend once or excuse this
                promise
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </View>
        </Pressable>
      ) : null}
    </Card>
  );
}

export function RedemptionJourneyCard({
  source,
  redemption,
  redemptionCommitment,
}: {
  source: Commitment;
  redemption: RedemptionLink;
  redemptionCommitment?: Commitment;
}) {
  const status: RedemptionStatus = redemption.status;
  const completed = status === "completed" || source.status === "redeemed";
  const inProgress = status === "in_progress";
  const available = status === "available";

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: spacing.md,
        }}
      >
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="section">{source.title}</Text>
          <Text style={{ color: colors.textSecondary }}>
            Missed at{" "}
            {source.missed_at
              ? timeLabel(source.missed_at)
              : timeLabel(source.deadline_at)}
          </Text>
        </View>
        <StatusPill
          status={completed ? "redeemed" : inProgress ? "redeeming" : status}
        />
      </View>

      {completed ? (
        <>
          <Text variant="bodyStrong" style={{ color: colors.verified }}>
            Redemption completed
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            The original miss remains recorded, but you answered the callout.
          </Text>
        </>
      ) : inProgress && redemptionCommitment ? (
        <>
          <Text variant="bodyStrong">Redemption workout</Text>
          <Text style={{ color: colors.textSecondary }}>
            {redemptionCommitment.minimum_duration_minutes} min · due{" "}
            {timeLabel(redemptionCommitment.deadline_at)}
          </Text>
          {processingStatuses.has(redemptionCommitment.status) ? (
            <Text style={{ color: colors.textSecondary }}>
              Redemption proof is being checked.
            </Text>
          ) : redemptionCommitment.status === "verified" ? (
            <Text variant="bodyStrong" style={{ color: colors.verified }}>
              Redemption proof verified
            </Text>
          ) : (
            <Button
              title="Submit redemption proof"
              onPress={() =>
                router.push({
                  pathname: "/proof/capture",
                  params: { commitmentId: redemptionCommitment.id },
                } as never)
              }
            />
          )}
        </>
      ) : available ? (
        <>
          <Text style={{ color: colors.textSecondary }}>
            Redemption is available until {timeLabel(redemption.deadline_at)}.
          </Text>
          <Button
            title="Start redemption"
            variant="danger"
            onPress={() => router.push(`/redemption/${source.id}` as never)}
          />
        </>
      ) : (
        <Text style={{ color: colors.textSecondary }}>
          This redemption is no longer available.
        </Text>
      )}
    </Card>
  );
}

export function CompletedCommitmentRow({
  item,
  onPress,
}: {
  item: Commitment;
  onPress?: () => void;
}) {
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text variant="bodyStrong">{item.title}</Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          {item.status === "verified" && item.verified_at
            ? `Verified at ${timeLabel(item.verified_at)}`
            : item.status.replaceAll("_", " ")}
        </Text>
      </View>
      <StatusPill status={item.status} />
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${item.title} details`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  );
}
