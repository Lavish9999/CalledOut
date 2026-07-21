import { useCallback } from "react";
import { Pressable, View } from "react-native";
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
import { getCircles } from "../../features/circles/api";
import { qk } from "../../lib/query";
import { colors, spacing } from "../../theme/tokens";

export default function Circles() {
  const query = useQuery({ queryKey: qk.circles, queryFn: getCircles });

  const refetchCircles = query.refetch;

  useFocusEffect(
    useCallback(() => {
      refetchCircles();
    }, [refetchCircles]),
  );

  return (
    <Screen>
      <Header
        title="Circles"
        subtitle="Private accountability groups by default."
      />

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Create" onPress={() => router.push("/circle/new")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Join code"
            variant="secondary"
            onPress={() => router.push("/circle/join")}
          />
        </View>
      </View>

      {query.isLoading ? (
        <Loading />
      ) : query.data?.length ? (
        query.data.map((circle) => (
          <Pressable
            key={circle.id}
            accessibilityRole="button"
            onPress={() => router.push(`/circle/${circle.id}` as never)}
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
                <Text variant="section" style={{ flex: 1 }}>
                  {circle.icon} {circle.name}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              </View>
              <Text style={{ color: colors.textSecondary }}>
                {circle.description ?? "No description"}
              </Text>
              <Text variant="label">
                {circle.role?.toUpperCase()} · {circle.member_count ?? 0}/
                {circle.member_limit} MEMBERS
              </Text>
            </Card>
          </Pressable>
        ))
      ) : (
        <EmptyState
          title="No circle yet"
          body="Continue solo or invite people who will notice when you disappear."
        />
      )}
    </Screen>
  );
}
