import { router } from "expo-router";
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
import { getCommitmentHistory } from "../../features/profile/api";
import { qk } from "../../lib/query";
import { dateLabel, timeLabel } from "../../lib/date";
import { colors } from "../../theme/tokens";

export default function HistoryScreen() {
  const query = useQuery({
    queryKey: qk.history,
    queryFn: getCommitmentHistory,
  });

  const history = (query.data ?? []).filter((item) => {
    const resolved = [
      "verified",
      "missed",
      "redeemed",
      "rejected",
      "excused",
    ].includes(item.status);

    return resolved && (!item.isRedemption || item.status === "verified");
  });

  return (
    <Screen>
      <Header
        title="Workout history"
        subtitle="Your full record. Redemptions never erase misses."
      />

      {query.isLoading ? (
        <Loading />
      ) : history.length ? (
        history.map((item) => (
          <Card key={item.id}>
            <StatusPill
              status={item.isRedemption ? "redemption verified" : item.status}
            />
            <Text variant="section">{item.title}</Text>
            <Text style={{ color: colors.textSecondary }}>
              {dateLabel(item.deadline_at)} · {timeLabel(item.deadline_at)}
            </Text>
          </Card>
        ))
      ) : (
        <EmptyState
          title="No history yet"
          body="Completed and missed commitments will appear here."
        />
      )}

      <Button title="Done" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
