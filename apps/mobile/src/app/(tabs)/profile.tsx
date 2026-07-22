import { useCallback } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import {
  Button,
  Card,
  EmptyState,
  Header,
  Loading,
  Metric,
  Screen,
  SectionHeader,
  StatusPill,
  Text,
} from "../../components/ui";
import { getProfileRecord } from "../../features/profile/api";
import { getPlanOverview } from "../../features/subscription/api";
import { qk } from "../../lib/query";
import { dateLabel } from "../../lib/date";
import {
  subscriptionPeriodVerb,
  subscriptionPlanName,
  subscriptionStatusLabel,
} from "../../lib/subscription-display";
import { useSession } from "../../providers/session";
import { colors, spacing } from "../../theme/tokens";

export default function Profile() {
  const { profile } = useSession();
  const recordQuery = useQuery({
    queryKey: qk.record,
    queryFn: getProfileRecord,
  });
  const planQuery = useQuery({ queryKey: qk.plan, queryFn: getPlanOverview });

  const refetchRecord = recordQuery.refetch;
  const refetchPlan = planQuery.refetch;

  useFocusEffect(
    useCallback(() => {
      refetchRecord();
      refetchPlan();
    }, [refetchPlan, refetchRecord]),
  );

  const record = recordQuery.data;
  const plan = planQuery.data;
  const hasResolvedRecord = (record?.scheduled ?? 0) > 0;

  return (
    <Screen>
      <Header
        title={profile?.display_name ?? "Profile"}
        subtitle={`@${profile?.username ?? ""}`}
      />
      <Text style={{ color: colors.textSecondary }}>
        {profile?.bio || "No bio. Just receipts."}
      </Text>

      <SectionHeader title="Your record" />
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        Verified means kept. A miss stays on your record, even after redemption.
      </Text>

      {recordQuery.isLoading ? (
        <Loading />
      ) : recordQuery.error ? (
        <Card>
          <Text variant="bodyStrong">Could not load your record</Text>
          <Text style={{ color: colors.missed }}>
            {recordQuery.error.message}
          </Text>
        </Card>
      ) : !hasResolvedRecord ? (
        <EmptyState
          title="Your record starts with a result"
          body="Your first verified or missed commitment will establish your completion rate and streak."
        />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Metric
              compact
              value={`${Math.round(record?.completionRate ?? 0)}%`}
              label="completion"
            />
            <Metric
              compact
              value={record?.currentStreak ?? 0}
              label="current streak"
            />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Metric compact value={record?.missed ?? 0} label="misses" />
            <Metric
              compact
              value={record?.redemptionsCompleted ?? 0}
              label="redemptions"
            />
          </View>
          <Card style={{ paddingVertical: spacing.md, gap: spacing.xxs }}>
            <Text variant="bodyStrong">
              {record?.completed ?? 0} of {record?.scheduled ?? 0} promises kept
            </Text>
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              Longest streak: {record?.longestStreak ?? 0} day
              {(record?.longestStreak ?? 0) === 1 ? "" : "s"}.
            </Text>
          </Card>
        </>
      )}

      {plan?.isPro ? (
        <>
          <SectionHeader title="CalledOut Pro" />
          <Card style={{ gap: spacing.md }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: spacing.md,
              }}
            >
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text variant="section">
                  {subscriptionPlanName(plan.productId)}
                </Text>
                {plan.currentPeriodEndsAt ? (
                  <Text
                    variant="caption"
                    style={{ color: colors.textSecondary }}
                  >
                    {subscriptionPeriodVerb(plan)}{" "}
                    {dateLabel(plan.currentPeriodEndsAt)}
                  </Text>
                ) : null}
              </View>
              <StatusPill
                status={subscriptionStatusLabel(plan.subscriptionStatus)}
              />
            </View>
            <Button
              title="Manage plan"
              variant="secondary"
              onPress={() => router.push("/profile/subscription" as never)}
            />
          </Card>
        </>
      ) : null}

      <Button
        title="Workout history"
        variant="secondary"
        onPress={() => router.push("/profile/history")}
      />
      <Button
        title={plan?.isPro ? "Accountability insights" : "CalledOut Pro"}
        variant="secondary"
        onPress={() =>
          router.push(
            plan?.isPro ? "/profile/insights" : "/paywall?source=profile",
          )
        }
      />
      <Button
        title="Settings & privacy"
        variant="secondary"
        onPress={() => router.push("/settings")}
      />
    </Screen>
  );
}
