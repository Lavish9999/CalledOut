import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import {
  Button,
  Card,
  EmptyState,
  Header,
  Loading,
  Metric,
  Screen,
  StatusPill,
  Text,
} from "../../components/ui";
import { getWall } from "../../features/wall/api";
import { wallPreviewEntries } from "../../features/wall/preview";
import { qk } from "../../lib/query";
import { analytics } from "../../lib/analytics";
import { colors, radius, spacing } from "../../theme/tokens";
import type { RedemptionStatus, WallEntry } from "../../types/domain";

type WallViewMode = "wall" | "leaderboard";

function redemptionLabel(status: RedemptionStatus | null) {
  if (status === "completed") return "redeemed";
  if (status === "in_progress") return "redeeming";
  if (status === "available") return "redemption available";
  if (status === "expired") return "expired";
  return null;
}

function SegmentedControl({
  value,
  onChange,
}: {
  value: WallViewMode;
  onChange: (next: WallViewMode) => void;
}) {
  const options: WallViewMode[] = ["wall", "leaderboard"];

  return (
    <View
      style={{
        flexDirection: "row",
        gap: spacing.sm,
      }}
    >
      {options.map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            onPress={() => onChange(option)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 46,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: active ? colors.dark : colors.border,
              backgroundColor: active ? colors.dark : colors.surface,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text
              variant="bodyStrong"
              style={{ color: active ? colors.surface : colors.text }}
            >
              {option === "wall" ? "The Wall" : "Leaderboard"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MetricRow({ entries }: { entries: WallEntry[] }) {
  const totals = useMemo(() => {
    const totalMisses = entries.reduce((sum, entry) => sum + entry.missed_count, 0);
    const totalRedeemed = entries.reduce(
      (sum, entry) => sum + entry.redeemed_count,
      0,
    );
    const averageCompletion = entries.length
      ? Math.round(
          entries.reduce((sum, entry) => sum + entry.completion_rate, 0) /
            entries.length,
        )
      : 0;

    return { totalMisses, totalRedeemed, averageCompletion };
  }, [entries]);

  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
      <Metric value={totals.totalMisses} label="total misses" compact />
      <Metric value={totals.totalRedeemed} label="redeemed" compact />
      <Metric
        value={`${totals.averageCompletion}%`}
        label="avg completion"
        compact
      />
    </View>
  );
}

function WallRows({ entries, preview }: { entries: WallEntry[]; preview: boolean }) {
  return entries.map((entry, index) => {
    const label = redemptionLabel(entry.latest_redemption_status);

    return (
      <Pressable
        key={`${entry.circle_id}-${entry.user_id}`}
        accessibilityRole="button"
        onPress={() =>
          router.push({
            pathname: "/wall/[userId]",
            params: {
              userId: entry.user_id,
              circleId: entry.circle_id,
              preview: preview ? "true" : "false",
            },
          } as never)
        }
        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
      >
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
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
              <Text variant="bodyStrong">{index + 1}</Text>
            </View>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text variant="card">{entry.profile.display_name}</Text>
              <Text style={{ color: colors.textSecondary }}>
                @{entry.profile.username}
              </Text>
              <Text style={{ color: colors.textSecondary }}>
                {entry.missed_count} misses · {entry.redeemed_count} redeemed
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
              <Text variant="section">{entry.completion_rate}%</Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                completion
              </Text>
              {label ? <StatusPill status={label} /> : null}
            </View>
          </View>
        </Card>
      </Pressable>
    );
  });
}

function LeaderboardRows({ entries }: { entries: WallEntry[] }) {
  return entries.map((entry, index) => (
    <Card key={`leaderboard-${entry.circle_id}-${entry.user_id}`}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: radius.md,
            backgroundColor: index === 0 ? colors.dark : colors.surfaceMuted,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            variant="bodyStrong"
            style={{ color: index === 0 ? colors.surface : colors.text }}
          >
            #{index + 1}
          </Text>
        </View>

        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text variant="card">{entry.profile.display_name}</Text>
          <Text style={{ color: colors.textSecondary }}>
            @{entry.profile.username}
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            {entry.missed_count} misses · {entry.redeemed_count} redemptions answered
          </Text>
        </View>

        <View style={{ alignItems: "flex-end", gap: spacing.xxs }}>
          <Text variant="title">{entry.completion_rate}%</Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            consistency
          </Text>
        </View>
      </View>
    </Card>
  ));
}

export default function Wall() {
  const { circleId, circleName } = useLocalSearchParams<{
    circleId?: string;
    circleName?: string;
  }>();
  const query = useQuery({
    queryKey: qk.wall(circleId),
    queryFn: () => getWall(circleId),
  });
  const [preview, setPreview] = useState(false);
  const [mode, setMode] = useState<WallViewMode>("wall");
  const previewAvailable = __DEV__;

  useEffect(() => analytics.capture("wall_viewed"), []);

  const refetchWall = query.refetch;

  useFocusEffect(
    useCallback(() => {
      if (!preview) refetchWall();
    }, [preview, refetchWall]),
  );

  const entries = useMemo(
    () => (preview ? wallPreviewEntries : (query.data ?? [])),
    [preview, query.data],
  );
  const wallEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          b.missed_count - a.missed_count ||
          new Date(b.most_recent_missed_at).getTime() -
            new Date(a.most_recent_missed_at).getTime(),
      ),
    [entries],
  );

  const leaderboardEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          b.completion_rate - a.completion_rate ||
          a.missed_count - b.missed_count ||
          b.redeemed_count - a.redeemed_count,
      ),
    [entries],
  );

  return (
    <Screen>
      <Header
        eyebrow={circleId ? "CIRCLE WALL" : "PRIVATE CIRCLES"}
        title={circleName ? `${circleName} Wall` : "The Wall"}
        subtitle="Miss a day. Get called out. Redemption proves who answered the miss."
        action={
          previewAvailable ? (
            <Button
              title={preview ? "Exit preview" : "Preview states"}
              variant="ghost"
              compact
              onPress={() => setPreview((value) => !value)}
            />
          ) : undefined
        }
      />

      {circleId ? (
        <Card style={{ backgroundColor: colors.surfaceMuted }}>
          <Text variant="bodyStrong">Showing one circle</Text>
          <Text style={{ color: colors.textSecondary }}>
            Rankings and misses are filtered to {circleName ?? "this circle"}.
          </Text>
          <Button
            title="Show all circles"
            variant="secondary"
            compact
            onPress={() => router.replace("/wall" as never)}
          />
        </Card>
      ) : null}

      {preview ? (
        <Card style={{ backgroundColor: colors.surfaceMuted }}>
          <Text variant="bodyStrong">Preview data only</Text>
          <Text style={{ color: colors.textSecondary }}>
            These sample misses let you review every Wall state. Your records and
            profile statistics are unchanged.
          </Text>
        </Card>
      ) : null}

      {!preview && query.isLoading ? (
        <Loading />
      ) : !preview && query.error ? (
        <EmptyState title="Could not load The Wall" body={query.error.message} />
      ) : entries.length ? (
        <>
          <MetricRow entries={entries} />
          <SegmentedControl value={mode} onChange={setMode} />

          {mode === "wall" ? (
            <Card style={{ backgroundColor: colors.surfaceMuted }}>
              <Text variant="bodyStrong">Most called out</Text>
              <Text style={{ color: colors.textSecondary }}>
                This is the consequence board. Higher on this list means more visible misses.
              </Text>
            </Card>
          ) : (
            <Card style={{ backgroundColor: colors.surfaceMuted }}>
              <Text variant="bodyStrong">Circle leaderboard</Text>
              <Text style={{ color: colors.textSecondary }}>
                Friendly competition by consistency. Ranked by completion rate, then fewer misses.
              </Text>
            </Card>
          )}

          {mode === "wall" ? (
            <WallRows entries={wallEntries} preview={preview} />
          ) : (
            <LeaderboardRows entries={leaderboardEntries} />
          )}
        </>
      ) : (
        <EmptyState
          title="The Wall is clean"
          body="Nobody in your circles has missed a visible commitment yet."
          action={
            previewAvailable ? (
              <Button
                title="Preview populated Wall"
                variant="secondary"
                onPress={() => setPreview(true)}
              />
            ) : undefined
          }
        />
      )}
    </Screen>
  );
}
