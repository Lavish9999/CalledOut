import { useCallback, useEffect } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
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
import { getWall } from "../../features/wall/api";
import { qk } from "../../lib/query";
import { analytics } from "../../lib/analytics";
import { colors, spacing } from "../../theme/tokens";
import type { RedemptionStatus } from "../../types/domain";

function redemptionLabel(status: RedemptionStatus | null) {
  if (status === "completed") return "redeemed";
  if (status === "in_progress") return "redeeming";
  if (status === "available") return "redemption available";
  if (status === "expired") return "expired";
  return null;
}

export default function Wall() {
  const query = useQuery({ queryKey: qk.wall(), queryFn: () => getWall() });

  useEffect(() => analytics.capture("wall_viewed"), []);
  const refetchWall = query.refetch;

  useFocusEffect(
    useCallback(() => {
      refetchWall();
    }, [refetchWall]),
  );

  return (
    <Screen>
      <Header
        eyebrow="PRIVATE CIRCLES"
        title="The Wall"
        subtitle="Misses stay visible. Redemption shows who responded."
      />

      {query.isLoading ? (
        <Loading />
      ) : query.data?.length ? (
        query.data.map((entry, index) => {
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
                  <Text variant="title" style={{ width: 34 }}>
                    {index + 1}
                  </Text>
                  <View style={{ flex: 1, gap: spacing.xxs }}>
                    <Text variant="card">{entry.profile.display_name}</Text>
                    <Text style={{ color: colors.textSecondary }}>
                      @{entry.profile.username}
                    </Text>
                    <Text>
                      {entry.missed_count} missed · {entry.redeemed_count}{" "}
                      redeemed
                    </Text>
                  </View>
                  {label ? <StatusPill status={label} /> : null}
                </View>
              </Card>
            </Pressable>
          );
        })
      ) : (
        <EmptyState
          title="The Wall is clean"
          body="Nobody in your circles has missed a visible commitment yet."
        />
      )}
    </Screen>
  );
}
