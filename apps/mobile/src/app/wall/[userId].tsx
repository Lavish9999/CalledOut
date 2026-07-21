import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import {
  Button,
  Card,
  EmptyState,
  Header,
  Loading,
  Screen,
  StatusPill,
  Text,
} from "../../components/ui";
import { getMemberWall } from "../../features/wall/api";
import { qk } from "../../lib/query";
import { dateLabel } from "../../lib/date";
import { colors } from "../../theme/tokens";

export default function WallMemberScreen() {
  const { userId, circleId } = useLocalSearchParams<{
    userId: string;
    circleId: string;
  }>();

  const query = useQuery({
    queryKey: qk.wallMember(userId, circleId),
    queryFn: () => getMemberWall(userId, circleId),
    enabled: Boolean(userId && circleId),
  });

  if (query.isLoading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (query.error || !query.data) {
    return (
      <Screen>
        <Header title="Wall history unavailable" />
        <EmptyState
          title="Could not load this history"
          body={query.error?.message ?? "Please try again."}
        />
      </Screen>
    );
  }

  const { profile, misses } = query.data;

  return (
    <Screen>
      <Header
        title={profile.display_name}
        subtitle={`@${profile.username} · ${misses.length} missed`}
      />

      {misses.map((miss) => {
        const redemptionStatus = miss.redemption?.status;
        const label =
          redemptionStatus === "completed"
            ? "redeemed"
            : redemptionStatus === "in_progress"
              ? "redeeming"
              : redemptionStatus === "expired"
                ? "expired"
                : redemptionStatus === "available"
                  ? "redemption available"
                  : "missed";

        return (
          <Card key={miss.id}>
            <StatusPill status={label} />
            <Text variant="section">
              {miss.commitment?.title ?? "Commitment"}
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              Missed {dateLabel(miss.missed_at)}
            </Text>
            {miss.redemption?.completed_at ? (
              <Text variant="bodyStrong" style={{ color: colors.verified }}>
                Redeemed {dateLabel(miss.redemption.completed_at)}
              </Text>
            ) : null}
          </Card>
        );
      })}

      {!misses.length ? (
        <EmptyState
          title="No misses"
          body="There is nothing on this record yet."
        />
      ) : null}

      <Button title="Done" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
