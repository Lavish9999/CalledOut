import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import { Button, Card, Field, Header, Screen, Text } from "../../components/ui";
import { joinCircle } from "../../features/circles/api";
import { queryClient, qk } from "../../lib/query";
import { analytics } from "../../lib/analytics";
import { colors } from "../../theme/tokens";

function normalizeCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
}

export default function Join() {
  const params = useLocalSearchParams<{ code?: string }>();
  const initialCode = normalizeCode(params.code ?? "");

  return <JoinForm key={initialCode} initialCode={initialCode} />;
}

function JoinForm({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);

  const mutation = useMutation({
    mutationFn: () => joinCircle(code),
    onSuccess: async (circleId) => {
      analytics.capture("circle_joined");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.circles }),
        queryClient.invalidateQueries({ queryKey: qk.plan }),
      ]);
      router.replace(`/circle/${circleId}` as never);
    },
  });

  return (
    <Screen>
      <Header
        eyebrow="INVITE ONLY"
        title="Join a circle"
        subtitle="Enter the private eight-character code shared by a circle owner or moderator."
        backLabel="Circles"
        onBack={router.back}
      />

      <Card style={{ backgroundColor: colors.surfaceMuted }}>
        <Text variant="bodyStrong">Know what becomes visible</Text>
        <Text style={{ color: colors.textSecondary }}>
          Circle members can see commitments attached to the group, proof outcomes, misses, redemptions, and your circle standing.
        </Text>
      </Card>

      <Field
        label="Invite code"
        placeholder="AB12CD34"
        value={code}
        onChangeText={(value) => setCode(normalizeCode(value))}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        error={
          code.length > 0 && code.length !== 8
            ? "Enter all 8 characters."
            : undefined
        }
      />

      {mutation.error ? (
        <Text style={{ color: colors.missed }}>{mutation.error.message}</Text>
      ) : null}

      <Button
        title="Join circle"
        loading={mutation.isPending}
        disabled={code.length !== 8}
        onPress={() => mutation.mutate()}
      />
    </Screen>
  );
}
