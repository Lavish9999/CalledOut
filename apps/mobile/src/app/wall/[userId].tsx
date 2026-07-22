import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  EmptyState,
  Header,
  Loading,
  Screen,
  StatusPill,
  Text,
} from "../../components/ui";
import { getMemberWall } from "../../features/wall/api";
import { wallPreviewMember } from "../../features/wall/preview";
import { qk } from "../../lib/query";
import { dateLabel } from "../../lib/date";
import { colors, radius, spacing } from "../../theme/tokens";
import type { WallMissDetail } from "../../types/domain";

type FilterKey = "all" | "open" | "redeemed" | "missed";

const EMPTY_MISSES: WallMissDetail[] = [];

function getStatusLabel(miss: WallMissDetail) {
  const redemptionStatus = miss.redemption?.status;

  if (redemptionStatus === "completed") return "redeemed";
  if (redemptionStatus === "in_progress") return "redeeming";
  if (redemptionStatus === "available") return "redemption available";
  if (redemptionStatus === "expired") return "expired";
  return "missed";
}

function timeLeftLabel(iso: string) {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "deadline passed";

  const totalHours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (totalHours < 24) return `${totalHours} hour${totalHours === 1 ? "" : "s"} left`;

  const days = Math.ceil(totalHours / 24);
  return `${days} day${days === 1 ? "" : "s"} left`;
}

function FilterTabs({
  value,
  onChange,
  counts,
}: {
  value: FilterKey;
  onChange: (next: FilterKey) => void;
  counts: Record<FilterKey, number>;
}) {
  const options: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "redeemed", label: "Redeemed" },
    { key: "missed", label: "Missed" },
  ];

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {options.map((option) => {
        const active = value === option.key;

        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            onPress={() => onChange(option.key)}
            style={({ pressed }) => ({
              minHeight: 42,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: active ? colors.dark : colors.border,
              backgroundColor: active ? colors.dark : colors.surface,
              paddingHorizontal: spacing.md,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text
              variant="bodyStrong"
              style={{ color: active ? colors.surface : colors.text }}
            >
              {option.label} ({counts[option.key]})
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function matchesFilter(miss: WallMissDetail, filter: FilterKey) {
  const status = miss.redemption?.status;

  if (filter === "all") return true;
  if (filter === "open") return status === "available" || status === "in_progress";
  if (filter === "redeemed") return status === "completed";
  return status === "expired" || !status;
}

export default function WallMemberScreen() {
  const { userId, circleId, preview } = useLocalSearchParams<{
    userId: string;
    circleId: string;
    preview?: string;
  }>();
  const previewMode = preview === "true";
  const [filter, setFilter] = useState<FilterKey>("all");

  const query = useQuery({
    queryKey: qk.wallMember(userId, circleId),
    queryFn: () => getMemberWall(userId, circleId),
    enabled: Boolean(userId && circleId && !previewMode),
  });

  const data = previewMode ? wallPreviewMember : query.data;
  const misses = data?.misses ?? EMPTY_MISSES;

  const counts = useMemo(
    () => ({
      all: misses.length,
      open: misses.filter((miss) => matchesFilter(miss, "open")).length,
      redeemed: misses.filter((miss) => matchesFilter(miss, "redeemed")).length,
      missed: misses.filter((miss) => matchesFilter(miss, "missed")).length,
    }),
    [misses],
  );

  const filteredMisses = useMemo(
    () => misses.filter((miss) => matchesFilter(miss, filter)),
    [filter, misses],
  );

  if (!previewMode && query.isLoading) {
    return (
      <Screen>
        <Header title="Wall history" backLabel="The Wall" onBack={router.back} />
        <Loading />
      </Screen>
    );
  }

  if (!previewMode && (query.error || !query.data)) {
    return (
      <Screen>
        <Header
          title="Wall history unavailable"
          backLabel="The Wall"
          onBack={router.back}
        />
        <EmptyState
          title="Could not load this history"
          body={query.error?.message ?? "Please try again."}
        />
      </Screen>
    );
  }

  const profile = data!.profile;

  return (
    <Screen>
      <Header
        eyebrow={previewMode ? "PREVIEW DATA" : undefined}
        title={profile.display_name}
        subtitle={`@${profile.username} · ${misses.length} misses on record`}
        backLabel="The Wall"
        onBack={router.back}
      />

      <Card style={{ backgroundColor: colors.surfaceMuted }}>
        <Text variant="bodyStrong">Record summary</Text>
        <Text style={{ color: colors.textSecondary }}>
          Misses stay on the record. Redemption shows who answered the callout, but it never erases the original miss.
        </Text>
      </Card>

      <FilterTabs value={filter} onChange={setFilter} counts={counts} />

      {filteredMisses.length ? (
        filteredMisses.map((miss) => {
          const label = getStatusLabel(miss);

          return (
            <Card key={miss.id}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: spacing.md,
                }}
              >
                <StatusPill status={label} />
                <Text style={{ color: colors.textSecondary }}>
                  Missed {dateLabel(miss.missed_at)}
                </Text>
              </View>

              <Text variant="section">{miss.commitment?.title ?? "Commitment"}</Text>
              <Text style={{ color: colors.textSecondary }}>
                {miss.commitment?.minimum_duration_minutes ?? 0}-minute minimum
              </Text>

              <View
                style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.xs }}
              />

              {miss.redemption?.completed_at ? (
                <Text variant="bodyStrong" style={{ color: colors.verified }}>
                  Redeemed {dateLabel(miss.redemption.completed_at)}
                </Text>
              ) : miss.redemption?.deadline_at ? (
                <>
                  <Text variant="bodyStrong">
                    {miss.redemption.status === "in_progress"
                      ? `Redemption in progress · ${timeLeftLabel(miss.redemption.deadline_at)}`
                      : miss.redemption.status === "available"
                        ? `Redemption open · ${timeLeftLabel(miss.redemption.deadline_at)}`
                        : `Redemption deadline ${dateLabel(miss.redemption.deadline_at)}`}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>
                    Deadline {dateLabel(miss.redemption.deadline_at)}
                  </Text>
                </>
              ) : (
                <Text style={{ color: colors.textSecondary }}>
                  No redemption was created for this miss.
                </Text>
              )}
            </Card>
          );
        })
      ) : (
        <EmptyState
          title="Nothing in this filter"
          body="Try a different filter to view the rest of this record."
        />
      )}
    </Screen>
  );
}
