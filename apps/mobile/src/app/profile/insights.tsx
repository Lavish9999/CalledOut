import type { ComponentProps } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import {
  Button,
  Card,
  EmptyState,
  Header,
  Loading,
  Screen,
  SectionHeader,
  Text,
} from "../../components/ui";
import { getAccountabilityInsights } from "../../features/profile/api";
import { getPlanOverview } from "../../features/subscription/api";
import {
  buildCoachRead,
  formatProofLead,
  insightConfidence,
  reliabilityLabel,
} from "../../lib/insight-coach";
import { qk } from "../../lib/query";
import { colors, radius, spacing } from "../../theme/tokens";
import type {
  AccountabilityInsights,
  InsightPattern,
  InsightWeek,
} from "../../types/domain";

function formatRate(value: number) {
  return `${Math.round(value)}%`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function TrendLine({ delta, priorTotal }: { delta: number | null; priorTotal: number }) {
  if (delta === null || priorTotal === 0) {
    return (
      <Text style={{ color: "rgba(255,255,255,0.72)" }}>
        First 30-day baseline
      </Text>
    );
  }

  const rounded = Math.round(Math.abs(delta));
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
      <Ionicons
        name={
          direction === "up"
            ? "trending-up"
            : direction === "down"
              ? "trending-down"
              : "remove"
        }
        size={18}
        color={direction === "down" ? colors.missed : colors.surface}
      />
      <Text
        variant="bodyStrong"
        style={{ color: direction === "down" ? colors.missed : colors.surface }}
      >
        {direction === "flat"
          ? "No change from the prior 30 days"
          : `${rounded} points ${direction} from the prior 30 days`}
      </Text>
    </View>
  );
}

function ConfidenceMeter({ resolvedCount }: { resolvedCount: number }) {
  const confidence = insightConfidence(resolvedCount);

  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: spacing.md,
        }}
      >
        <Text variant="label" style={{ color: "rgba(255,255,255,0.72)" }}>
          {confidence.label.toUpperCase()}
        </Text>
        <Text variant="caption" style={{ color: "rgba(255,255,255,0.72)" }}>
          {confidence.detail}
        </Text>
      </View>
      <View
        style={{
          height: 6,
          borderRadius: radius.pill,
          backgroundColor: "rgba(255,255,255,0.18)",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.max(5, confidence.progress * 100)}%`,
            height: "100%",
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
          }}
        />
      </View>
    </View>
  );
}

function WeeklyChart({ weeks }: { weeks: InsightWeek[] }) {
  const maxTotal = Math.max(1, ...weeks.map((week) => week.total));

  return (
    <Card>
      <View style={{ gap: spacing.xxs }}>
        <Text variant="section">Six-week momentum</Text>
        <Text style={{ color: colors.textSecondary }}>
          Kept promises by week. Misses remain visible in red.
        </Text>
      </View>

      <View
        style={{
          height: 142,
          flexDirection: "row",
          alignItems: "flex-end",
          gap: spacing.sm,
        }}
      >
        {weeks.map((week) => {
          const totalHeight = week.total === 0 ? 8 : 34 + (week.total / maxTotal) * 66;
          const completedHeight =
            week.total === 0 ? 0 : Math.max(6, totalHeight * (week.completed / week.total));
          const missedHeight = Math.max(0, totalHeight - completedHeight);

          return (
            <View
              key={week.weekStart}
              style={{ flex: 1, alignItems: "center", gap: spacing.xxs }}
            >
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                {week.total ? `${week.completed}/${week.total}` : "—"}
              </Text>
              <View
                style={{
                  width: "100%",
                  height: totalHeight,
                  maxWidth: 34,
                  borderRadius: radius.sm,
                  backgroundColor: colors.surfaceMuted,
                  overflow: "hidden",
                  justifyContent: "flex-end",
                }}
              >
                {missedHeight > 0 ? (
                  <View
                    style={{
                      height: missedHeight,
                      backgroundColor: colors.missed,
                    }}
                  />
                ) : null}
                {completedHeight > 0 ? (
                  <View
                    style={{
                      height: completedHeight,
                      backgroundColor: colors.dark,
                    }}
                  />
                ) : null}
              </View>
              <Text
                variant="caption"
                numberOfLines={1}
                style={{ color: colors.textSecondary, fontSize: 10 }}
              >
                {week.label}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function MiniMetric({
  icon,
  value,
  label,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  value: string;
  label: string;
}) {
  return (
    <Card
      style={{
        flex: 1,
        minWidth: 100,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text variant="section">{value}</Text>
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
    </Card>
  );
}

function PatternCard({
  icon,
  title,
  pattern,
  fallback,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  pattern: InsightPattern | null;
  fallback: string;
}) {
  return (
    <Card
      style={{
        flexBasis: "48%",
        flexGrow: 1,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceMuted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={20} color={colors.text} />
      </View>
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        {title}
      </Text>
      <Text variant="section">
        {pattern ? capitalize(pattern.name) : fallback}
      </Text>
      {pattern ? (
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          {formatRate(pattern.rate)} · {pattern.completed}/{pattern.total} kept
        </Text>
      ) : null}
    </Card>
  );
}

function PremiumInsights({ insights }: { insights: AccountabilityInsights }) {
  const coach = buildCoachRead(insights);
  const reliability = reliabilityLabel(
    insights.last30CompletionRate,
    insights.last30Total,
  );
  const riskPattern =
    insights.weakestWeekday &&
    insights.bestWeekday &&
    insights.bestWeekday.name !== insights.weakestWeekday.name
      ? insights.weakestWeekday
      : null;

  return (
    <>
      <Card
        style={{
          backgroundColor: colors.dark,
          borderColor: colors.dark,
          padding: spacing.xl,
          gap: spacing.lg,
        }}
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="label" style={{ color: "rgba(255,255,255,0.7)" }}>
            LAST 30 DAYS
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: spacing.md,
            }}
          >
            <View>
              <Text
                style={{
                  color: colors.surface,
                  fontSize: 64,
                  lineHeight: 68,
                  fontWeight: "800",
                  letterSpacing: -2,
                }}
              >
                {formatRate(insights.last30CompletionRate)}
              </Text>
              <Text variant="section" style={{ color: colors.surface }}>
                {reliability} reliability
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: spacing.xxs }}>
              <Text variant="title" style={{ color: colors.surface }}>
                {insights.last30Completed}/{insights.last30Total}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.72)" }}>kept</Text>
            </View>
          </View>
        </View>

        <TrendLine delta={insights.trendDelta} priorTotal={insights.prior30Total} />
        <ConfidenceMeter resolvedCount={insights.resolvedCount} />
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        <MiniMetric
          icon="flame-outline"
          value={`${insights.currentStreak}`}
          label="current streak"
        />
        <MiniMetric
          icon="trophy-outline"
          value={`${insights.longestStreak}`}
          label="longest streak"
        />
        <MiniMetric
          icon="time-outline"
          value={formatProofLead(insights.averageProofLeadMinutes)}
          label={
            insights.proofSampleCount
              ? `avg proof timing · ${insights.proofSampleCount} samples`
              : "average proof timing"
          }
        />
      </View>

      <WeeklyChart weeks={insights.weeklyTrend} />

      <SectionHeader title="Your strongest conditions" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <PatternCard
          icon="calendar-outline"
          title="Best day"
          pattern={insights.bestWeekday}
          fallback="More history needed"
        />
        <PatternCard
          icon="barbell-outline"
          title="Best workout"
          pattern={insights.strongestWorkout}
          fallback="More history needed"
        />
        <PatternCard
          icon="sunny-outline"
          title="Best deadline window"
          pattern={insights.bestDeadlineWindow}
          fallback="More history needed"
        />
        <PatternCard
          icon="warning-outline"
          title="Risk day"
          pattern={riskPattern}
          fallback="No weak pattern yet"
        />
      </View>

      <SectionHeader title="Coach's read" />
      <Card style={{ borderWidth: 2, borderColor: colors.dark }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            backgroundColor: colors.dark,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="analytics-outline" size={22} color={colors.surface} />
        </View>
        <Text variant="section">{coach.title}</Text>
        <Text style={{ color: colors.textSecondary }}>{coach.body}</Text>
        <View
          style={{
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.md,
            padding: spacing.md,
            gap: spacing.xs,
          }}
        >
          <Text variant="label" style={{ color: colors.textSecondary }}>
            NEXT MOVE
          </Text>
          <Text variant="bodyStrong">{coach.action}</Text>
        </View>
      </Card>

      <SectionHeader title="Redemption discipline" />
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
            <Text variant="section">
              {insights.redemptionRate === null
                ? "No resolved redemptions yet"
                : `${formatRate(insights.redemptionRate)} answered`}
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              {insights.redemptionResolvedCount
                ? `${insights.redemptionCompletedCount} of ${insights.redemptionResolvedCount} redemption opportunities completed.`
                : "When you miss, this measures whether you answer the callout before it expires."}
            </Text>
          </View>
          {insights.redemptionOpenCount ? (
            <View
              style={{
                borderRadius: radius.pill,
                backgroundColor: colors.surfaceMuted,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
              }}
            >
              <Text variant="label">{insights.redemptionOpenCount} OPEN</Text>
            </View>
          ) : null}
        </View>
      </Card>

      <Text variant="caption" style={{ color: colors.textSecondary }}>
        Insights use resolved original promises only. Redemption workouts never
        inflate your consistency, and redemption never erases an original miss.
      </Text>
    </>
  );
}

export default function InsightsScreen() {
  const planQuery = useQuery({ queryKey: qk.plan, queryFn: getPlanOverview });
  const insightsQuery = useQuery({
    queryKey: qk.insights,
    queryFn: getAccountabilityInsights,
    enabled: planQuery.data?.isPro === true,
  });

  return (
    <Screen>
      <Header
        eyebrow="CALLEDOUT PRO"
        title="Accountability intelligence"
        subtitle="Your record translated into patterns, pressure points, and a smarter next move."
        backLabel="Profile"
        onBack={router.back}
      />

      {planQuery.isLoading ? (
        <Loading />
      ) : !planQuery.data?.isPro ? (
        <Card style={{ gap: spacing.lg }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: radius.md,
              backgroundColor: colors.dark,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="analytics-outline" size={24} color={colors.surface} />
          </View>
          <View style={{ gap: spacing.xs }}>
            <Text variant="section">Turn your record into a strategy</Text>
            <Text style={{ color: colors.textSecondary }}>
              Pro analyzes six-week momentum, proof timing, reliable days,
              deadline windows, risk patterns, and redemption discipline.
            </Text>
          </View>
          <View style={{ gap: spacing.sm }}>
            {[
              "A personalized coaching read",
              "Six-week consistency trend",
              "Best and weakest accountability conditions",
              "Proof timing and redemption behavior",
            ].map((item) => (
              <View
                key={item}
                style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
              >
                <Ionicons name="checkmark-circle" size={20} color={colors.text} />
                <Text variant="bodyStrong">{item}</Text>
              </View>
            ))}
          </View>
          <Button
            title="Unlock accountability intelligence"
            onPress={() => router.push("/paywall?source=insights" as never)}
          />
        </Card>
      ) : insightsQuery.isLoading ? (
        <Loading />
      ) : insightsQuery.error ? (
        <EmptyState
          title="Could not load insights"
          body={insightsQuery.error.message}
        />
      ) : insightsQuery.data ? (
        <PremiumInsights insights={insightsQuery.data} />
      ) : (
        <EmptyState
          title="No insight data yet"
          body="Resolve your first commitment to start building your accountability baseline."
        />
      )}
    </Screen>
  );
}
