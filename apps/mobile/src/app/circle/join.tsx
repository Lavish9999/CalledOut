import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import { Button, Card, Field, Header, Screen, Text } from "../../components/ui";
import { joinCircle } from "../../features/circles/api";
import { queryClient, qk } from "../../lib/query";
import { analytics } from "../../lib/analytics";
import { colors } from "../../theme/tokens";

function normalizeCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 16);
}

function validCode(value: string) {
  return value.length === 8 || value.length === 16;
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
        subtitle="Enter the private code shared by a circle owner or moderator. New invite codes use 16 characters."
        backLabel="Circles"
        onBack={router.back}
      />

      <Card style={{ backgroundColor: colors.surfaceMuted }}>
        <Text variant="bodyStrong">Know what becomes visible</Text>
        <Text style={{ color: colors.textSecondary }}>
          Circle members can see commitments attached to the group, proof outcomes,
          misses, redemptions, and your circle standing.
        </Text>
      </Card>

      <Field
        label="Invite code"
        placeholder="AB12CD34EF56GH78"
        value={code}
        onChangeText={(value) => setCode(normalizeCode(value))}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={16}
        error={
          code.length > 0 && !validCode(code)
            ? "Enter the complete invite code."
            : undefined
        }
      />

      {mutation.error ? (
        <Text style={{ color: colors.missed }}>{mutation.error.message}</Text>
      ) : null}

      <Button
        title="Join circle"
        loading={mutation.isPending}
        disabled={!validCode(code)}
        onPress={() => mutation.mutate()}
      />
    </Screen>
  );
}
