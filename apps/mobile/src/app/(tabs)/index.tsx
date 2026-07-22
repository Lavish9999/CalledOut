import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import {
  Button,
  Card,
  Divider,
  EmptyState,
  Header,
  IconButton,
  Loading,
  Screen,
  SectionHeader,
  Text,
} from "../../components/ui";
import {
  CommitmentCard,
  CompletedCommitmentRow,
  RedemptionJourneyCard,
} from "../../components/commitment-card";
import { getTodayDashboard } from "../../features/commitments/api";
import { getProfileRecord } from "../../features/profile/api";
import { qk } from "../../lib/query";
import { dateHeading } from "../../lib/date";
import { useSession } from "../../providers/session";
import { colors, spacing } from "../../theme/tokens";
import type { Commitment } from "../../types/domain";

const onClockStatuses = new Set([
  "proof_window_open",
  "proof_submitted",
  "under_review",
]);

const completedStatuses = new Set(["verified", "excused"]);

export default function Today() {
  const { profile } = useSession();
  const [showCompleted, setShowCompleted] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: qk.today,
    queryFn: getTodayDashboard,
  });
  const recordQuery = useQuery({
    queryKey: qk.record,
    queryFn: getProfileRecord,
  });

  const refetchDashboard = dashboardQuery.refetch;
  const refetchRecord = recordQuery.refetch;

  useFocusEffect(
    useCallback(() => {
      refetchDashboard();
      refetchRecord();
    }, [refetchDashboard, refetchRecord]),
  );

  const content = useMemo(() => {
    const dashboard = dashboardQuery.data;
    if (!dashboard) {
      return {
        onClock: [] as Commitment[],
        upcoming: [] as Commitment[],
        attention: [] as Commitment[],
        completed: [] as Commitment[],
        journeys: [],
      };
    }

    const commitmentById = new Map(
      dashboard.commitments.map((commitment) => [commitment.id, commitment]),
    );
    const redemptionCommitmentIds = new Set(
      dashboard.redemptions
        .map((redemption) => redemption.redemption_commitment_id)
        .filter((id): id is string => Boolean(id)),
    );
    const journeySourceIds = new Set(
      dashboard.redemptions.map(
        (redemption) => redemption.source_commitment_id,
      ),
    );

    const journeys = dashboard.redemptions
      .map((redemption) => ({
        redemption,
        source: commitmentById.get(redemption.source_commitment_id),
        redemptionCommitment: redemption.redemption_commitment_id
          ? commitmentById.get(redemption.redemption_commitment_id)
          : undefined,
      }))
      .filter((journey) => Boolean(journey.source));

    const regular = dashboard.commitments.filter(
      (commitment) =>
        !redemptionCommitmentIds.has(commitment.id) &&
        !journeySourceIds.has(commitment.id),
    );

    return {
      journeys,
      onClock: regular.filter((commitment) =>
        onClockStatuses.has(commitment.status),
      ),
      upcoming: regular.filter(
        (commitment) => commitment.status === "upcoming",
      ),
      attention: regular.filter((commitment) =>
        ["missed", "rejected", "redemption_available"].includes(
          commitment.status,
        ),
      ),
      completed: regular.filter((commitment) =>
        completedStatuses.has(commitment.status),
      ),
    };
  }, [dashboardQuery.data]);

  const activeJourneys = content.journeys.filter(
    (journey) => journey.redemption.status !== "completed",
  );
  const completedJourneys = content.journeys.filter(
    (journey) => journey.redemption.status === "completed",
  );
  const completedCount = content.completed.length + completedJourneys.length;
  const firstName = profile?.display_name?.split(" ")[0] ?? "today";
  const streak = recordQuery.data?.currentStreak ?? 0;
  const todayPromiseCount =
    content.onClock.length +
    content.upcoming.length +
    content.attention.length +
    content.completed.length +
    content.journeys.length;
  const promiseLabel =
    todayPromiseCount === 0
      ? "No promises today"
      : `${todayPromiseCount} promise${todayPromiseCount === 1 ? "" : "s"} today`;
  const streakLabel =
    streak > 0
      ? `${streak}-day kept streak`
      : todayPromiseCount > 0
        ? "Start your streak today"
        : "Make the next promise count";
  const hasTodayItems = Boolean(dashboardQuery.data?.commitments.length);
  const hasPrimaryContent = Boolean(
    content.onClock.length ||
    content.upcoming.length ||
    activeJourneys.length ||
    content.attention.length,
  );

  return (
    <Screen>
      <Header
        eyebrow={dateHeading().toUpperCase()}
        title={`Show up, ${firstName}.`}
        subtitle={`${promiseLabel} · ${streakLabel}`}
        action={
          hasTodayItems ? (
            <IconButton
              icon="add"
              label="Create commitment"
              onPress={() => router.push("/commitment/new")}
            />
          ) : undefined
        }
      />

      {dashboardQuery.isLoading ? (
        <Loading />
      ) : dashboardQuery.error ? (
        <EmptyState
          title="Could not load Today"
          body={dashboardQuery.error.message}
          action={
            <Button title="Try again" onPress={() => refetchDashboard()} />
          }
        />
      ) : (
        <>
          {(content.onClock.length || activeJourneys.length) > 0 ? (
            <View style={{ gap: spacing.md }}>
              <SectionHeader title="On the clock" />
              {activeJourneys.map((journey) => (
                <RedemptionJourneyCard
                  key={journey.redemption.id}
                  source={journey.source!}
                  redemption={journey.redemption}
                  redemptionCommitment={journey.redemptionCommitment}
                />
              ))}
              {content.onClock.map((commitment) => (
                <CommitmentCard key={commitment.id} item={commitment} />
              ))}
            </View>
          ) : null}

          {content.upcoming.length ? (
            <View style={{ gap: spacing.md }}>
              <SectionHeader title="Later today" />
              {content.upcoming.map((commitment) => (
                <CommitmentCard key={commitment.id} item={commitment} />
              ))}
            </View>
          ) : null}

          {content.attention.length ? (
            <View style={{ gap: spacing.md }}>
              <SectionHeader title="Needs attention" />
              {content.attention.map((commitment) => (
                <CommitmentCard key={commitment.id} item={commitment} />
              ))}
            </View>
          ) : null}

          {!hasPrimaryContent ? (
            <EmptyState
              title="Nothing on the clock"
              body="Make a promise. When proof opens, show up—or the miss becomes part of your record."
              action={
                <Button
                  title="Create commitment"
                  onPress={() => router.push("/commitment/new")}
                />
              }
            />
          ) : null}

          {completedCount ? (
            <View style={{ gap: spacing.sm }}>
              <SectionHeader
                title={`Completed today · ${completedCount}`}
                action={
                  <Text
                    variant="caption"
                    onPress={() => setShowCompleted((current) => !current)}
                    style={{ color: colors.text }}
                  >
                    {showCompleted ? "Hide" : "Show"}
                  </Text>
                }
              />
              {showCompleted ? (
                <Card style={{ gap: 0 }}>
                  {content.completed.map((commitment, index) => (
                    <View key={commitment.id}>
                      {index ? <Divider /> : null}
                      <CompletedCommitmentRow
                        item={commitment}
                        onPress={() =>
                          router.push(`/commitment/${commitment.id}` as never)
                        }
                      />
                    </View>
                  ))}
                  {completedJourneys.map((journey, index) => (
                    <View key={journey.redemption.id}>
                      {content.completed.length || index ? <Divider /> : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View ${journey.source!.title} redemption details`}
                        onPress={() =>
                          router.push(
                            `/commitment/${journey.source!.id}` as never,
                          )
                        }
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <View
                          style={{
                            paddingVertical: spacing.sm,
                            gap: spacing.xxs,
                          }}
                        >
                          <Text variant="bodyStrong">
                            {journey.source!.title}
                          </Text>
                          <Text
                            variant="caption"
                            style={{ color: colors.textSecondary }}
                          >
                            Miss redeemed. Original consequence remains
                            recorded.
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  ))}
                </Card>
              ) : null}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage recurring schedules"
            onPress={() => router.push("/schedules")}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Card
              style={{
                padding: spacing.md,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
              }}
            >
              <Ionicons name="calendar-outline" size={22} color={colors.text} />
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text variant="bodyStrong">Recurring schedules</Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  View or end the promises that repeat each week.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textSecondary}
              />
            </Card>
          </Pressable>
        </>
      )}
    </Screen>
  );
}
