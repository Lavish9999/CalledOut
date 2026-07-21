import { useState } from "react";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Button, Field, Header, Screen, Text } from "../../components/ui";
import { createCircle } from "../../features/circles/api";
import { queryClient, qk } from "../../lib/query";
import { analytics } from "../../lib/analytics";
import { colors } from "../../theme/tokens";
export default function NewCircle() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const m = useMutation({
    mutationFn: () => createCircle({ name, description }),
    onSuccess: async () => {
      analytics.capture("circle_created");
      await queryClient.invalidateQueries({ queryKey: qk.circles });
      router.back();
    },
  });
  return (
    <Screen>
      <Header
        title="Create a circle"
        subtitle="Invite-only, eight members maximum on Free."
      />
      <Field label="Circle name" value={name} onChangeText={setName} />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      {m.error ? (
        <Text style={{ color: colors.missed }}>{m.error.message}</Text>
      ) : null}
      <Button
        title="Create private circle"
        loading={m.isPending}
        disabled={name.trim().length < 2}
        onPress={() => m.mutate()}
      />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
