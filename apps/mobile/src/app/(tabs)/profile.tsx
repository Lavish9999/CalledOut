import { useCallback } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import {
  Button,
  Card,
  Header,
  Loading,
  Metric,
  Screen,
  SectionHeader,
  Text,
} from "../../components/ui";
import { getProfileRecord } from "../../features/profile/api";
import { qk } from "../../lib/query";
import { useSession } from "../../providers/session";
import { colors, spacing } from "../../theme/tokens";

export default function Profile() {
  const { profile } = useSession();
  const recordQuery = useQuery({
    queryKey: qk.record,
    queryFn: getProfileRecord,
  });

  const refetchRecord = recordQuery.refetch;

  useFocusEffect(
    useCallback(() => {
      refetchRecord();
    }, [refetchRecord]),
  );

  const record = recordQuery.data;

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
      {recordQuery.isLoading ? (
        <Loading />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Metric
              value={`${Math.round(record?.completionRate ?? 0)}%`}
              label="completion"
            />
            <Metric value={record?.currentStreak ?? 0} label="current streak" />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Metric value={record?.missed ?? 0} label="misses" />
            <Metric
              value={record?.redemptionsCompleted ?? 0}
              label="redemptions"
            />
          </View>
          <Card>
            <Text variant="bodyStrong">
              {record?.completed ?? 0} of {record?.scheduled ?? 0} scheduled
              commitments completed
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              Redemption does not erase a miss or inflate your completion rate.
            </Text>
          </Card>
        </>
      )}

      <Button
        title="Workout history"
        variant="secondary"
        onPress={() => router.push("/profile/history")}
      />
      <Button title="CalledOut Pro" onPress={() => router.push("/paywall")} />
      <Button
        title="Settings & privacy"
        variant="secondary"
        onPress={() => router.push("/settings")}
      />
    </Screen>
  );
}
