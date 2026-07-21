import { useState } from "react";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Button, Field, Header, Screen, Text } from "../../components/ui";
import { createRecurringCommitment } from "../../features/commitments/api";
import { queryClient, qk } from "../../lib/query";
import { analytics } from "../../lib/analytics";
import { colors } from "../../theme/tokens";
export default function NewCommitment() {
  const [title, setTitle] = useState("Workout");
  const [minutes, setMinutes] = useState("30");
  const [hour, setHour] = useState("20");
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: () =>
      createRecurringCommitment({
        title,
        workout_type: "gym",
        days_of_week: [new Date().getDay()],
        deadline_hour: Number(hour),
        minimum_duration_minutes: Number(minutes),
        proof_method: "live_photo",
        requires_location: false,
      }),
    onSuccess: async () => {
      analytics.capture("commitment_created", { recurring: true });
      await queryClient.invalidateQueries({ queryKey: qk.today });
      router.back();
    },
    onError: (e) => setError(e.message),
  });
  return (
    <Screen>
      <Header
        title="Make the promise"
        subtitle="Today and future matching weekdays. Once the proof window opens, edits are locked."
      />
      <Field label="Workout title" value={title} onChangeText={setTitle} />
      <Field
        label="Minimum duration"
        value={minutes}
        onChangeText={setMinutes}
        keyboardType="number-pad"
      />
      <Field
        label="Deadline hour (0–23)"
        value={hour}
        onChangeText={setHour}
        keyboardType="number-pad"
      />
      {error ? <Text style={{ color: colors.missed }}>{error}</Text> : null}
      <Button
        title="Create commitment"
        loading={m.isPending}
        disabled={!title || Number(minutes) < 1 || Number(hour) > 23}
        onPress={() => m.mutate()}
      />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
