import { useCallback } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import {
  Button,
  Card,
  EmptyState,
  Header,
  Loading,
  Screen,
  Text,
} from "../../components/ui";
import { getCircleOverview } from "../../features/circles/overview";
import { getPendingCircleProofReviews } from "../../features/proofs/review";
import { getPlanOverview } from "../../features/subscription/api";
import { qk } from "../../lib/query";
import { shortDateLabel, timeLabel } from "../../lib/date";
import { colors, radius, spacing } from "../../theme/tokens";
import type { ActivityEvent } from "../../types/domain";

const PROOF_REVIEWS_KEY = ["proof-reviews"] as const;

function latestActivityCopy(event: ActivityEvent | null | undefined) {
  if (!event) return "No circle activity yet.";

  const actor = event.actor?.display_name ?? "A member";
  const title =
    typeof event.payload.title === "string"
      ? event.payload.title
      : "a commitment";

  if (event.event_type === "proof_verified") return `${actor} kept ${title}.`;
  if (event.event_type === "commitment_missed") return `${actor} missed ${title}.`;
  if (event.event_type === "redemption_completed")
    return `${actor} answered a callout.`;
  if (event.event_type === "member_joined") return `${actor} joined the circle.`;
  return `${actor} posted an update.`;
}

function CircleRolePill({ role }: { role?: string }) {
  return (
    <View
      style={{
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceMuted,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Text variant="label">{(role ?? "member").toUpperCase()}</Text>
    </View>
  );
}

export default function Circles() {
  const query = useQuery({
    queryKey: qk.circles,
    queryFn: getCircleOverview,
  });
  const planQuery = useQuery({ queryKey: qk.plan, queryFn: getPlanOverview });
  const reviewsQuery = useQuery({
    queryKey: PROOF_REVIEWS_KEY,
    queryFn: getPendingCircleProofReviews,
  });

  const refetchCircles = query.refetch;
  const refetchPlan = planQuery.refetch;
  const refetchReviews = reviewsQuery.refetch;

  useFocusEffect(
    useCallback(() => {
      refetchCircles();
      refetchPlan();
      refetchReviews();
    }, [refetchCircles, refetchPlan, refetchReviews]),
  );

  const visibleCircleCount = query.data?.length ?? 0;
  const plan = planQuery.data;
  const atLimit = Boolean(plan && visibleCircleCount >= plan.circleLimit);
  const createTitle = atLimit
    ? plan?.isPro
      ? "Circle limit reached"
      : "Unlock more circles"
    : "Create circle";
  const pendingReviews = reviewsQuery.data ?? [];
  const nextReview =
    pendingReviews.find((review) => review.myVote === null) ?? pendingReviews[0];
  const unvotedCount = pendingReviews.filter(
    (review) => review.myVote === null,
  ).length;

  const openCircleCreation = () => {
    if (!atLimit) {
      router.push("/circle/new");
      return;
    }

    if (plan?.isPro) {
      Alert.alert(
        "Circle limit reached",
        `CalledOut Pro supports up to ${plan.circleLimit} active circles. Leave or delete one before creating another.`,
      );
      return;
    }

    router.push("/paywall?source=circle_limit" as never);
  };

  const openCircleJoin = () => {
    if (!atLimit) {
      router.push("/circle/join");
      return;
    }

    if (plan?.isPro) {
      Alert.alert(
        "Circle limit reached",
        `CalledOut Pro supports up to ${plan.circleLimit} active circles. Leave or delete one before joining another.`,
      );
      return;
    }

    router.push("/paywall?source=circle_limit" as never);
  };

  return (
    <Screen>
      <Header
        eyebrow="ACCOUNTABILITY TEAMS"
        title="Circles"
        subtitle="Make promises where somebody will notice whether you show up."
      />

      {plan ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            {visibleCircleCount} of {plan.circleLimit} circle
            {plan.circleLimit === 1 ? "" : "s"} used
          </Text>
          <Text variant="label">{plan.isPro ? "PRO" : "FREE"}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title={createTitle} onPress={openCircleCreation} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Join with code"
            variant="secondary"
            onPress={openCircleJoin}
          />
        </View>
      </View>

      {nextReview ? (
        <Card style={{ backgroundColor: colors.dark, borderColor: colors.dark }}>
          <Text variant="label" style={{ color: colors.surfaceMuted }}>
            PROOF REVIEW · {pendingReviews.length} OPEN
          </Text>
          <Text variant="section" style={{ color: colors.surface }}>
            {unvotedCount > 0
              ? `${unvotedCount} fresh ${unvotedCount === 1 ? "proof needs" : "proofs need"} your vote.`
              : "Your vote is recorded. The circle decision is still open."}
          </Text>
          <Text style={{ color: colors.surfaceMuted }}>
            {nextReview.memberName} submitted {nextReview.commitmentTitle} in {nextReview.circleName}.
          </Text>
          <Button
            title={nextReview.myVote ? "Open review" : "Review next proof"}
            variant="secondary"
            onPress={() =>
              router.push(`/circle/review/${nextReview.id}` as never)
            }
          />
        </Card>
      ) : null}

      {reviewsQuery.error ? (
        <Text variant="caption" style={{ color: colors.missed }}>
          Proof reviews could not be loaded. Pull to refresh or reopen Circles.
        </Text>
      ) : null}

      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <EmptyState
          title="Could not load circles"
          body={query.error.message}
          action={<Button title="Try again" onPress={() => query.refetch()} />}
        />
      ) : query.data?.length ? (
        <>
          {query.data.map((circle) => {
            const memberCount = circle.member_count ?? 0;
            const resolvedCount = circle.resolved_count ?? 0;
            const hasResults = resolvedCount > 0;

            return (
              <Pressable
                key={circle.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${circle.name}`}
                onPress={() => router.push(`/circle/${circle.id}` as never)}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
              >
                <Card>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: spacing.md,
                    }}
                  >
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: radius.md,
                        backgroundColor: colors.surfaceMuted,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text variant="section">{circle.icon}</Text>
                    </View>
                    <View style={{ flex: 1, gap: spacing.xxs }}>
                      <Text variant="section">{circle.name}</Text>
                      <Text
                        style={{ color: colors.textSecondary }}
                        numberOfLines={2}
                      >
                        {circle.description ?? "Private accountability circle"}
                      </Text>
                    </View>
                    <CircleRolePill role={circle.role} />
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      borderTopWidth: 1,
                      borderBottomWidth: 1,
                      borderColor: colors.border,
                      paddingVertical: spacing.md,
                    }}
                  >
                    <View style={{ flex: 1, gap: spacing.xxs }}>
                      <Text variant="section">{memberCount}</Text>
                      <Text
                        variant="caption"
                        style={{ color: colors.textSecondary }}
                      >
                        {memberCount === 1 ? "member" : "members"}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: spacing.xxs }}>
                      <Text variant="section">
                        {hasResults
                          ? `${circle.average_completion_rate ?? 0}%`
                          : "—"}
                      </Text>
                      <Text
                        variant="caption"
                        style={{ color: colors.textSecondary }}
                      >
                        {hasResults ? "consistency" : "No results yet"}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: spacing.xxs }}>
                      <Text variant="section">{circle.open_callouts ?? 0}</Text>
                      <Text
                        variant="caption"
                        style={{ color: colors.textSecondary }}
                      >
                        open callouts
                      </Text>
                    </View>
                  </View>

                  <View style={{ gap: spacing.xxs }}>
                    <Text variant="bodyStrong">
                      {latestActivityCopy(circle.latest_activity)}
                    </Text>
                    <Text
                      variant="caption"
                      style={{ color: colors.textSecondary }}
                    >
                      {circle.next_deadline_at
                        ? `Next promise ${shortDateLabel(circle.next_deadline_at)} at ${timeLabel(circle.next_deadline_at)}`
                        : "No upcoming circle promises"}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text variant="bodyStrong">Open circle</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={colors.textSecondary}
                    />
                  </View>
                </Card>
              </Pressable>
            );
          })}

          <Card style={{ backgroundColor: colors.surfaceMuted }}>
            <Text variant="bodyStrong">Private by default</Text>
            <Text style={{ color: colors.textSecondary }}>
              Only members can see promises attached to a circle, proof outcomes,
              and its Wall.
            </Text>
          </Card>
        </>
      ) : (
        <>
          <Card style={{ backgroundColor: colors.dark, borderColor: colors.dark }}>
            <Text variant="label" style={{ color: colors.surfaceMuted }}>
              YOUR ACCOUNTABILITY NETWORK
            </Text>
            <Text variant="section" style={{ color: colors.surface }}>
              Commit together. Prove it. Call out the misses.
            </Text>
            <Text style={{ color: colors.surfaceMuted }}>
              Create a private circle or join one with an invite code. Your first
              circle is included on Free.
            </Text>
          </Card>

          <EmptyState
            title="Accountability works better when somebody notices"
            body="Invite at least one person so promises have a real audience and friendly competition can begin."
            action={
              <Button title="Create your first circle" onPress={openCircleCreation} />
            }
          />
        </>
      )}
    </Screen>
  );
}
