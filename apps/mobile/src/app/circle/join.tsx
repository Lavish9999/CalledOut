import { useState } from "react";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Button, Field, Header, Screen, Text } from "../../components/ui";
import { joinCircle } from "../../features/circles/api";
import { queryClient, qk } from "../../lib/query";
import { analytics } from "../../lib/analytics";
import { colors } from "../../theme/tokens";
export default function Join() {
  const [code, setCode] = useState("");
  const m = useMutation({
    mutationFn: () => joinCircle(code),
    onSuccess: async () => {
      analytics.capture("circle_joined");
      await queryClient.invalidateQueries({ queryKey: qk.circles });
      router.back();
    },
  });
  return (
    <Screen>
      <Header title="Join a circle" subtitle="Enter the private invite code." />
      <Field
        label="Invite code"
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        autoCapitalize="characters"
        maxLength={10}
      />
      {m.error ? (
        <Text style={{ color: colors.missed }}>{m.error.message}</Text>
      ) : null}
      <Button
        title="Join circle"
        loading={m.isPending}
        disabled={code.length < 6}
        onPress={() => m.mutate()}
      />
    </Screen>
  );
}
