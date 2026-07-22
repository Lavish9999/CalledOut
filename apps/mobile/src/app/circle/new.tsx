import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button, Card, Field, Header, Screen, Text } from "../../components/ui";
import { createCircle } from "../../features/circles/api";
import { getPlanOverview } from "../../features/subscription/api";
import { queryClient, qk } from "../../lib/query";
import { analytics } from "../../lib/analytics";
import { colors, radius, spacing } from "../../theme/tokens";

const ICONS = ["◉", "⚡", "🏋️", "🔥", "🏃", "🎯"];

export default function NewCircle() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const planQuery = useQuery({ queryKey: qk.plan, queryFn: getPlanOverview });

  const mutation = useMutation({
    mutationFn: () =>
      createCircle({
        name: name.trim(),
        description: description.trim(),
        rules: rules.trim(),
        icon,
      }),
    onSuccess: async (circleId) => {
      analytics.capture("circle_created");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.circles }),
        queryClient.invalidateQueries({ queryKey: qk.plan }),
      ]);
      router.replace(`/circle/${circleId}` as never);
    },
  });

  const memberLimit = planQuery.data?.memberLimit ?? 8;

  return (
    <Screen>
      <Header
        eyebrow="PRIVATE BY DEFAULT"
        title="Create a circle"
        subtitle="Build a small accountability team where promises and misses are visible."
        backLabel="Circles"
        onBack={router.back}
      />

      <Card style={{ backgroundColor: colors.dark, borderColor: colors.dark }}>
        <Text variant="section" style={{ color: colors.surface }}>
          Who will notice when you disappear?
        </Text>
        <Text style={{ color: colors.surfaceMuted }}>
          Members can see circle commitments, verification results, The Wall, and redemptions.
        </Text>
      </Card>

      <View style={{ gap: spacing.sm }}>
        <Text variant="caption">Circle icon</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {ICONS.map((option) => {
            const active = icon === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                onPress={() => setIcon(option)}
                style={({ pressed }) => ({
                  width: 52,
                  height: 52,
                  borderRadius: radius.md,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? colors.dark : colors.border,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text variant="section">{option}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Field
        label="Circle name"
        placeholder="Big Backs"
        value={name}
        onChangeText={setName}
        maxLength={60}
        error={
          name.length > 0 && name.trim().length < 2
            ? "Use at least 2 characters."
            : undefined
        }
      />

      <Field
        label="What is this group holding each other to?"
        placeholder="We train four days a week and do not disappear without saying something."
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={300}
      />

      <Field
        label="Circle rules (optional)"
        placeholder="Fresh proof only. No insulting comments. Redemption never erases a miss."
        value={rules}
        onChangeText={setRules}
        multiline
        maxLength={1000}
      />

      <Card style={{ backgroundColor: colors.surfaceMuted }}>
        <Text variant="bodyStrong">Private circle · up to {memberLimit} members</Text>
        <Text style={{ color: colors.textSecondary }}>
          You will receive a private invite code after creation. Only active members can see this circle.
        </Text>
      </Card>

      {mutation.error ? (
        <Text style={{ color: colors.missed }}>{mutation.error.message}</Text>
      ) : null}

      <Button
        title="Create private circle"
        loading={mutation.isPending}
        disabled={name.trim().length < 2}
        onPress={() => mutation.mutate()}
      />
    </Screen>
  );
}
